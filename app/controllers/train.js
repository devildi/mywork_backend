const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AnonymizeUA = require('puppeteer-extra-plugin-anonymize-ua');

const {
  sleep,
  testURL,
  Excel,
  trainFilter,
  formatTimeDiff,
  filterByProvinceAndCity,
  sleepWithHeartbeat
} = require('../config');

// Register stealth and anonymize user-agent plugins
try {
  puppeteer.use(StealthPlugin());
  puppeteer.use(AnonymizeUA({ makeWindows: true }));
} catch (e) {
  console.log('Stealth plugins already registered or failed to register:', e.message);
}

let isRunning = false;
let shouldCancel = false;
let activeBrowser = null;
let activePage = null;
let taskGeneration = 0;

// Global cache for the active/last crawler task
let activeTask = null;
const trainFlagPath = path.join(__dirname, '../../results/trainFlag.txt');
const queryCachePath = path.join(__dirname, '../../results/lastQuery.json');
const activeTaskCachePath = path.join(__dirname, '../../results/activeTrainTask.json');

function saveActiveTask() {
  try {
    fs.writeFileSync(activeTaskCachePath, JSON.stringify(activeTask, null, 2));
  } catch (e) {
    console.error('[Train Scraper] Failed to save activeTask to disk:', e.message);
  }
}

function loadActiveTask() {
  try {
    if (fs.existsSync(activeTaskCachePath)) {
      activeTask = JSON.parse(fs.readFileSync(activeTaskCachePath, 'utf8'));
      console.log('[Train Scraper] Loaded activeTask from disk cache');
      if (activeTask && (activeTask.status === '已启动' || activeTask.status.includes('正在') || activeTask.status.includes('出错'))) {
        activeTask.status = '已中止';
        saveActiveTask();
      }
    }
  } catch (e) {
    console.error('[Train Scraper] Failed to load activeTask from disk:', e.message);
  }
}

loadActiveTask();

async function runCrawlerTask(from, to, io, filterSettings = {}, generation) {
  const fileUrl = path.join(__dirname, '../../results/finalStationInfo.txt');

  shouldCancel = false;
  activeBrowser = null;
  activePage = null;

  let stationsArray = [];
  try {
    const data = fs.readFileSync(fileUrl, 'utf-8');
    stationsArray = JSON.parse(data);
  } catch (err) {
    console.error('读取 finalStationInfo.txt 失败:', err);
    io.emit('train:error', { message: '读取车站信息文件失败' });
    if (activeTask) {
      activeTask.status = '出错：读取车站信息文件失败';
      saveActiveTask();
    }
    return;
  }

  let fromStationObj = null;
  if (typeof from === 'string') {
    // 1. First try to match exact station name (e.g. "沈阳" instead of "大成")
    fromStationObj = stationsArray.find(item => item.stationsName === from);
    // 2. Fall back to matching the city name
    if (!fromStationObj) {
      fromStationObj = stationsArray.find(item => item.inWhichCity === from);
    }
  } else {
    fromStationObj = from;
  }

  if (!fromStationObj || !fromStationObj.stationsNameCHN) {
    console.error('未找到出发城市的拼音或车站信息:', from);
    io.emit('train:error', { message: `未找到出发城市 ${from} 的对应车站信息` });
    if (activeTask) {
      activeTask.status = '出错：未找到出发城市车站信息';
      saveActiveTask();
    }
    return;
  }

  // Update active task resolved from details
  if (activeTask) {
    activeTask.resolvedFrom = fromStationObj;
    saveActiveTask();
  }

  let dataForSpider = filterByProvinceAndCity(stationsArray, to);
  if (!dataForSpider || dataForSpider.length === 0) {
    console.log(`未找到目标省份 ${to} 的车站`);
    io.emit('train:error', { message: `未找到目标省份 ${to} 的车站` });
    if (activeTask) {
      activeTask.status = `未找到目标省份 ${to} 的车站`;
      saveActiveTask();
    }
    return;
  }

  const flag = dataForSpider.length;
  let index = 0;

  // Resuming capability based on trainFlag.txt
  try {
    if (fs.existsSync(trainFlagPath)) {
      const flagData = fs.readFileSync(trainFlagPath, 'utf8').trim();
      const number = Number(flagData);
      if (number !== 10086 && number >= 0 && number < flag) {
        index = number;
      }
    }
  } catch (e) {
    console.error('读取 trainFlagPath 失败, 默认从0开始', e);
  }

  const timestamp1 = Date.now();
  let browser = null;
  let page = null;
  let sleepTimes = 0;

  let arrFrom = [...fromStationObj.stationsNameCHN];

  console.log(`[Train Scraper] Start crawling from ${fromStationObj.stationsName} to ${to}. Total stations: ${flag}. Starting from index ${index}`);

  while (index < flag) {
    if (taskGeneration !== generation || shouldCancel) {
      console.log('[Train Scraper] Task superseded or cancelled before next station');
      if (activeTask && taskGeneration !== generation) {
        activeTask.status = '已取消';
        saveActiveTask();
      }
      return;
    }

    let item = dataForSpider[index];
    let arrTo = [...item.stationsNameCHN];

    console.log(`开始爬${item.stationsName}站 (${index + 1}/${flag})`);

    // Notify progress
    const progressData = {
      current: index + 1,
      total: flag,
      stationName: item.stationsName,
      status: '正在爬取'
    };
    console.log('[Socket Emit] train:progress', progressData);
    io.emit('train:progress', progressData);
    if (activeTask) {
      activeTask.current = progressData.current;
      activeTask.total = progressData.total;
      activeTask.stationName = progressData.stationName;
      activeTask.status = progressData.status;
      saveActiveTask();
    }

    try {
      if (!browser) {
        browser = await puppeteer.launch({
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
          dumpio: false,
        });
        activeBrowser = browser;
      }

      if (!page) {
        page = await browser.newPage();
        activePage = page;
        await page.goto(testURL, { waitUntil: 'networkidle2' });
      }

      if (shouldCancel) throw new Error('CANCELLED');

      if (page.url() === "https://www.12306.cn/mormhweb/logFiles/error.html") {
        console.log('爬虫被BAN！系统准备休眠10mins！');
        const banStatus = '被封禁，休眠10分钟';
        io.emit('train:progress', {
          current: index + 1,
          total: flag,
          stationName: item.stationsName,
          status: banStatus
        });
        if (activeTask) {
          activeTask.status = banStatus;
          saveActiveTask();
        }
        await page.close();
        page = null;
        activePage = null;
        sleepTimes++;
        
        try {
          await sleepWithHeartbeat(browser, 1000 * 60 * 10);
        } catch (e) {
          if (taskGeneration !== generation || shouldCancel) throw new Error('CANCELLED');
          await sleep(1000 * 60 * 10);
        }
        if (taskGeneration !== generation) return;
        continue; // Retry the current index
      }

      const warningBtn = await page.$('#qd_closeDefaultWarningWindowDialog_id');
      if (warningBtn) {
        await page.tap('#qd_closeDefaultWarningWindowDialog_id');
      }

      if (shouldCancel) throw new Error('CANCELLED');

      // Clear/Input fromStation
      await page.tap('#fromStationText');
      for (let i = 0; i < arrFrom.length; i++){
        await page.keyboard.press(arrFrom[i]);
      }
      await page.waitForSelector('#panel_cities');
      const elements = await page.$$('#panel_cities > *');
      for (const element of elements) {
        const span = await element.$('span:first-child');
        if (!span) continue;
        const spanText = await span.evaluate(el => el.textContent.trim());
        if (spanText === fromStationObj.stationsName) {
          await element.evaluate(el => {
            el.click();
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
          break;
        }
      }
      await sleep(1000);

      if (shouldCancel) throw new Error('CANCELLED');

      // Input toStation
      await page.tap('#toStationText');
      for (let i = 0; i < arrTo.length; i++){
        await page.keyboard.press(arrTo[i]);
      }
      await page.waitForSelector('#panel_cities');
      const elements1 = await page.$$('#panel_cities > *');
      for (const element1 of elements1) {
        const span1 = await element1.$('span:first-child');
        if (!span1) continue;
        const spanText1 = await span1.evaluate(el => el.textContent.trim());
        if (spanText1 === item.stationsName) {
          await element1.evaluate(el => {
            el.click();
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
          break;
        }
      }
      await sleep(1000);

      if (shouldCancel) throw new Error('CANCELLED');

      // Select tomorrow or target date range
      await page.click('#date_range>ul>li:nth-child(2)');
      await sleep(2000);

      if (shouldCancel) throw new Error('CANCELLED');

      // Wait for AJAX to complete
      while(true) {
        if (shouldCancel) throw new Error('CANCELLED');
        const className = await page.$eval('#query_ticket', element => element.className);
        if (className === 'btn92s') {
          console.log(`爬${item.stationsName}站的Ajax请求完成！`);
          break;
        } else {
          console.log(`等待爬${item.stationsName}站的Ajax请求加载完成！`);
          await sleep(2000);
        }
      }

      if (shouldCancel) throw new Error('CANCELLED');

      const result = await page.evaluate(() => {
        var result = [];
        var arr = document.querySelectorAll('.ticket-info');
        if (arr && arr.length > 0) {
          for (let i = 0; i < arr.length; i++) {
            if (arr[i].querySelector('.ls>strong')) {
              let No = arr[i].querySelector('.train > div > a').innerText;
              let depart = arr[i].querySelector('.cds>.start-t ').innerText;
              let arrive = arr[i].querySelector('.cds>.color999').innerText;
              let duration = arr[i].querySelector('.ls>strong').innerText;
              result.push({ No, depart, arrive, duration });
            }
          }
        }
        return result;
      });

      console.log(`${fromStationObj.stationsName}-->${item.stationsName}共【${result.length}】个车次`);
      if (result.length > 0) {
        let resultInfo = trainFilter(item.stationsName, result, item.inWhichCity, item.inWhichProvince, filterSettings);
        if (resultInfo) {
          await Excel(resultInfo, to);
          // Send result back to the frontend
          console.log('[Socket Emit] train:result', resultInfo);
          io.emit('train:result', resultInfo);
          // Cache results in memory
          if (activeTask) {
            activeTask.results.push(resultInfo);
            saveActiveTask();
          }
        }
      }

      await page.close();
      page = null;
      activePage = null;

      console.log(`${item.stationsName}站已经爬完！${index + 1}/${flag}，已经用时${formatTimeDiff(Date.now() - timestamp1)}`);

      try {
        fs.writeFileSync(trainFlagPath, index.toString());
      } catch (e) {
        console.error('写入 trainFlagPath 失败', e);
      }

      index++;

      if (index === flag) {
        console.log(`爬虫结束！总用时${formatTimeDiff(Date.now() - timestamp1)}，休眠${sleepTimes}次！`);
        try {
          fs.writeFileSync(trainFlagPath, '10086');
        } catch (e) {}
        if (browser) {
          await browser.close();
          browser = null;
          activeBrowser = null;
        }
        const doneData = {
          total: flag,
          elapsed: formatTimeDiff(Date.now() - timestamp1)
        };
        console.log('[Socket Emit] train:done', doneData);
        io.emit('train:done', doneData);
        if (activeTask) {
          activeTask.status = `已完成 (用时: ${doneData.elapsed})`;
          saveActiveTask();
        }
        return;
      } else {
        await sleep(Math.random() * 2000 + 1000);
      }

    } catch (error) {
      if (taskGeneration !== generation || shouldCancel || error.message === 'CANCELLED') {
        console.log('[Train Scraper] Task superseded or cancelled inside catch block');
        if (activeTask && taskGeneration !== generation) {
          activeTask.status = '已取消';
          saveActiveTask();
        }
        return;
      }

      console.log(`爬虫出错，错误信息：${error.message}。10min后重新爬${item.stationsName}站！`);
      const errorStatus = `出错: ${error.message}，10分钟后重试`;
      io.emit('train:progress', {
        current: index + 1,
        total: flag,
        stationName: item.stationsName,
        status: errorStatus
      });
      if (activeTask) {
        activeTask.status = errorStatus;
        saveActiveTask();
      }

      if (page) {
        await page.close().catch(() => {});
        page = null;
        activePage = null;
      }

      if (browser) {
        try {
          await sleepWithHeartbeat(browser, 1000 * 60 * 10);
        } catch (e) {
          if (taskGeneration !== generation || shouldCancel) return;
          await sleep(1000 * 60 * 10);
        }
        if (taskGeneration !== generation || shouldCancel) return;
        await browser.close().catch(() => {});
        browser = null;
        activeBrowser = null;
      } else {
        await sleep(1000 * 60 * 10);
      }

      if (taskGeneration !== generation || shouldCancel) return;
      sleepTimes++;
    }
  }
}

class TrainCtl {
  async startCrawler(ctx) {
    const { from, to, filterSettings, reset } = ctx.request.body;
    const io = ctx.state.io;

    if (!from || !to) {
      ctx.status = 400;
      ctx.body = { error: '参数 from 和 to 必填' };
      return;
    }

    if (isRunning) {
      ctx.status = 400;
      ctx.body = { error: '爬虫任务正在运行中，请勿重复启动' };
      return;
    }

    isRunning = true;
    shouldCancel = false;
    taskGeneration++;
    const currentGeneration = taskGeneration;

    // Smart resume/reset based on parameters change
    let shouldReset = true;
    try {
      if (fs.existsSync(queryCachePath)) {
        const cached = JSON.parse(fs.readFileSync(queryCachePath, 'utf8'));
        const fromName = typeof from === 'string' ? from : (from.stationsName || '');
        const cachedFromName = typeof cached.from === 'string' ? cached.from : (cached.from.stationsName || '');
        
        const isSameParams = fromName === cachedFromName && to === cached.to;
        const isSameFilters = JSON.stringify(filterSettings || {}) === JSON.stringify(cached.filterSettings || {});
        
        console.log('[Train Scraper] Comparison details:');
        console.log(`- fromName: "${fromName}", cachedFromName: "${cachedFromName}", isSame: ${fromName === cachedFromName}`);
        console.log(`- to: "${to}", cached.to: "${cached.to}", isSame: ${to === cached.to}`);
        console.log(`- isSameParams: ${isSameParams}`);
        console.log(`- isSameFilters: ${isSameFilters}`);
        if (!isSameFilters) {
          console.log(`  - filterSettings: ${JSON.stringify(filterSettings)}`);
          console.log(`  - cached.filterSettings: ${JSON.stringify(cached.filterSettings)}`);
        }

        if (isSameParams && isSameFilters) {
          // Same parameters and same filters! Keep the resume index.
          shouldReset = false;
          console.log('[Train Scraper] Parameters and filters match last query, keeping resume index');
        }
      } else {
        console.log('[Train Scraper] No query cache file found');
      }
    } catch (e) {
      console.error('Failed to read last query cache:', e.message);
    }

    if (reset) {
      shouldReset = true;
      console.log('[Train Scraper] Reset requested by client, forcing fresh start');
    }

    console.log(`[Train Scraper] startCrawler: reset = ${reset}, shouldReset = ${shouldReset}`);

    if (shouldReset) {
      console.log('[Train Scraper] Parameters or filters changed, resetting index to 0');
      try {
        fs.writeFileSync(trainFlagPath, '0');
        fs.writeFileSync(queryCachePath, JSON.stringify({ from, to, filterSettings }));
      } catch (e) {
        console.error('Failed to write last query cache:', e.message);
      }
    }

    // Preserve previous results when resuming (same params, same filters)
    const previousResults = (!shouldReset && activeTask && activeTask.results) ? activeTask.results : [];

    activeTask = {
      from,
      to,
      filterSettings,
      current: 0,
      total: 0,
      stationName: '',
      status: '已启动',
      results: previousResults
    };
    saveActiveTask();

    // Start background task
    runCrawlerTask(from, to, io, filterSettings, currentGeneration)
      .catch((err) => {
        if (taskGeneration !== currentGeneration) return;
        console.error('后台爬虫出错:', err);
        console.log('[Socket Emit] train:error (startCrawler catch)', err.message);
        io.emit('train:error', { message: err.message });
        if (activeTask) {
          activeTask.status = `出错: ${err.message}`;
          saveActiveTask();
        }
      })
      .finally(() => {
        if (taskGeneration === currentGeneration) {
          isRunning = false;
          shouldCancel = false;
          activeBrowser = null;
          activePage = null;
        }
      });

    ctx.body = { status: 'started', message: '已成功启动后台爬虫' };
  }

  async stopCrawler(ctx) {
    if (!isRunning) {
      ctx.body = { message: '当前没有运行中的爬虫任务' };
      return;
    }

    shouldCancel = true;
    isRunning = false;

    // Instantly close page and browser if active to break out of puppeteer waits
    if (activePage) {
      activePage.close().catch(() => {});
      activePage = null;
    }
    if (activeBrowser) {
      activeBrowser.close().catch(() => {});
      activeBrowser = null;
    }

    if (activeTask) {
      activeTask.status = '已取消';
      saveActiveTask();
    }

    ctx.body = { status: 'stopped', message: '已成功发送取消指令' };
  }

  async getStatus(ctx) {
    ctx.body = { isRunning, activeTask };
  }

  async clearCache(ctx) {
    activeTask = null;
    try {
      if (fs.existsSync(activeTaskCachePath)) {
        fs.unlinkSync(activeTaskCachePath);
      }
      if (fs.existsSync(queryCachePath)) {
        fs.unlinkSync(queryCachePath);
      }
      if (fs.existsSync(trainFlagPath)) {
        fs.writeFileSync(trainFlagPath, '0');
      }
    } catch (e) {
      console.error('[Train Scraper] Failed to clear query cache:', e.message);
    }
    ctx.body = { status: 'cleared', message: '已成功清除火车票缓存数据' };
  }
}

module.exports = new TrainCtl();
