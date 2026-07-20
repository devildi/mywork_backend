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
    const cookies = await page.cookies();
    const hasToken = cookies.some(c => c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('session') || c.name === 'JSESSIONID');
    
    // 如果接口明确返回错误，或者界面上有错误弹窗
    let errorMsg = '';
    if (lastLoginResponse && lastLoginResponse.code !== 0 && lastLoginResponse.code !== 100) {
      errorMsg = lastLoginResponse.message || '未知错误';
    } else {
      // 检查是否有 Element UI 的错误消息元素
      errorMsg = await page.evaluate(() => {
        const errorEl = document.querySelector('.el-message--error, .el-message');
        return errorEl ? errorEl.textContent.trim() : '';
      });
    }

    if (errorMsg) {
      console.log(`❌ 登录失败: ${errorMsg}`);
      // 刷新验证码，准备下一次尝试
      console.log('刷新验证码，重新尝试...');
      await page.click('img.image');
      await sleep(2000);
    } else {
      // 没有报错，并且页面 URL 改变，或者获取到重要 Cookie，视为成功
      const currentUrl = page.url();
      if (!currentUrl.includes('/login') || hasToken) {
        console.log('🎉 登录成功！');
        loggedIn = true;
        
        // 保存 Cookies
        fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
        console.log(`登录凭证 (Cookies) 已保存至: ${cookiePath}`);
      } else {
        console.log('未检测到报错，但未完成跳转，刷新重试...');
        await page.click('img.image');
        await sleep(2000);
      }
    }
  }

  // ----------------------------------------------------
  // 登录成功后的爬取模版代码（可根据需要在此处编写业务抓取逻辑）
  // ----------------------------------------------------
  console.log('\n[业务抓取] 开始执行数据抓取逻辑...');
  
  // 示例：跳转到系统首页并抓取学员基本信息
  try {
    await page.goto('https://zyjs.lngbzx.gov.cn/pc/index.html#/home', { waitUntil: 'networkidle2' });
    await sleep(3000);
    const pageTitle = await page.title();
    console.log(`首页标题: ${pageTitle}`);
  } catch (err) {
    console.error('抓取数据时出错:', err.message);
  }

  console.log('任务完成，正在关闭浏览器...');
  await browser.close();
}

run().catch(err => {
  console.error('程序异常退出:', err);
});
