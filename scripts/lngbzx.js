const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { execFile } = require('child_process');

// 配置信息
const TARGET_URL = 'https://zyjs.lngbzx.gov.cn/pc/index.html#/';
const USERNAME = 'LNrtv002180';
const PASSWORD = 'Magic1987';
const MAX_AUTO_RETRIES = 5; // 自动 OCR 重试上限设为 5 次

const resultsDir = path.join(__dirname, '../results');
const cookiePath = path.join(resultsDir, 'lngbzx_cookies.json');

// 确保 results 目录存在
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 清洗并放大验证码图像（在浏览器 context 中运行）
// aggressive=true:  高强度去噪 (默认)
// aggressive=false: 保守过滤，保留更多细节 (自调优二次尝试用)
// 返回 { fullImage, segmentDataUrls }
async function cleanCaptchaInPage(page, aggressive = true) {
  return await page.evaluate((aggressive) => {
    const img = document.querySelector('img.image');
    if (!img) return { fullImage: null, segmentDataUrls: [] };

    const scale = 3;
    const rawWidth = img.naturalWidth || img.width || 120;
    const rawHeight = img.naturalHeight || img.height || 40;

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = rawWidth;
    srcCanvas.height = rawHeight;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(img, 0, 0);
    const imgData = srcCtx.getImageData(0, 0, rawWidth, rawHeight);
    const data = imgData.data;

    // 根据模式切换阈值
    const diffMin = aggressive ? 35 : 25;
    const avgMax = aggressive ? 190 : 210;
    const brightMax = aggressive ? 200 : 220;
    const noiseThresh = aggressive ? 7 : 8;

    const grid = [];
    for (let y = 0; y < rawHeight; y++) {
      grid[y] = new Uint8Array(rawWidth);
      for (let x = 0; x < rawWidth; x++) {
        const idx = (y * rawWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;
        const avg = (r + g + b) / 3;

        const isGreyOrLight = diff < diffMin || avg > avgMax || max > brightMax;
        const isMagentaLine = (r > 80 && b > 80 && g < 140);

        if (isGreyOrLight || isMagentaLine) {
          grid[y][x] = 1;
        } else {
          grid[y][x] = 0;
        }
      }
    }

    const cleaned = [];
    for (let y = 0; y < rawHeight; y++) {
      cleaned[y] = new Uint8Array(grid[y]);
    }

    for (let y = 1; y < rawHeight - 1; y++) {
      for (let x = 1; x < rawWidth - 1; x++) {
        if (grid[y][x] === 0) {
          let whiteNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              if (grid[y + dy][x + dx] === 1) whiteNeighbors++;
            }
          }
          if (whiteNeighbors >= noiseThresh) {
            cleaned[y][x] = 1;
          }
        }
      }
    }

    const destCanvas = document.createElement('canvas');
    destCanvas.width = rawWidth * scale;
    destCanvas.height = rawHeight * scale;
    const destCtx = destCanvas.getContext('2d');

    destCtx.fillStyle = '#FFFFFF';
    destCtx.fillRect(0, 0, destCanvas.width, destCanvas.height);

    destCtx.fillStyle = '#000000';
    for (let y = 0; y < rawHeight; y++) {
      for (let x = 0; x < rawWidth; x++) {
        if (cleaned[y][x] === 0) {
          destCtx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }

    const result = { fullImage: destCanvas.toDataURL('image/png'), rawImage: srcCanvas.toDataURL('image/png'), segmentDataUrls: [] };

    // 垂直投影直方图 → 字符分割
    const projection = new Array(rawWidth).fill(0);
    for (let x = 0; x < rawWidth; x++) {
      for (let y = 0; y < rawHeight; y++) {
        if (cleaned[y][x] === 0) projection[x]++;
      }
    }

    const gapThreshold = Math.max(1, rawHeight * 0.05);
    const gaps = [];
    let inGap = false, gapStart = -1;
    for (let x = 0; x < rawWidth; x++) {
      if (projection[x] < gapThreshold) {
        if (!inGap) { inGap = true; gapStart = x; }
      } else {
        if (inGap && gapStart >= 0) {
          gaps.push({ start: gapStart, end: x - 1 });
          inGap = false; gapStart = -1;
        }
      }
    }
    if (inGap && gapStart >= 0) gaps.push({ start: gapStart, end: rawWidth - 1 });

    const regions = [];
    let prevEnd = 0;
    for (const gap of gaps) {
      if (gap.start > prevEnd) regions.push({ start: prevEnd, end: gap.start });
      prevEnd = gap.end + 1;
    }
    if (prevEnd < rawWidth) regions.push({ start: prevEnd, end: rawWidth });

    if (regions.length === 4) {
      for (const region of regions) {
        const segCanvas = document.createElement('canvas');
        const segWidth = region.end - region.start;
        segCanvas.width = segWidth * scale;
        segCanvas.height = rawHeight * scale;
        const segCtx = segCanvas.getContext('2d');

        segCtx.fillStyle = '#FFFFFF';
        segCtx.fillRect(0, 0, segCanvas.width, segCanvas.height);

        segCtx.fillStyle = '#000000';
        for (let y = 0; y < rawHeight; y++) {
          for (let x = region.start; x < region.end; x++) {
            if (cleaned[y][x] === 0) {
              segCtx.fillRect((x - region.start) * scale, y * scale, scale, scale);
            }
          }
        }

        result.segmentDataUrls.push(segCanvas.toDataURL('image/png'));
      }
    }

    return result;
  }, aggressive);
}

const OCR_SCRIPT = path.join(__dirname, 'lngbzx_ocr.py');
const VENV_PYTHON = path.join(__dirname, '../ocr_env/bin/python3');

function execOcr(args, timeoutMs = 15000) {
  const pythonBin = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
  return new Promise((resolve, reject) => {
    execFile(pythonBin, [OCR_SCRIPT, ...args], { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stdout.trim() || stderr.trim() || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// 混合 OCR 识别引擎
// imagePath: 清洗后保存到本地的验证码图片路径
// segmentUrls: 按垂直投影分割出的 4 张单字符图 (base64 dataURL)，用于逐位识别
// rawImagePath: 未经二值化清洗的原始验证码图片路径 (ddddocr 首选)
async function recognizeCaptcha(imagePath, segmentUrls = [], rawImagePath = null) {

  // ── 优先方案 0: 原始图片 ddddocr / OCR 识别 ──
  if (rawImagePath && fs.existsSync(rawImagePath)) {
    try {
      const result = await execOcr([rawImagePath, 'full']);
      if (result && result.length === 4 && /^\d{4}$/.test(result)) {
        console.log(`[lngbzx.js] 本地 OCR (原图模式) 识别成功: ${result}`);
        return result;
      }
    } catch (err) {
      console.warn(`[lngbzx.js] 本地 OCR (原图模式) 未识别出有效4位数字`);
    }
  }

  // ── 方案 1: 清洗后整图识别 ──
  if (imagePath && fs.existsSync(imagePath)) {
    try {
      const result = await execOcr([imagePath, 'full']);
      if (result && result.length === 4 && /^\d{4}$/.test(result)) {
        console.log(`[lngbzx.js] 本地 OCR (清洗整图) 识别成功: ${result}`);
        return result;
      }
    } catch (err) {
      console.warn(`[lngbzx.js] 本地 OCR (清洗整图) 未识别出有效4位数字`);
    }
  }

  // ── 方案 2: 逐位 OCR — 垂直投影分割后的单字符 PaddleOCR 识别 ──
  if (segmentUrls && segmentUrls.length === 4) {
    const segFiles = [];
    try {
      for (let i = 0; i < segmentUrls.length; i++) {
        const segPath = path.join(resultsDir, `captcha_seg_${Date.now()}_${i}.png`);
        const segBase64 = segmentUrls[i].replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(segPath, segBase64, 'base64');
        segFiles.push(segPath);
      }

      const result = await execOcr([imagePath, 'segments', ...segFiles]);
      if (result && result.length === 4 && /^\d{4}$/.test(result)) {
        console.log(`[lngbzx.js] 本地 PaddleOCR 逐位分割识别成功: ${result}`);
        return result;
      }
    } catch (err) {
      console.warn(`[lngbzx.js] 本地 PaddleOCR 逐位分割识别失败: ${err.message}`);
    } finally {
      segFiles.forEach(f => { try { fs.unlinkSync(f); } catch (_) { } });
    }
  }

  return null;
}

// 终端手动输入验证码（作为降级方案）
function askManualCaptcha() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question('[lngbzx.js] 请打开 results/captcha.png 查看验证码并在此处输入: ', answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// 终端交互询问用户：是否选课，选课则直接拽入选课文件，不选课直接回车 (倒计时 30 秒无输入自动跳过)
function askCourseFileOrSkip(promptMsg = '是否选课，选课则直接拽入选课文件，不选课直接回车(30秒无输入自动跳过): ', timeoutMs = 30000) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        rl.close();
        console.log('\n⏱️ [超时 30 秒未接收到输入，默认按回车跳过选课，继续执行自动学习流程]');
        resolve('');
      }
    }, timeoutMs);

    rl.question(promptMsg, answer => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        rl.close();
        resolve(answer.trim());
      }
    });
  });
}

// 专门清洗 macOS / Windows 终端拖拽路径的助手函数 (彻底解决 zsh 转义空格、括号及引号)
function cleanDraggedFilePath(inputPath) {
  if (!inputPath) return '';
  let str = inputPath.trim();

  // 1. 去除首尾单双引号
  str = str.replace(/^['"]|['"]$/g, '').trim();

  // 若路径直接存在，无须额外处理
  if (fs.existsSync(str)) return str;

  // 2. 还原 macOS zsh 终端拖拽产生的反斜杠转义 (如 \ , \(, \), \[, \], \&, \', \", \\)
  const unescaped = str.replace(/\\(.)/g, '$1');
  if (fs.existsSync(unescaped)) return unescaped;

  // 3. 处理 URL 编码路径 (%E9%80%89%E8%AF%BE)
  if (str.includes('%')) {
    try {
      const decoded = decodeURIComponent(str);
      if (fs.existsSync(decoded)) return decoded;
    } catch (e) { }
  }
  if (unescaped.includes('%')) {
    try {
      const decoded = decodeURIComponent(unescaped);
      if (fs.existsSync(decoded)) return decoded;
    } catch (e) { }
  }

  return unescaped;
}

const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const AdmZip = require('adm-zip');

// 设置 Mac 终端标准输出与输入流为 UTF-8 编码
if (process.stdout && process.stdout.setEncoding) process.stdout.setEncoding('utf8');
if (process.stdin && process.stdin.setEncoding) process.stdin.setEncoding('utf8');

// 专门解析 Word 文档 (.docx / .doc) 内表格的解析函数
async function readDocxToWorkbook(cleanPath) {
  // 1. 优先尝试使用 mammoth 将 docx 转换为 HTML 并提取所有表格
  try {
    const result = await mammoth.convertToHtml({ path: cleanPath });
    const html = result.value;
    if (html && html.includes('<table')) {
      const sheetNames = [];
      const sheets = {};
      const tableRegex = /<table[\s\S]*?<\/table>/g;
      let tableMatch;
      let tableIdx = 0;

      while ((tableMatch = tableRegex.exec(html)) !== null) {
        tableIdx++;
        const tableHtml = tableMatch[0];
        const rows = [];
        const trRegex = /<tr[\s\S]*?<\/tr>/g;
        let trMatch;

        while ((trMatch = trRegex.exec(tableHtml)) !== null) {
          const trHtml = trMatch[0];
          const cells = [];
          const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
          let tdMatch;

          while ((tdMatch = tdRegex.exec(trHtml)) !== null) {
            const rawCellText = tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
            cells.push(rawCellText);
          }
          if (cells.length > 0) rows.push(cells);
        }

        if (rows.length > 0) {
          const sheetName = `Word表格 ${tableIdx}`;
          sheetNames.push(sheetName);
          sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
        }
      }

      if (sheetNames.length > 0) {
        console.log(`[选课] 成功从 Word (.docx) 解析出 ${sheetNames.length} 个表格 (Mammoth 引擎)`);
        return { SheetNames: sheetNames, Sheets: sheets };
      }
    }
  } catch (err) {
    console.warn(`[选课] Mammoth 引擎解析 Word 异常 (${err.message})，转入底层 XML 提取...`);
  }

  // 2. 备用尝试使用 AdmZip 解压 word/document.xml 提取 <w:tbl>
  try {
    const zip = new AdmZip(cleanPath);
    const xml = zip.readAsText('word/document.xml');
    if (xml && xml.includes('<w:tbl')) {
      const sheetNames = [];
      const sheets = {};
      const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
      let match;
      let tableIdx = 0;

      while ((match = tblRegex.exec(xml)) !== null) {
        tableIdx++;
        const tblXml = match[0];
        const rows = [];
        const trRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
        let trMatch;

        while ((trMatch = trRegex.exec(tblXml)) !== null) {
          const trXml = trMatch[0];
          const cells = [];
          const tcRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
          let tcMatch;

          while ((tcMatch = tcRegex.exec(trXml)) !== null) {
            const tcXml = tcMatch[0];
            const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
            let cellText = '';
            let tMatch;
            while ((tMatch = textRegex.exec(tcXml)) !== null) {
              cellText += tMatch[1];
            }
            cells.push(cellText.trim());
          }
          if (cells.length > 0) rows.push(cells);
        }

        if (rows.length > 0) {
          const sheetName = `Word表格 ${tableIdx}`;
          sheetNames.push(sheetName);
          sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows);
        }
      }

      if (sheetNames.length > 0) {
        console.log(`[选课] 成功从 Word (.docx) 解析出 ${sheetNames.length} 个表格 (AdmZip XML 引擎)`);
        return { SheetNames: sheetNames, Sheets: sheets };
      }
    }
  } catch (zipErr) {
    console.warn(`[选课] AdmZip XML 引擎解析 Word 异常: ${zipErr.message}`);
  }

  return null;
}

// 多重保障自动感知文件编码并读取为 XLSX Workbook
async function readFileToWorkbook(cleanPath) {
  const errors = [];
  const ext = path.extname(cleanPath).toLowerCase();

  // 读取文件并识别格式
  const buf = fs.readFileSync(cleanPath);
  const magic = Array.from(buf.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`[选课] 文件大小: ${buf.length} bytes, 前8字节: ${magic}, 扩展名: ${ext}`);

  // 0. 判断是否为 Word 文档 (.docx / .doc)
  const isDocx = ext === '.docx' || ext === '.doc';
  let isDocxZip = false;
  if (buf[0] === 0x50 && buf[1] === 0x4B) {
    try {
      const zipTest = new AdmZip(cleanPath);
      if (zipTest.getEntry('word/document.xml')) {
        isDocxZip = true;
      }
    } catch (e) { }
  }

  if (isDocx || isDocxZip) {
    try {
      const docxWb = await readDocxToWorkbook(cleanPath);
      if (docxWb && docxWb.SheetNames && docxWb.SheetNames.length > 0) {
        return docxWb;
      }
      errors.push('Word 文档中未发现任何有效表格数据');
    } catch (docxErr) {
      errors.push(`Word 引擎解析异常: ${docxErr.message}`);
    }
  }

  const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B;               // ZIP magic (.xlsx)
  const isXls = buf[0] === 0xD0 && buf[1] === 0xCF;               // OLE2 magic (.xls)
  const isCsv = ext === '.csv' || (!isXlsx && !isXls);
  const bookType = isXls ? 'xls' : (isXlsx ? 'xlsx' : undefined);

  // 1. XLSX.readFile (显式 bookType)
  try {
    const opts = { raw: false, cellDates: false };
    if (bookType) opts.bookType = bookType;
    if (isCsv) opts.type = 'csv';
    const wb = XLSX.readFile(cleanPath, opts);
    if (wb && wb.SheetNames && wb.SheetNames.length > 0) {
      console.log(`[选课] 方法1 XLSX.readFile 成功 (bookType: ${bookType || 'auto'}, ${wb.SheetNames.length} 表格)`);
      return wb;
    }
    errors.push(`XLSX.readFile 返回空 (bookType: ${bookType || 'auto'})`);
  } catch (e) { errors.push(`XLSX.readFile 异常: ${e.message}`); }

  // 2. Buffer 模式 XLSX.read (显式 type + bookType)
  try {
    const opts = { type: 'buffer' };
    if (bookType) opts.bookType = bookType;
    if (isCsv) opts.type = 'string';
    const wb = XLSX.read(buf, opts);
    if (wb && wb.SheetNames && wb.SheetNames.length > 0) {
      console.log(`[选课] 方法2 XLSX.read(buffer) 成功 (bookType: ${bookType || 'auto'}, ${wb.SheetNames.length} 表格)`);
      return wb;
    }
    errors.push(`XLSX.read(buffer) 返回空 (bookType: ${bookType || 'auto'})`);
  } catch (e) { errors.push(`XLSX.read(buffer) 异常: ${e.message}`); }

  // 3. 文本文件编码解析 (仅 CSV / 纯文本)
  if (isCsv) {
    try {
      let textBuf = buf;
      if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) textBuf = buf.slice(3);
      const detected = jschardet.detect(textBuf);
      let encoding = (detected && detected.encoding) ? detected.encoding.toLowerCase() : 'utf-8';
      if (encoding.includes('gb') || encoding.includes('windows') || encoding.includes('ansi') || encoding.includes('ascii')) {
        encoding = 'gbk';
      }
      const str = iconv.decode(textBuf, encoding);
      const wb = XLSX.read(str, { type: 'string' });
      if (wb && wb.SheetNames && wb.SheetNames.length > 0) {
        console.log(`[选课] 方法3 编码解析成功 (编码: ${encoding}, ${wb.SheetNames.length} 表格)`);
        return wb;
      }
      errors.push(`编码解析未产出表格 (编码: ${encoding}, 文本长度: ${str.length})`);
    } catch (e) { errors.push(`编码解析异常: ${e.message}`); }
  }

  // 4. ExcelJS (eachSheet + 兜底 buffer read)
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(cleanPath);
    } catch (_) {
      await workbook.xlsx.load(buf);
    }

    const sheetNames = [];
    const sheets = {};
    workbook.eachSheet(ws => {
      sheetNames.push(ws.name);
      const rows = [];
      ws.eachRow({ includeEmpty: false }, row => {
        const vals = [];
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          vals[colNumber - 1] = cell.value !== null && cell.value !== undefined ? cell.value : '';
        });
        if (vals.length > 0) rows.push(vals);
      });
      sheets[ws.name] = rows.length > 0 ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.aoa_to_sheet([]);
    });

    if (sheetNames.length > 0) {
      console.log(`[选课] 方法4 ExcelJS 成功 (${sheetNames.length} 表格)`);
      return { SheetNames: sheetNames, Sheets: sheets };
    }
    errors.push('ExcelJS 解析完成但无表格');
  } catch (e) { errors.push(`ExcelJS 异常: ${e.message}`); }

  console.error(`[选课] ❌ 全部 5 种解析方法均失败:`);
  errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
  throw new Error('无法识别该选课文件格式（请提供包含表格的 Word .docx 或 Excel .xlsx 文件）');
}

// 提取单元格文本值的辅助函数（完美消除不可见空白符与控制符）
function getCellValueString(cellValue) {
  if (cellValue === null || cellValue === undefined) return '';
  return String(cellValue).replace(/[\u00A0\uFEFF]/g, ' ').trim();
}

// 读取选课文件（包含若干个表格）并提取输出 “课程名称 + 主讲人”
async function processCourseFile(filePathInput) {
  const cleanPath = cleanDraggedFilePath(filePathInput);

  if (!cleanPath || !fs.existsSync(cleanPath)) {
    console.error(`❌ 选课文件不存在或路径无效！`);
    console.error(`   原始终端输入: "${filePathInput}"`);
    if (cleanPath && cleanPath !== filePathInput) {
      console.error(`   解析后尝试路径: "${cleanPath}"`);
    }
    return [];
  }

  const allCourses = [];
  console.log(`\n=================== 打开并读取选课文件: ${path.basename(cleanPath)} ===================`);

  try {
    const workbook = await readFileToWorkbook(cleanPath);
    console.log(`包含工作表(表格)数量: ${workbook.SheetNames.length}`);

    workbook.SheetNames.forEach((sheetName, sheetIdx) => {
      console.log(`\n📋 [表格 ${sheetIdx + 1}]: ${sheetName}`);

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // 专门校验提取的主讲人姓名是否合法 (严禁为纯数字、课时、学分、状态等)
      function isValidTeacherName(str) {
        if (!str) return false;
        const s = str.trim();
        if (!s || s === '未指定') return false;

        // 1. 过滤纯数字、小数、百分数 (如 40, 16.0, 100%)
        if (/^\d+(\.\d+)?%?$/.test(s)) return false;
        // 2. 过滤带单位的数字 (如 16学时, 40课时, 2学分, 120分钟, 1.5小时)
        if (/^\d+(\.\d+)?[学课]?[时分秒积分]?$/.test(s)) return false;

        // 3. 过滤常见非教师名字关键字
        if (
          s.includes('课时') || s.includes('学时') || s.includes('学分') || s.includes('分钟') ||
          s.includes('小时') || s.includes('分值') || s.includes('序号') || s.includes('编号') ||
          s.includes('简介') || s.includes('介绍') || s.includes('状态') || s.includes('类型') ||
          s.includes('选修') || s.includes('必修') || s.includes('类别') || s.includes('备注') ||
          s.includes('学期') || s.includes('时间') || s.includes('日期') || s.includes('课程') ||
          s.includes('学段') || s.includes('学科')
        ) {
          return false;
        }

        return true;
      }

      // 1. 全局精准定位表头列索引 (处理 序号、课程名称、主讲人、主讲人简介 等列)
      let courseColIdx = -1;
      let teacherColIdx = -1;
      let headerRowIdx = -1;
      let sheetCourseCount = 0;

      // 扫描前 5 行寻找表头
      for (let r = 0; r < Math.min(rows.length, 5); r++) {
        const rowValues = rows[r];
        if (!Array.isArray(rowValues)) continue;

        for (let c = 0; c < rowValues.length; c++) {
          const str = getCellValueString(rowValues[c]);
          if (!str) continue;

          // 识别“课程名称”列 (严禁识别为“序号”、“编号”、“简介”)
          if (
            courseColIdx === -1 &&
            (str.includes('课程名称') || str.includes('课程名') || str === '课程' || str === '科目' || str === '课程题目') &&
            !str.includes('序号') && !str.includes('编号') && !str.includes('ID') && !str.includes('简介')
          ) {
            courseColIdx = c;
            headerRowIdx = r;
          }

          // 识别“主讲人”列 (匹配 教师、讲师、主讲、授课、专家、报告人 等，严禁识别为“简介”、“课时”、“学分”)
          if (
            (str.includes('主讲人') || str.includes('讲师') || str.includes('教师') || str.includes('主讲') || str.includes('授课') || str.includes('专家') || str.includes('报告人') || str.includes('嘉宾')) &&
            !str.includes('简介') && !str.includes('介绍') && !str.includes('履历') && !str.includes('背景') && !str.includes('详情') && !str.includes('概况') &&
            !str.includes('课时') && !str.includes('学时') && !str.includes('学分') && !str.includes('状态')
          ) {
            // 优先精确匹配“主讲人”、“主讲”、“讲师”、“教师”
            if (teacherColIdx === -1 || str === '主讲人' || str === '主讲' || str === '讲师' || str === '教师') {
              teacherColIdx = c;
            }
          }
        }

        // 当完整扫描完当前行的所有列后，如果找到课程名称列，完成表头定位
        if (courseColIdx !== -1) {
          // 若当前表头行未找到“主讲人”列关键字，寻找邻列非课时/学分/简介的列
          if (teacherColIdx === -1 && courseColIdx + 1 < rowValues.length) {
            const nextHeader = getCellValueString(rowValues[courseColIdx + 1]);
            if (
              !nextHeader.includes('简介') && !nextHeader.includes('介绍') &&
              !nextHeader.includes('学分') && !nextHeader.includes('学时') &&
              !nextHeader.includes('课时') && !nextHeader.includes('状态')
            ) {
              teacherColIdx = courseColIdx + 1;
            }
          }
          break;
        }
      }

      // 2. 兜底方案：如果前 5 行没能匹配到包含“课程名称”字样的表头，智能挑选非“序号/编号”的首列作为课程名称
      if (courseColIdx === -1) {
        for (let r = 0; r < Math.min(rows.length, 3); r++) {
          const rowValues = rows[r];
          if (!Array.isArray(rowValues)) continue;
          for (let c = 0; c < rowValues.length; c++) {
            const str = getCellValueString(rowValues[c]);
            if (str && !str.includes('序号') && !str.includes('编号') && !str.includes('NO') && !str.includes('No') && !/^\d+$/.test(str)) {
              courseColIdx = c;
              headerRowIdx = r;
              break;
            }
          }
          if (courseColIdx !== -1) break;
        }
      }

      // 3. 提取数据行 (跳过表头行及无效空行/标题行)
      const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

      for (let r = startRow; r < rows.length; r++) {
        const rowValues = rows[r];
        if (!Array.isArray(rowValues) || rowValues.length === 0) continue;

        const courseName = courseColIdx !== -1 ? getCellValueString(rowValues[courseColIdx]) : '';
        let rawTeacherName = teacherColIdx !== -1 ? getCellValueString(rowValues[teacherColIdx]) : '';
        let teacherName = isValidTeacherName(rawTeacherName) ? rawTeacherName : '';

        // 数据行智能扫描：若主讲人提取到的值不合法（如课时数字、学分等），全行检索符合中文人名特征 (2-4字) 且非课时/学分的单元格
        if (!teacherName) {
          for (let c = 0; c < rowValues.length; c++) {
            if (c === courseColIdx) continue;
            const cellVal = getCellValueString(rowValues[c]);
            if (isValidTeacherName(cellVal) && cellVal.length >= 2 && cellVal.length <= 4 && /^[\u4e00-\u9fa5]+$/.test(cellVal)) {
              teacherName = cellVal;
              break;
            }
          }
        }

        // 过滤掉重复表头或“序号”、“课程名称”标题行
        if (
          courseName &&
          courseName !== '课程名称' &&
          courseName !== '课程名' &&
          courseName !== '课程' &&
          !courseName.includes('序号') &&
          !/^\d+$/.test(courseName)
        ) {
          sheetCourseCount++;
          allCourses.push({
            sheetName,
            courseName,
            teacherName: teacherName || '未指定'
          });
          console.log(`  📖 课程名称: ${courseName} | 👨‍🏫 主讲人: ${teacherName || '未指定'}`);
        }
      }

      console.log(`  └─ 该表格已输出 ${sheetCourseCount} 门课程信息。`);
    });

  } catch (err) {
    console.error(`❌ 解析选课文件失败: ${err.message}`);
  }

  console.log(`=================================================================\n🎉 选课文件全表格读取完成，共后台输出 ${allCourses.length} 门课程信息！\n`);
  return allCourses;
}

// 判断是否为网络连线重置/超时等可重试的 Puppeteer 网络错误
function isNetworkError(err) {
  if (!err || !err.message) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('net::err_') ||
    msg.includes('connection_reset') ||
    msg.includes('connection_refused') ||
    msg.includes('connection_timed_out') ||
    msg.includes('name_not_resolved') ||
    msg.includes('network_changed') ||
    msg.includes('internet_disconnected') ||
    msg.includes('empty_response') ||
    msg.includes('http2_protocol_error') ||
    msg.includes('navigation timeout') ||
    msg.includes('target closed') ||
    msg.includes('session closed') ||
    msg.includes('timeout')
  );
}

// 带有网络错误自动重试机制的 page.goto
async function gotoWithRetry(page, url, options = {}, maxRetries = 5, retryDelayMs = 3000) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      if (i > 1) {
        console.log(`[网络重试] 正在尝试重新加载页面 (${url}) [第 ${i}/${maxRetries} 次]...`);
      }
      return await page.goto(url, options);
    } catch (err) {
      if (isNetworkError(err) && i < maxRetries) {
        console.warn(`⚠️ 页面加载遇到网络异常 (${err.message})，${retryDelayMs / 1000} 秒后重试...`);
        await sleep(retryDelayMs);
      } else {
        throw err;
      }
    }
  }
}

async function run() {
  console.log('正在启动浏览器...');
  const browser = await puppeteer.launch({
    headless: false, // 设为 false 以便可视化观察登录过程
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // 监听登录接口响应以精准捕获错误
  let lastLoginResponse = null;
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/login') && response.request().method() === 'POST') {
      try {
        const text = await response.text();
        lastLoginResponse = JSON.parse(text);
      } catch (e) {
        // 忽略非 JSON 响应
      }
    }
  });

  console.log(`正在打开登录页: ${TARGET_URL}`);
  await gotoWithRetry(page, TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  let loggedIn = false;
  let attempt = 0;

  while (!loggedIn) {
    attempt++;
    console.log(`\n=================== 尝试登录 [第 ${attempt} 次] ===================`);

    try {
      // 若因网络异常导致当前页面状态掉线，重定向刷新登录页
      const currentUrl = page.url();
      if (!currentUrl || currentUrl === 'about:blank' || currentUrl.includes('error')) {
        await gotoWithRetry(page, TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
      }

      // 等待登录表单加载
      await page.waitForSelector('input[placeholder="请输入用户名"]', { visible: true, timeout: 20000 });
      await page.waitForSelector('input[placeholder="请输入密码"]', { visible: true, timeout: 20000 });
      await page.waitForSelector('img.image', { visible: true, timeout: 20000 });

      // 填充用户名和密码
      await page.click('input[placeholder="请输入用户名"]');
      await page.evaluate(() => document.querySelector('input[placeholder="请输入用户名"]').value = '');
      await page.type('input[placeholder="请输入用户名"]', USERNAME);

      await page.click('input[placeholder="请输入密码"]');
      await page.evaluate(() => document.querySelector('input[placeholder="请输入密码"]').value = '');
      await page.type('input[placeholder="请输入密码"]', PASSWORD);

      // 清洗验证码图片并保存到本地
      console.log('正在提取并清洗验证码图片 (Scale 3x + 形态学闭运算 + 字符分割)...');
      const captchaResult = await cleanCaptchaInPage(page);
      if (!captchaResult || !captchaResult.fullImage) {
        console.log('提取验证码失败，正在重试...');
        await page.click('img.image').catch(() => { });
        await sleep(2000);
        continue;
      }

      const localCaptchaPath = path.join(resultsDir, 'captcha.png');
      const rawCaptchaPath = path.join(resultsDir, 'captcha_raw.png');

      fs.writeFileSync(localCaptchaPath, captchaResult.fullImage.replace(/^data:image\/png;base64,/, ""), 'base64');
      if (captchaResult.rawImage) {
        fs.writeFileSync(rawCaptchaPath, captchaResult.rawImage.replace(/^data:image\/png;base64,/, ""), 'base64');
      }
      console.log(`验证码图片已保存至: ${localCaptchaPath}`);

      let verifyCode = '';

      // 前几轮尝试自动 OCR，失败后降级到命令行输入
      if (attempt <= MAX_AUTO_RETRIES) {
        console.log('正在进行验证码 OCR 智能识别 (优先原图模式)...');
        verifyCode = await recognizeCaptcha(localCaptchaPath, captchaResult.segmentDataUrls, rawCaptchaPath);
        if (verifyCode && verifyCode.length === 4) {
          console.log(`OCR 识别结果 (4位数字): ${verifyCode}`);
        } else {
          // 自调优: 用保守预处理参数重试同一张验证码
          console.log('OCR 未成功，尝试保守预处理模式重试同一张验证码...');
          const gentleResult = await cleanCaptchaInPage(page, false);
          if (gentleResult && gentleResult.fullImage) {
            const gentleBase64 = gentleResult.fullImage.replace(/^data:image\/png;base64,/, "");
            fs.writeFileSync(localCaptchaPath, gentleBase64, 'base64');
            verifyCode = await recognizeCaptcha(localCaptchaPath, gentleResult.segmentDataUrls, rawCaptchaPath);
            if (verifyCode && verifyCode.length === 4) {
              console.log(`OCR 二次识别成功 (保守模式): ${verifyCode}`);
            } else {
              console.log('保守模式也失败，刷新验证码重新尝试...');
              await page.click('img.image').catch(() => { });
              await sleep(2000);
              continue;
            }
          } else {
            console.log('验证码提取失败，刷新重试...');
            await page.click('img.image').catch(() => { });
            await sleep(2000);
            continue;
          }
        }
      } else {
        console.log('已达到自动重试上限，转为手动输入验证码模式...');
        verifyCode = await askManualCaptcha();
      }

      // 填充验证码
      await page.click('input[placeholder="请输入验证码"]');
      await page.evaluate(() => document.querySelector('input[placeholder="请输入验证码"]').value = '');
      await page.type('input[placeholder="请输入验证码"]', verifyCode);

      // 点击登录按钮
      console.log('提交登录表单...');
      lastLoginResponse = null;
      await page.click('button.login_btn');

      // 等待 3 秒观察接口返回或页面跳转
      await sleep(3000);

      // 综合判定登录状态
      const pageErrorMsg = await page.evaluate(() => {
        // 1. Element UI error/warning message toast
        const errorEl = document.querySelector('.el-message--error, .el-message--warning');
        if (errorEl && errorEl.textContent) return errorEl.textContent.trim();

        // 2. Element UI general message (not success)
        const msgEl = document.querySelector('.el-message');
        if (msgEl && !msgEl.classList.contains('el-message--success') && !msgEl.textContent.includes('成功')) {
          return msgEl.textContent.trim();
        }

        // 3. Dialog / Modal popups with error text (如“验证码错误”弹窗)
        const dialogEl = document.querySelector('.el-message-box__message, .el-dialog__body');
        if (dialogEl && dialogEl.textContent) {
          const txt = dialogEl.textContent.trim();
          if (txt.includes('验证码') || txt.includes('错误') || txt.includes('失败') || txt.includes('不正确')) {
            return txt;
          }
        }
        return '';
      }).catch(() => '');

      let apiErrorMsg = '';
      if (lastLoginResponse) {
        const code = lastLoginResponse.code;
        const isSuccess = code === 0 || code === 200 || code === 100 || lastLoginResponse.success === true;
        if (!isSuccess) {
          apiErrorMsg = lastLoginResponse.message || lastLoginResponse.msg || '登录接口返回错误';
        }
      }

      const finalError = apiErrorMsg || pageErrorMsg;

      // 检查登录输入框或按钮是否依然存在（若依然可见，则说明绝对未进入主页）
      const isFormStillPresent = await page.evaluate(() => {
        const input = document.querySelector('input[placeholder="请输入用户名"]');
        const btn = document.querySelector('button.login_btn');
        const isVisible = el => el && window.getComputedStyle(el).display !== 'none' && el.offsetWidth > 0 && el.offsetHeight > 0;
        return isVisible(input) || isVisible(btn);
      }).catch(() => true);

      // 检查真实的 Auth Token（排除初次载入页面就会生成的 JSESSIONID）
      const cookies = await page.cookies();
      const hasRealAuthToken = cookies.some(c => {
        const n = c.name.toLowerCase();
        return (n.includes('token') && n !== 'jsessionid') || n.includes('auth') || n.includes('user');
      });
      const hasStorageToken = await page.evaluate(() => {
        const keys = [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
        return keys.some(k => k.toLowerCase().includes('token') || k.toLowerCase().includes('user') || k.toLowerCase().includes('auth'));
      }).catch(() => false);

      // 真正判断登录成功的条件：没有错误提示 + 登录表单已消失 + 拥有真正的 Token 凭证
      if (!finalError && !isFormStillPresent && (hasRealAuthToken || hasStorageToken)) {
        console.log('🎉 登录成功！');
        loggedIn = true;

        // 保存 Cookies
        fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
        console.log(`登录凭证 (Cookies) 已保存至: ${cookiePath}`);
      } else {
        const isCaptchaErr = finalError.includes('验证码') || finalError.includes('code') || finalError.includes('Code');

        if (isCaptchaErr) {
          console.log(`❌ 验证码填入错误 [本次识别值: "${verifyCode}"] -> 页面弹窗/接口提示: ${finalError}`);
          console.log(`🔄 正在自动刷新验证码图片并重新识别 (第 ${attempt}/${MAX_AUTO_RETRIES} 次尝试)...`);
        } else if (finalError) {
          console.log(`❌ 登录失败: ${finalError}`);
        } else {
          console.log(`❌ 登录未成功（登录表单依然存在，本次识别值: "${verifyCode}"），自动刷新重试...`);
        }

        // 关闭 Element UI 弹出的“确定/关闭”提示框，防止挡住后续操作
        await page.evaluate(() => {
          const confirmBtn = document.querySelector('.el-message-box__btns button, .el-dialog__headerbtn');
          if (confirmBtn) confirmBtn.click();
        }).catch(() => { });

        // 刷新验证码图片并等待 DOM/网络渲染完毕，准备下一次尝试
        try {
          await page.evaluate(() => {
            const img = document.querySelector('img.image');
            if (img) img.click();
          });
          // 额外等待新验证码图片完全渲染
          await page.waitForFunction(() => {
            const img = document.querySelector('img.image');
            return img && img.complete && img.naturalWidth > 0;
          }, { timeout: 5000 }).catch(() => { });
          await sleep(1500);
        } catch (clickErr) {
          console.warn('⚠️ 刷新验证码失败（可能页面已发生跳转或元素已失效）:', clickErr.message);
        }
      }
    } catch (err) {
      if (isNetworkError(err)) {
        console.warn(`⚠️ 登录过程中发生网络异常 (${err.message})，正在自动恢复重试...`);
        try {
          await gotoWithRetry(page, TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        } catch (gotoErr) {
          console.warn('重新打开登录页失败:', gotoErr.message);
        }
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }

  // ----------------------------------------------------
  // 登录成功后的业务操作：学习中心 -> 我的课程 -> 未完成课程 -> 自动循环学习
  // ----------------------------------------------------
  console.log('\n[业务操作] 开始执行自动化课程学习导航与循环播放...');

  // 通用文本查找与点击辅助函数（带网络/超时重试）
  async function clickByText(targetText, description = targetText, maxRetries = 3) {
    for (let retry = 1; retry <= maxRetries; retry++) {
      try {
        console.log(`正在查找并点击 "${description}"...`);
        await page.waitForFunction((txt) => {
          const all = Array.from(document.querySelectorAll('button, a, div, span, li, p'));
          return all.some(el => {
            const style = window.getComputedStyle(el);
            const isVisible = style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
            return isVisible && el.textContent && el.textContent.trim().includes(txt);
          });
        }, { timeout: 15000 }, targetText);

        const elementHandle = await page.evaluateHandle((txt) => {
          const all = Array.from(document.querySelectorAll('button, a, div, span, li, p'));
          const candidates = all.filter(el => {
            const style = window.getComputedStyle(el);
            const isVisible = style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
            if (!isVisible) return false;
            const t = el.textContent ? el.textContent.trim() : '';
            return t.includes(txt);
          });
          // 优先选择最精准、文本长度最短的叶子节点
          candidates.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
          return candidates[0] || null;
        }, targetText);

        if (elementHandle && elementHandle.asElement()) {
          await elementHandle.asElement().click();
          console.log(`已成功点击 "${description}"`);
          return;
        } else {
          throw new Error(`未找到包含 "${description}" 的可点击元素`);
        }
      } catch (err) {
        if (isNetworkError(err) && retry < maxRetries) {
          console.warn(`⚠️ 点击 "${description}" 遇到网络/超时异常 (${err.message})，第 ${retry} 次重试...`);
          await sleep(2000 * retry);
        } else {
          throw err;
        }
      }
    }
  }

  // 处理新页面的提示/确认弹窗
  async function handleDialogPopups(targetPage) {
    try {
      const dialogBtnClicked = await targetPage.evaluate(() => {
        const targetTexts = ['确定', '确认', '我知道了', '继续学习', '开始学习', '进入学习'];
        const allElements = Array.from(document.querySelectorAll('button, a, div, span'));

        const btns = allElements.filter(el => {
          const style = window.getComputedStyle(el);
          const isVisible = style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
          if (!isVisible) return false;
          const txt = el.textContent ? el.textContent.trim() : '';
          return targetTexts.some(t => txt === t);
        });

        if (btns.length > 0) {
          const popupBtn = btns.find(el => {
            let p = el.parentElement;
            while (p) {
              const className = p.className || '';
              if (typeof className === 'string' && (
                className.includes('dialog') || className.includes('modal') || className.includes('message-box') || className.includes('popup')
              )) {
                return true;
              }
              p = p.parentElement;
            }
            return false;
          });
          const targetBtn = popupBtn || btns[0];
          targetBtn.click();
          return true;
        }
        return false;
      });

      if (dialogBtnClicked) {
        console.log('🎉 已自动检测并点击了弹出层确定/确认按钮');
      }
    } catch (e) {
      // 忽略检测弹窗过程中的非致命错误
    }
  }

  // 监控视频播放直到结束
  async function monitorVideoUntilEnd(targetPage) {
    console.log('🎥 开始监测课程视频播放状态...');
    const pollIntervalMs = 5000;

    while (true) {
      if (targetPage.isClosed()) {
        console.log('课程页面已关闭，停止进度监测。');
        break;
      }

      // 中途弹窗处理（如“是否继续观看”防挂机弹窗）
      await handleDialogPopups(targetPage);

      // 检查视频播放进度（遍历主页面以及所有 iframe）
      const frames = targetPage.frames();
      let anyVideoFound = false;
      let allVideosEnded = true;
      const progressDetails = [];
      let isFinishedByText = false;

      for (const frame of frames) {
        try {
          const result = await frame.evaluate(() => {
            const videos = Array.from(document.querySelectorAll('video'));
            if (videos.length === 0) {
              const bodyText = document.body ? document.body.innerText : '';
              const textDone = bodyText.includes('学习完成') || bodyText.includes('已完成') || bodyText.includes('完成度：100%') || bodyText.includes('完成度 100%');
              return { hasVideo: false, textDone };
            }

            let endedCount = 0;
            const details = [];
            videos.forEach(v => {
              // 如果视频暂停了且未播放完毕，自动尝试触发播放
              if (v.paused && !v.ended) {
                v.play().catch(() => { });
              }
              if (v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5)) {
                endedCount++;
              }
              details.push(`${Math.floor(v.currentTime || 0)}/${Math.floor(v.duration || 0)}s`);
            });

            return {
              hasVideo: true,
              allEnded: endedCount === videos.length,
              details
            };
          });

          if (result.hasVideo) {
            anyVideoFound = true;
            if (!result.allEnded) allVideosEnded = false;
            progressDetails.push(...result.details);
          }
          if (result.textDone) {
            isFinishedByText = true;
          }
        } catch (e) {
          // 忽略个别 frame 跨域或未就绪时的报错
        }
      }

      if (anyVideoFound && progressDetails.length > 0) {
        console.log(`[视频实时进度] ${progressDetails.join(', ')}`);
      }

      if ((anyVideoFound && allVideosEnded) || (!anyVideoFound && isFinishedByText)) {
        console.log('🎉 课程视频播放完成！');
        break;
      }

      await sleep(pollIntervalMs);
    }
  }

  // 辅助函数：在 ul.course 内指定的 li 项目中点击“我要选课”按钮 (仅当 class="stady" 按钮内容为“我要选课”时才触发点击)
  async function clickCardSelectBtnInUlCourse(targetIdx) {
    try {
      const btnHandle = await page.evaluateHandle((idx) => {
        const ul = document.querySelector('ul.course');
        if (!ul) return null;

        const liElements = Array.from(ul.querySelectorAll('li'));
        const targetLi = liElements[idx];
        if (!targetLi) return null;

        // 1. 优先定位 class="stady" 且文本内容包含“我要选课”的按钮元素
        const stadyBtn = targetLi.querySelector('.stady, [class*="stady"]');
        if (stadyBtn) {
          const txt = stadyBtn.textContent ? stadyBtn.textContent.trim() : '';
          if (txt.includes('我要选课') || txt.includes('立即选课') || txt === '选课') {
            return stadyBtn;
          }
        }

        // 2. 备用定位包含“我要选课”文本的元素
        const allBtns = Array.from(targetLi.querySelectorAll('button, a, div, span, i, p'));
        return allBtns.find(el => {
          const txt = el.textContent ? el.textContent.trim() : '';
          const style = window.getComputedStyle(el);
          const isVis = style.display !== 'none' && style.visibility !== 'hidden';
          return isVis && (txt.includes('我要选课') || txt.includes('立即选课') || txt === '选课');
        }) || null;
      }, targetIdx);

      if (btnHandle && btnHandle.asElement()) {
        // 1. 先将选课按钮平滑滚动至视口中央
        await page.evaluate(el => {
          if (el) el.scrollIntoView({ block: 'center', inline: 'center' });
        }, btnHandle.asElement());

        await sleep(200);

        // 2. 执行 1 次精确定位的原生物理鼠标点击
        await btnHandle.asElement().click();
        console.log(`  ✅ 已成功点击 1 次 "class=stady" (我要选课) 按钮`);
        return;
      } else {
        console.warn(`⚠️ li [${targetIdx}] 中的 class="stady" 按钮内容不包含 "我要选课" (可能已选)，跳过点击`);
      }
    } catch (err) {
      console.warn(`点击 .stady 按钮遇到异常:`, err.message);
    }
  }

  // 辅助函数：自动确认选课后的 Element UI 提示/对话框 ("确定", "确认")
  async function autoConfirmPopup() {
    try {
      await page.evaluate(() => {
        const confirmBtns = Array.from(document.querySelectorAll('.el-message-box__btns button, .el-dialog__footer button, button')).filter(btn => {
          const txt = btn.textContent ? btn.textContent.trim() : '';
          const style = window.getComputedStyle(btn);
          const isVis = style.display !== 'none' && style.visibility !== 'hidden';
          return isVis && (txt === '确定' || txt === '确认' || txt === '我知道了');
        });
        if (confirmBtns[0]) confirmBtns[0].click();
      });
    } catch (e) { }
  }

  // 核心功能：进入“选课中心”，依次搜索并按规则进行选课 (异步搜索 + ul.course > li 结构)
  async function selectCourseInCenter(courses) {
    if (!courses || courses.length === 0) return;

    console.log('\n=================== [选课中心] 开始自动搜索并选择课程 ===================');
    try {
      await clickByText('选课中心', '选课中心');
      await sleep(3000);
    } catch (e) {
      console.warn('⚠️ 导航至“选课中心”失败:', e.message);
      return;
    }

    for (let i = 0; i < courses.length; i++) {
      const { courseName, teacherName } = courses[i];
      console.log(`\n🔍 [选课中心 ${i + 1}/${courses.length}] 正在搜索课程: "${courseName}" | 主讲人: "${teacherName || '未指定'}"`);

      try {
        // 1. 使用精确 CSS 选择器锁定选课中心搜索框并输入课程名称
        const EXACT_INPUT_SELECTOR = `#app > div.is_cont > div:nth-child(3) > div > ul > li.tabSelect > div.input > input[type=text]`;

        await page.evaluate((selector, txt) => {
          const input = document.querySelector(selector) ||
            document.querySelector('.tabSelect > div.input > input[type=text]') ||
            document.querySelector('.tabSelect div.input input') ||
            document.querySelector('.tabSelect input');
          if (input) {
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, EXACT_INPUT_SELECTOR, courseName);

        const searchInputHandle = await page.evaluateHandle((selector) => {
          return document.querySelector(selector) ||
            document.querySelector('.tabSelect > div.input > input[type=text]') ||
            document.querySelector('.tabSelect div.input input') ||
            document.querySelector('.tabSelect input');
        }, EXACT_INPUT_SELECTOR);

        if (searchInputHandle && searchInputHandle.asElement()) {
          await searchInputHandle.asElement().click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await searchInputHandle.asElement().type(courseName, { delay: 30 });
          await sleep(200);
        }

        // 2. 输入完内容后点击搜索按钮 (class="el-icon-search")
        const searchClicked = await page.evaluate(() => {
          const searchIcon = document.querySelector('#app > div.is_cont > div:nth-child(3) > div > ul > li.tabSelect .el-icon-search') ||
            document.querySelector('.tabSelect .el-icon-search') ||
            document.querySelector('.el-icon-search');

          if (searchIcon) {
            const parentBtn = searchIcon.closest('button, a, div, span, i') || searchIcon;
            parentBtn.click();
            return true;
          }
          return false;
        });

        if (!searchClicked) {
          console.log('未找到 .tabSelect .el-icon-search 图标，按 Enter 键触发搜索...');
          await page.keyboard.press('Enter');
        }

        // 3. 选课按钮异步触发，等待 ul.course 节点的异步渲染与数据加载
        await page.waitForFunction(() => {
          const ul = document.querySelector('ul.course');
          return ul !== null;
        }, { timeout: 8000 }).catch(() => { });
        await sleep(2000);

        // 4. 分析 ul.course 下面的 li 元素 (如果无任何 li 则证明无搜索结果)
        const evalResult = await page.evaluate((targetTeacher) => {
          const ul = document.querySelector('ul.course');
          if (!ul) {
            return { count: 0, details: [] };
          }

          // 获取 ul.course 下的所有 li
          const liElements = Array.from(ul.querySelectorAll('li'));
          const count = liElements.length;

          if (count === 0) {
            return { count: 0, details: [] };
          }

          const details = liElements.map((li, idx) => {
            const text = li.innerText || li.textContent || '';

            // 匹配 class="stady" 的选课按钮或其它选课按钮
            const stadyBtn = li.querySelector('.stady, [class*="stady"]');
            const textBtn = Array.from(li.querySelectorAll('button, a, div, span, p, i')).find(el => {
              const txt = el.textContent ? el.textContent.trim() : '';
              const style = window.getComputedStyle(el);
              const isVis = style.display !== 'none' && style.visibility !== 'hidden';
              return isVis && (txt.includes('我要选课') || txt.includes('立即选课') || txt === '选课');
            });

            const btn = stadyBtn || textBtn;
            const btnText = btn ? (btn.textContent ? btn.textContent.trim() : '') : '';

            // 严格控制：当且仅当按钮文字包含“我要选课”、“立即选课”或等于“选课”时，才算作可选
            const canSelect = btnText.includes('我要选课') || btnText.includes('立即选课') || (btnText === '选课');

            return { idx, text, btnText, canSelect };
          });

          return { count, details };
        }, teacherName);

        // 分支 1：没有任何 li 元素 (证明无搜索结果)
        if (evalResult.count === 0) {
          console.log(`  ⚠️ ul.course 下无任何 li 元素 (无搜索结果)，继续搜索下一个...`);
          continue;
        }

        // 分支 2：结果为 1 个 li
        if (evalResult.count === 1) {
          const item = evalResult.details[0];
          if (item.canSelect) {
            console.log(`  🎯 找到 1 个 li 匹配结果，存在 "我要选课" 按钮，正在点击...`);
            await clickCardSelectBtnInUlCourse(item.idx);
            await sleep(1500);
            await autoConfirmPopup();
            console.log(`  ✅ 成功点击选课: "${courseName}"`);
          } else {
            console.log(`  ℹ️ 结果为 1 个 li，但按钮状态为 "${item.btnText}" (无需再选)，搜索下一个...`);
          }
          continue;
        }

        // 分支 3：结果为多个 li，对比“主讲人”
        if (evalResult.count > 1) {
          console.log(`  🔍 发现 ${evalResult.count} 个 li 搜索结果，对比主讲人 ("${teacherName || '未指定'}"...`);
          let matched = false;

          for (const item of evalResult.details) {
            const isTeacherMatch = (!teacherName || teacherName === '未指定') || item.text.includes(teacherName);
            if (isTeacherMatch) {
              if (item.canSelect) {
                console.log(`  🎯 li 结果主讲人匹配符合 ("${teacherName || '全匹配'}"), 正在点击 "我要选课"...`);
                await clickCardSelectBtnInUlCourse(item.idx);
                await sleep(1500);
                await autoConfirmPopup();
                console.log(`  ✅ 成功点击选课: "${courseName}"`);
                matched = true;
                break;
              } else {
                console.log(`  ℹ️ li 结果主讲人符合，但按钮状态为 "${item.btnText}"，无须重复选课...`);
                matched = true;
                break;
              }
            }
          }

          if (!matched) {
            console.log(`  ⚠️ 多个 li 结果中均未匹配到主讲人 "${teacherName}"，跳过该课程...`);
          }
        }

      } catch (courseErr) {
        console.warn(`  ⚠️ 搜索处理课程 "${courseName}" 时发生异常:`, courseErr.message);
      }
    }

    console.log('\n🎉 [选课中心] 所有选课文件课程搜寻选择处理完成！\n');
  }

  try {
    // 1. 点击“学习中心”
    await clickByText('学习中心', '学习中心');
    await sleep(2500);

    // 控制台输出：“是否选课，选课则直接拽入选课文件，不选课直接回车”
    const userInput = await askCourseFileOrSkip();

    if (userInput && userInput.length > 0) {
      console.log('收到选课文件路径，正在读取解析...');
      let courses = await processCourseFile(userInput);
      let tryCount = 1;
      while ((!courses || courses.length === 0) && tryCount < 3) {
        tryCount++;
        const retryInput = await askCourseFileOrSkip('❌ 文件解析未成功，请重新拖拽选课文件(不选课直接回车): ');
        if (!retryInput) break;
        courses = await processCourseFile(retryInput);
      }

      if (courses && courses.length > 0) {
        await selectCourseInCenter(courses);
      } else {
        console.log('未读取到有效课程信息，跳过选课中心选课...');
      }

      console.log('选课中心选课环节完成，接着执行代码现有的自动学习流程...');
    } else {
      console.log('用户未拖拽选课文件 (直接回车)，跳过选课，接着执行代码现有的学习流程...');
    }

    // 2. 点击“我的课程”
    await clickByText('我的课程', '我的课程');
    await sleep(2500);

    let courseIndex = 0;

    while (true) {
      // 3. 点击/刷新“未完成课程”面板
      console.log('\n------------------------------------------------');
      console.log('🔄 正在切换/刷新“未完成课程”列表...');
      await clickByText('未完成课程', '未完成课程');
      await sleep(3000);

      // 查找包含“开始学习”或“继续学习”的第一个课程按钮
      console.log('正在查找未完成课程列表中包含“开始学习”或“继续学习”的课程...');

      const courseBtnHandle = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button, a, div, span'))
          .filter(el => {
            const style = window.getComputedStyle(el);
            const isVisible = style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
            if (!isVisible) return false;
            const txt = el.textContent ? el.textContent.trim() : '';
            return txt === '开始学习' || txt === '继续学习';
          });
        return btns[0] || null;
      });

      if (!courseBtnHandle || !courseBtnHandle.asElement()) {
        console.log('🎉 没有找到更多需要学习的课程（“未完成课程”列表中已无未完成项）！');
        break;
      }

      courseIndex++;
      console.log(`▶️ 准备开始学习第 ${courseIndex} 门未完成课程...`);

      // 监听新页面的创建
      const newPagePromise = new Promise((resolve, reject) => {
        const listener = async (target) => {
          if (target.type() === 'page') {
            const newPg = await target.page();
            if (newPg) {
              browser.off('targetcreated', listener);
              resolve(newPg);
            }
          }
        };
        browser.on('targetcreated', listener);
        setTimeout(() => {
          browser.off('targetcreated', listener);
          reject(new Error('等待新学习页面创建超时'));
        }, 15000);
      });

      await courseBtnHandle.asElement().click();
      console.log('已点击课程学习按钮，等待在新页面中播放...');

      let newPage = null;
      try {
        newPage = await newPagePromise;
        console.log('检测到打开了新课程页面，正在切换激活焦点...');
        await newPage.bringToFront();

        // 等待新页面基础网络资源加载
        await newPage.waitForNetworkIdle({ timeout: 8000 }).catch(() => { });
        await sleep(3000);

        // 检测是否有初始弹窗并确定
        await handleDialogPopups(newPage);

        // 轮询监测视频播放直至完成
        await monitorVideoUntilEnd(newPage);

      } catch (err) {
        console.error('处理当前课程播放时出现异常:', err.message);
      } finally {
        if (newPage && !newPage.isClosed()) {
          console.log('关闭当前课程播放页面，准备切回主列表页...');
          await newPage.close().catch(() => { });
        }
        // 切回主页面焦点并稍作等待
        await page.bringToFront();
        await sleep(2000);
      }
    }

    console.log(`\n🎉 所有未完成课程已播放处理完毕，共学习了 ${courseIndex} 门课程！`);

  } catch (err) {
    console.error('自动化主流程异常中断:', err.message);
    throw err;
  } finally {
    console.log('正在关闭当前浏览器实例...');
    await browser.close().catch(() => { });
  }
}

const MAX_RUN_RETRIES = 5;

async function main() {
  for (let runAttempt = 1; runAttempt <= MAX_RUN_RETRIES; runAttempt++) {
    try {
      await run();
      break; // 正常运行完毕，跳出重试
    } catch (err) {
      if (isNetworkError(err) && runAttempt < MAX_RUN_RETRIES) {
        console.warn(`\n💥 主程序因严重网络异常中断 (${err.message})`);
        console.warn(`正在启动全自动化网络重连与恢复 [第 ${runAttempt}/${MAX_RUN_RETRIES} 次重试]...`);
        await sleep(5000);
      } else {
        console.error('程序因非网络错误或超过最大重试次数退出:', err);
        process.exit(1);
      }
    }
  }
}

main();
