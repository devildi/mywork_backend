const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 配置信息
const TARGET_URL = 'https://zyjs.lngbzx.gov.cn/pc/index.html#/';
const USERNAME = 'LNrtv002180';
const PASSWORD = 'Magic1987';
const MAX_AUTO_RETRIES = 3;

const resultsDir = path.join(__dirname, '../results');
const cookiePath = path.join(resultsDir, 'lngbzx_cookies.json');

// 确保 results 目录存在
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 清洗验证码图像（在浏览器 context 中运行）
async function cleanCaptchaInPage(page) {
  return await page.evaluate(() => {
    const img = document.querySelector('img.image');
    if (!img) return null;
    
    const canvas = document.createElement('canvas');
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    
    // 步骤 1: 颜色与饱和度过滤（二值化）
    const grid = [];
    for (let y = 0; y < height; y++) {
      grid[y] = new Uint8Array(width);
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx+1];
        const b = data[idx+2];
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;
        
        // 灰色噪点线饱和度极低，品红线 G 通道值低
        const isGrey = diff < 30;
        const isMagenta = (r > 90 && b > 90 && g < 140);
        
        if (isGrey || isMagenta || max > 210) {
          grid[y][x] = 1; // 背景（白色）
        } else {
          grid[y][x] = 0; // 字符主体（黑色）
        }
      }
    }
    
    // 步骤 2: 腐蚀算法（去除 1-2 像素宽的细背景线条）
    const eroded = [];
    for (let y = 0; y < height; y++) {
      eroded[y] = new Uint8Array(width);
      eroded[y].fill(1);
    }
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (grid[y][x] === 0) {
          let whiteNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (grid[y + dy][x + dx] === 1) {
                whiteNeighbors++;
              }
            }
          }
          // 邻域内白色像素较多，说明是细线，腐蚀为白色
          if (whiteNeighbors < 3) {
            eroded[y][x] = 0;
          }
        }
      }
    }
    
    // 步骤 3: 膨胀算法（还原粗化字符主体笔画）
    const dilated = [];
    for (let y = 0; y < height; y++) {
      dilated[y] = new Uint8Array(width);
      dilated[y].fill(1);
    }
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let hasBlackNeighbor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (eroded[y + dy][x + dx] === 0) {
              hasBlackNeighbor = true;
              break;
            }
          }
          if (hasBlackNeighbor) break;
        }
        if (hasBlackNeighbor) {
          dilated[y][x] = 0;
        }
      }
    }
    
    // 将处理后的二值化数据写回
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const color = dilated[y][x] === 0 ? 0 : 255;
        data[idx] = color;
        data[idx+1] = color;
        data[idx+2] = color;
        data[idx+3] = 255;
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  });
}

// 调用 OCR 识别接口
async function recognizeCaptcha(base64DataUrl) {
  try {
    const response = await axios.post('https://api.ocr.space/parse/image', 
      new URLSearchParams({
        apikey: 'helloworld',
        base64Image: base64DataUrl,
        language: 'eng',
        isOverlayRequired: 'false',
        filetype: 'PNG'
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      }
    );
    
    if (response.data && response.data.ParsedResults && response.data.ParsedResults.length > 0) {
      const text = response.data.ParsedResults[0].ParsedText || '';
      // 过滤非字母数字字符
      return text.replace(/[^a-zA-Z0-9]/g, '').trim();
    }
  } catch (err) {
    console.error(`[lngbzx.js] OCR API 识别出错: ${err.message}`);
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
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  let loggedIn = false;
  let attempt = 0;

  while (!loggedIn) {
    attempt++;
    console.log(`\n=================== 尝试登录 [第 ${attempt} 次] ===================`);
    
    // 等待登录表单加载
    await page.waitForSelector('input[placeholder="请输入用户名"]', { visible: true });
    await page.waitForSelector('input[placeholder="请输入密码"]', { visible: true });
    await page.waitForSelector('img.image', { visible: true });

    // 填充用户名和密码
    await page.click('input[placeholder="请输入用户名"]');
    await page.evaluate(() => document.querySelector('input[placeholder="请输入用户名"]').value = '');
    await page.type('input[placeholder="请输入用户名"]', USERNAME);

    await page.click('input[placeholder="请输入密码"]');
    await page.evaluate(() => document.querySelector('input[placeholder="请输入密码"]').value = '');
    await page.type('input[placeholder="请输入密码"]', PASSWORD);

    // 清洗验证码图片并保存到本地（无论自动还是手动都会用到此清晰图）
    console.log('正在提取并清洗验证码图片...');
    const cleanedBase64 = await cleanCaptchaInPage(page);
    if (!cleanedBase64) {
      console.log('提取验证码失败，正在重试...');
      await page.click('img.image');
      await sleep(2000);
      continue;
    }

    const base64Data = cleanedBase64.replace(/^data:image\/png;base64,/, "");
    const localCaptchaPath = path.join(resultsDir, 'captcha.png');
    fs.writeFileSync(localCaptchaPath, base64Data, 'base64');
    console.log(`验证码图片已保存至: ${localCaptchaPath}`);

    let verifyCode = '';

    // 前几轮尝试自动 OCR，失败后降级到命令行输入
    if (attempt <= MAX_AUTO_RETRIES) {
      console.log('正在通过 OCR.space 自动识别验证码...');
      verifyCode = await recognizeCaptcha(cleanedBase64);
      if (verifyCode && verifyCode.length >= 3 && verifyCode.length <= 5) {
        console.log(`OCR 识别结果: ${verifyCode}`);
      } else {
        console.log('OCR 自动识别失败（识别结果格式不符或接口无响应），重新刷新验证码...');
        await page.click('img.image');
        await sleep(2000);
        continue;
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

    // 判断是否登录成功
    const currentUrl = page.url();
    const cookies = await page.cookies();
    const hasToken = cookies.some(c => c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('session') || c.name === 'JSESSIONID');
    
    if (!currentUrl.includes('/login') || hasToken) {
      console.log('🎉 登录成功！');
      loggedIn = true;
      
      // 保存 Cookies
      fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
      console.log(`登录凭证 (Cookies) 已保存至: ${cookiePath}`);
    } else {
      // 未检测到跳转，检查是否报错
      let errorMsg = '';
      if (lastLoginResponse) {
        const code = lastLoginResponse.code;
        const isSuccess = code === 0 || code === 200 || code === 100 || lastLoginResponse.success === true;
        if (!isSuccess) {
          errorMsg = lastLoginResponse.message || lastLoginResponse.msg || '登录接口返回错误';
        }
      }
      
      if (!errorMsg) {
        // 检查是否有 Element UI 的错误消息元素（排除成功消息）
        errorMsg = await page.evaluate(() => {
          const errorEl = document.querySelector('.el-message--error, .el-message--warning');
          if (errorEl) return errorEl.textContent.trim();
          
          const msgEl = document.querySelector('.el-message');
          if (msgEl && !msgEl.classList.contains('el-message--success') && !msgEl.textContent.includes('成功')) {
            return msgEl.textContent.trim();
          }
          return '';
        });
      }

      if (errorMsg) {
        console.log(`❌ 登录失败: ${errorMsg}`);
      } else {
        console.log('未检测到明确的报错，但未完成跳转，准备重试...');
      }

      // 刷新验证码，准备下一次尝试
      console.log('刷新验证码，重新尝试...');
      try {
        await page.click('img.image');
        await sleep(2000);
      } catch (clickErr) {
        console.warn('⚠️ 刷新验证码失败（可能页面已发生跳转或元素已失效）:', clickErr.message);
      }
    }
  }

  // ----------------------------------------------------
  // 登录成功后的业务操作：学习中心 -> 我的课程 -> 未完成课程 -> 自动循环学习
  // ----------------------------------------------------
  console.log('\n[业务操作] 开始执行自动化课程学习导航与循环播放...');

  // 通用文本查找与点击辅助函数
  async function clickByText(targetText, description = targetText) {
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
    } else {
      throw new Error(`未找到包含 "${description}" 的可点击元素`);
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
                v.play().catch(() => {});
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

  try {
    // 1. 点击“学习中心”
    await clickByText('学习中心', '学习中心');
    await sleep(2500);

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
        await newPage.waitForNetworkIdle({ timeout: 8000 }).catch(() => {});
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
          await newPage.close().catch(() => {});
        }
        // 切回主页面焦点并稍作等待
        await page.bringToFront();
        await sleep(2000);
      }
    }

    console.log(`\n🎉 所有未完成课程已播放处理完毕，共学习了 ${courseIndex} 门课程！`);

  } catch (err) {
    console.error('自动化主流程异常中断:', err.message);
  }

  console.log('任务完成，正在关闭浏览器...');
  await browser.close();
}

run().catch(err => {
  console.error('程序异常退出:', err);
});
