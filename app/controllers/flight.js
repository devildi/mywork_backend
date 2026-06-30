const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AnonymizeUA = require('puppeteer-extra-plugin-anonymize-ua');
const xls = require('exceljs');

const {
  sleep,
  formatTimeDiff,
  airportCities
} = require('../config');

// Register stealth and UA plugins
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

// Global cache for the active/last flight crawler task
let activeTask = null;
const ticketFlagPath = path.join(__dirname, '../../results/ticketFlag.txt');
const queryCachePath = path.join(__dirname, '../../results/lastFlightQuery.json');
const activeTaskCachePath = path.join(__dirname, '../../results/activeFlightTask.json');
const resultsDir = path.join(__dirname, '../../results');

// Ensure results dir exists
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

function saveActiveTask() {
  try {
    fs.writeFileSync(activeTaskCachePath, JSON.stringify(activeTask, null, 2));
  } catch (e) {
    console.error('[Flight Scraper] Failed to save activeTask to disk:', e.message);
  }
}

function loadActiveTask() {
  try {
    if (fs.existsSync(activeTaskCachePath)) {
      activeTask = JSON.parse(fs.readFileSync(activeTaskCachePath, 'utf8'));
      console.log('[Flight Scraper] Loaded activeTask from disk cache');
      if (activeTask && (activeTask.status === '已启动' || activeTask.status.includes('正在') || activeTask.status.includes('出错'))) {
        activeTask.status = '已中止';
        saveActiveTask();
      }
    }
  } catch (e) {
    console.error('[Flight Scraper] Failed to load activeTask from disk:', e.message);
  }
}

loadActiveTask();

async function writeToExcel(data) {
  const filePath = path.join(resultsDir, 'ticketInfo.xlsx');
  const workbook = new xls.Workbook();
  let sheet;

  try {
    if (fs.existsSync(filePath)) {
      await workbook.xlsx.readFile(filePath);
      sheet = workbook.getWorksheet('机票信息') || workbook.addWorksheet('机票信息');
    } else {
      sheet = workbook.addWorksheet('机票信息');
    }

    sheet.columns = [
      { header: '城市', key: 'city', width: 15 },
      { header: '总价', key: 'totalPrice', width: 15 },
      { header: '出发日期', key: 'departureDate', width: 15 },
      { header: '返回日期', key: 'returnDate', width: 15 },
      { header: '去程出发时间', key: 'goDepartTime', width: 15 },
      { header: '去程到达时间', key: 'goArriveTime', width: 15 },
      { header: '去程价格', key: 'goPrice', width: 15 },
      { header: '去程耗时', key: 'goDurating', width: 15 },
      { header: '回程出发时间', key: 'returnDepartTime', width: 15 },
      { header: '回程到达时间', key: 'returnArriveTime', width: 15 },
      { header: '回程价格', key: 'returnPrice', width: 15 },
      { header: '回程耗时', key: 'returnDurating', width: 15 },
    ];

    sheet.addRow(data);
    await workbook.xlsx.writeFile(filePath);
    console.log(`[Flight Scraper] Data written to Excel: ${filePath}`);
  } catch (err) {
    console.error('[Flight Scraper] Failed to write to Excel:', err.message);
    throw err;
  }
}

async function runCrawlerTask(from, departureDate, returnDate, io, generation) {
  shouldCancel = false;
  activeBrowser = null;
  activePage = null;

  const flag = airportCities.length;
  let index = 0;

  // Breakpoint resume logic based on ticketFlag.txt
  try {
    if (fs.existsSync(ticketFlagPath)) {
      const flagData = fs.readFileSync(ticketFlagPath, 'utf8').trim();
      const number = Number(flagData);
      if (number !== 10086 && number >= 0 && number < flag) {
        index = number;
      }
    }
  } catch (e) {
    console.error('[Flight Scraper] Failed to read ticketFlag.txt, starting from 0:', e.message);
  }

  const timestamp1 = Date.now();
  let browser = null;
  let sleepTimes = 0;

  console.log(`[Flight Scraper] Started. Departure: ${from}, dates: ${departureDate} to ${returnDate}. Cities count: ${flag}. Starting index: ${index}`);

  while (index < flag) {
    if (taskGeneration !== generation || shouldCancel) {
      console.log('[Flight Scraper] Task superseded or cancelled before next city');
      if (activeTask && taskGeneration !== generation) {
        activeTask.status = '已取消';
        saveActiveTask();
      }
      return;
    }

    const currentCity = airportCities[index];
    if (from === currentCity) {
      console.log(`[Flight Scraper] Skip same city: ${currentCity}`);
      index++;
      continue;
    }

    console.log(`\n=================== 开始爬取 [${index + 1}/${flag}]: ${currentCity} ===================`);

    // Notify progress: Departure flight
    let progressData = {
      current: index + 1,
      total: flag,
      cityName: currentCity,
      status: '正在爬去程'
    };
    io.emit('flight:progress', progressData);
    if (activeTask) {
      activeTask.current = progressData.current;
      activeTask.total = progressData.total;
      activeTask.cityName = progressData.cityName;
      activeTask.status = progressData.status;
      saveActiveTask();
    }

    try {
      if (!browser) {
        browser = await puppeteer.launch({
          headless: true,
          defaultViewport: null,
          args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
        });
        activeBrowser = browser;
      }

      if (shouldCancel) throw new Error('CANCELLED');

      const goFlight = await single(browser, from, currentCity, departureDate);
      
      if (shouldCancel) throw new Error('CANCELLED');

      if (goFlight === 'nextloop' || goFlight === 'sameCity') {
        console.log(`从【${from}】到【${currentCity}】去程无直飞航班或数据无效，跳过！`);
        index++;
        fs.writeFileSync(ticketFlagPath, index.toString());
        await sleep(1000);
        continue;
      }

      await sleep(1500);
      if (shouldCancel) throw new Error('CANCELLED');

      // Notify progress: Return flight
      progressData.status = '正在爬回程';
      io.emit('flight:progress', progressData);
      if (activeTask) {
        activeTask.status = progressData.status;
        saveActiveTask();
      }

      const returnFlight = await single(browser, currentCity, from, returnDate);

      if (shouldCancel) throw new Error('CANCELLED');

      if (returnFlight === 'nextloop' || returnFlight === 'sameCity') {
        console.log(`从【${currentCity}】到【${from}】回程无直飞航班或数据无效，跳过！`);
        index++;
        fs.writeFileSync(ticketFlagPath, index.toString());
        await sleep(1000);
        continue;
      }

      // We have both go and return flights!
      const totalPrice = Number(goFlight.price) + Number(returnFlight.price);
      const flightResult = {
        city: currentCity,
        totalPrice,
        goDepartTime: goFlight.departTime,
        goArriveTime: goFlight.arriveTime,
        goPrice: goFlight.price,
        goDurating: goFlight.durating,
        returnDepartTime: returnFlight.departTime,
        returnArriveTime: returnFlight.arriveTime,
        returnPrice: returnFlight.price,
        returnDurating: returnFlight.durating,
        departureDate,
        returnDate
      };

      await writeToExcel(flightResult);

      if (shouldCancel) throw new Error('CANCELLED');

      // Emit search result
      console.log('[Socket Emit] flight:result', flightResult);
      io.emit('flight:result', flightResult);

      if (activeTask) {
        activeTask.results.push(flightResult);
        saveActiveTask();
      }

      index++;
      fs.writeFileSync(ticketFlagPath, index.toString());
      console.log(`进度已保存: ticketFlag = ${index}`);

      await sleep(Math.random() * 2000 + 1500);

    } catch (error) {
      if (taskGeneration !== generation || shouldCancel || error.message === 'CANCELLED') {
        console.log('[Flight Scraper] Task superseded or cancelled in catch block');
        if (activeTask && taskGeneration !== generation) {
          activeTask.status = '已取消';
          saveActiveTask();
        }
        return;
      }

      console.error(`[Flight Scraper] Error crawling ${currentCity}: ${error.message}. Wait 5min and retry!`);
      const errorStatus = `出错: ${error.message}，5分钟后重试`;
      
      io.emit('flight:progress', {
        current: index + 1,
        total: flag,
        cityName: currentCity,
        status: errorStatus
      });
      if (activeTask) {
        activeTask.status = errorStatus;
        saveActiveTask();
      }

      if (activePage) {
        await activePage.close().catch(() => {});
        activePage = null;
      }
      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
        activeBrowser = null;
      }

      sleepTimes++;
      // Wait for 5 minutes
      await sleep(1000 * 60 * 5);
    }
  }

  // Finished all cities
  if (browser) {
    await browser.close().catch(() => {});
    activeBrowser = null;
  }
  
  try {
    fs.writeFileSync(ticketFlagPath, '10086');
    console.log('[Flight Scraper] All cities crawled successfully. Reset index to 10086');
  } catch (err) {
    console.error('[Flight Scraper] Failed to reset ticketFlag.txt:', err.message);
  }

  const elapsed = formatTimeDiff(Date.now() - timestamp1);
  console.log(`[Flight Scraper] Finished! Time elapsed: ${elapsed}, sleep count: ${sleepTimes}`);
  
  const doneData = {
    total: flag,
    elapsed
  };
  io.emit('flight:done', doneData);
  if (activeTask) {
    activeTask.status = `已完成 (用时: ${elapsed})`;
    saveActiveTask();
  }
}

async function single(browser, fromCity, toCity, date) {
  if (shouldCancel) throw new Error('CANCELLED');
  if (fromCity === toCity) return 'sameCity';

  const page = await browser.newPage();
  activePage = page;

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    if (shouldCancel) throw new Error('CANCELLED');

    await page.goto('https://sjipiao.fliggy.com/flight_search_result.htm', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log(`[Flight Scraper] Filling form: ${fromCity} -> ${toCity} (${date})`);

    // 1. Input departure city
    await page.waitForSelector('.pi-input.J_DepCity.ks-autocomplete-input', { visible: true });
    await page.click('.pi-input.J_DepCity.ks-autocomplete-input');
    await page.evaluate(() => document.querySelector('.pi-input.J_DepCity.ks-autocomplete-input').value = '');
    await page.type('.pi-input.J_DepCity.ks-autocomplete-input', fromCity);
    await sleep(1000);
    await page.keyboard.press('Enter');

    if (shouldCancel) throw new Error('CANCELLED');

    // 2. Input arrival city
    await page.waitForSelector('.pi-input.J_ArrCity.ks-autocomplete-input', { visible: true });
    await page.click('.pi-input.J_ArrCity.ks-autocomplete-input');
    await page.evaluate(() => document.querySelector('.pi-input.J_ArrCity.ks-autocomplete-input').value = '');
    await page.type('.pi-input.J_ArrCity.ks-autocomplete-input', toCity);
    await sleep(1000);
    await page.keyboard.press('Enter');

    if (shouldCancel) throw new Error('CANCELLED');

    // 3. Input departure date
    await page.waitForSelector('.pi-input.J_DepDate.trigger-node-602', { visible: true });
    await page.evaluate((d) => {
      const input = document.querySelector('.pi-input.J_DepDate.trigger-node-602');
      if (input) {
        input.value = d;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, date);
    await sleep(1000);

    if (shouldCancel) throw new Error('CANCELLED');

    // Check if airport is supported
    let noAirport = false;
    const noAirportDivs = await page.$$('.ks-ac-message.J_AcMessage');
    for (const element of noAirportDivs) {
      const display = await element.evaluate(el => el.style.display);
      if (display === '') {
        noAirport = true;
      }
    }
    if (noAirport) {
      await page.close();
      activePage = null;
      return 'nextloop';
    }

    if (shouldCancel) throw new Error('CANCELLED');

    // 4. Click search
    await page.waitForSelector('.pi-btn.pi-btn-primary', { visible: true });
    await page.click('.pi-btn.pi-btn-primary');

    if (shouldCancel) throw new Error('CANCELLED');

    // 检测并点击可能出现的跳转提示按钮 (notify-panel-dialog 下的 notify-button)
    try {
      const btnSelector = '.notify-panel-dialog .notify-button, .notify-button';
      const extraBtn = await page.waitForSelector(btnSelector, { visible: true, timeout: 3500 });
      if (extraBtn) {
        console.log('[Flight Scraper] Transition/notification button detected, clicking...');
        await extraBtn.click();
        await sleep(1500);
      }
    } catch (err) {
      // Ignore if not present
    }

    if (shouldCancel) throw new Error('CANCELLED');

    // 等待部分内容加载，允许弹窗出现
    await sleep(3500);

    // 检测并关闭弹窗
    try {
      const closeSelectors = [
        '.next-dialog-close',
        '.dialog-close',
        '.close-btn',
        '.close',
        '.h5-dialog-close',
        '.pi-dialog-close',
        '.pi-close',
        '.dialog-close-button',
        '.next-icon-close'
      ];
      for (const selector of closeSelectors) {
        const closeBtn = await page.$(selector);
        if (closeBtn) {
          const visible = await closeBtn.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
          });
          if (visible) {
            console.log(`[Flight Scraper] Dialog detected, closing via selector [${selector}]...`);
            await closeBtn.click();
            await sleep(1000);
          }
        }
      }
    } catch (err) {
      console.error('[Flight Scraper] Error detecting/closing dialog:', err.message);
    }

    if (shouldCancel) throw new Error('CANCELLED');

    // 继续等待页面内容加载与渲染
    await sleep(4500);

    if (shouldCancel) throw new Error('CANCELLED');

    // Handle Alibaba slide captcha
    const iframeElement = await page.$('#baxia-dialog-content');
    if (iframeElement) {
      console.log('[Flight Scraper] Captcha slide detected, trying to solve...');
      const iframe = await iframeElement.contentFrame();

      const firstElement = await Promise.race([
        iframe.waitForSelector('.nc_iconfont', { visible: true, timeout: 5000 }),
        iframe.waitForSelector('.captcha-tips', { visible: true, timeout: 5000 })
      ]).catch(() => null);

      if (firstElement) {
        const className = await firstElement.evaluate(el => el.className);
        if (className === 'captcha-tips') {
          console.log('[Flight Scraper] Captcha load failed (manual intervention needed), skipping');
          await page.close();
          activePage = null;
          return 'sameCity';
        }

        const sliderHandle = await iframe.$('.nc_iconfont');
        const sliderTrack = await iframe.$('.nc_scale');
        const handle = await sliderHandle.boundingBox();
        const track = await sliderTrack.boundingBox();

        const dragDistance = track.width - handle.width + 10;

        await sliderHandle.hover();
        await page.mouse.down();

        let currentX = handle.x + handle.width / 2;
        let currentY = handle.y + handle.height / 2;

        const steps = 15;
        for (let i = 1; i <= steps; i++) {
          if (shouldCancel) throw new Error('CANCELLED');
          const t = i / steps;
          const ease = Math.sin(t * Math.PI / 2);
          const targetX = currentX + (dragDistance * ease);
          const targetY = currentY + (Math.random() * 2 - 1);

          await page.mouse.move(targetX, targetY);
          await sleep(Math.random() * 30 + 30);
        }

        await page.mouse.up();
        console.log('[Flight Scraper] Captcha slide submitted, waiting for refresh...');
        await sleep(3000);
      }
    }

    if (shouldCancel) throw new Error('CANCELLED');

    // 5. Ensure price ascending sort
    const flightSorter = await page.$('#J_FlightSorter');
    if (flightSorter) {
      const sortByPrice = await flightSorter.$('#J_SortByPrice');
      if (sortByPrice) {
        const span = await sortByPrice.$('span');
        if (span) {
          const className = await span.evaluate(el => el.className);
          const title = await span.evaluate(el => el.title);
          if (className !== 'J_Tip current' || title !== '点击按票价从高到低') {
            await sortByPrice.click();
            await sleep(1500);
          }
        }
      }
    }

    if (shouldCancel) throw new Error('CANCELLED');

    // Check no-flights banner
    const noneInfo = await page.$('.list-information');
    if (noneInfo) {
      console.log('[Flight Scraper] No direct flights found');
      await page.close();
      activePage = null;
      return 'sameCity';
    }

    await page.waitForSelector('.flight-list-item.clearfix.J_FlightItem', { visible: true, timeout: 15000 });

    const allFlights = await page.evaluate(() => {
      const items = document.querySelectorAll('.flight-list-item.clearfix.J_FlightItem');
      const results = [];
      items.forEach(flightItem => {
        const priceText = flightItem.querySelector('.J_FlightListPrice')?.textContent?.trim();
        const price = Number(priceText);
        if (!isNaN(price) && price > 0) {
          const timeCell = flightItem.querySelector('.flight-time');
          const departTime = timeCell?.querySelector('.flight-time-deptime')?.textContent?.trim();
          const arriveTime = timeCell?.querySelector('span:nth-child(1)')?.textContent?.trim();
          const durating = flightItem.querySelector('.flight-total-time')?.textContent?.trim();

          const routeCell = flightItem.querySelector('.flight-route') || flightItem.querySelector('.flight-transfer');
          const routeText = routeCell?.textContent?.trim() || '';
          const isDirect = !routeText.includes('转') && !routeText.includes('停');

          results.push({
            durating,
            price,
            departTime,
            arriveTime,
            isDirect
          });
        }
      });
      return results;
    });

    if (allFlights.length === 0) {
      console.log('[Flight Scraper] No valid flights found in the list');
      await page.close();
      activePage = null;
      return 'sameCity';
    }

    // Direct flight preferred; fallback to transfer
    const directFlights = allFlights.filter(f => f.isDirect);
    const targetList = directFlights.length > 0 ? directFlights : allFlights;

    // Get cheapest
    const cheapestFlight = targetList.reduce((prev, curr) => prev.price < curr.price ? prev : curr);

    console.log(`[Flight Scraper] Best flight found: ¥${cheapestFlight.price}, duration: ${cheapestFlight.durating}`);
    await page.close();
    activePage = null;
    return cheapestFlight;

  } catch (e) {
    await page.close().catch(() => {});
    activePage = null;
    throw e;
  }
}

class FlightCtl {
  async startCrawler(ctx) {
    const { from, departureDate, returnDate, reset } = ctx.request.body;
    const io = ctx.state.io;

    if (!from || !departureDate || !returnDate) {
      ctx.status = 400;
      ctx.body = { error: '参数 from, departureDate 和 returnDate 必填' };
      return;
    }

    if (isRunning) {
      ctx.status = 400;
      ctx.body = { error: '飞机票爬虫任务正在运行中，请勿重复启动' };
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
        const isSameParams = from === cached.from &&
                             departureDate === cached.departureDate &&
                             returnDate === cached.returnDate;
        
        console.log('[Flight Scraper] Comparison details:');
        console.log(`- from: "${from}", cached.from: "${cached.from}", isSame: ${from === cached.from}`);
        console.log(`- departureDate: "${departureDate}", cached.dep: "${cached.departureDate}", isSame: ${departureDate === cached.departureDate}`);
        console.log(`- returnDate: "${returnDate}", cached.ret: "${cached.returnDate}", isSame: ${returnDate === cached.returnDate}`);
        console.log(`- isSameParams: ${isSameParams}`);

        if (isSameParams) {
          shouldReset = false;
          console.log('[Flight Scraper] Parameters match last query, keeping resume index');
        }
      } else {
        console.log('[Flight Scraper] No query cache file found');
      }
    } catch (e) {
      console.error('[Flight Scraper] Failed to read last query cache:', e.message);
    }

    if (reset) {
      shouldReset = true;
      console.log('[Flight Scraper] Reset requested by client, forcing fresh start');
    }

    console.log(`[Flight Scraper] startCrawler: reset = ${reset}, shouldReset = ${shouldReset}`);

    if (shouldReset) {
      console.log('[Flight Scraper] Parameters changed or reset requested, resetting index to 0');
      try {
        fs.writeFileSync(ticketFlagPath, '0');
        fs.writeFileSync(queryCachePath, JSON.stringify({ from, departureDate, returnDate }));
      } catch (e) {
        console.error('[Flight Scraper] Failed to write last query cache:', e.message);
      }
    }

    const previousResults = (!shouldReset && activeTask && activeTask.results) ? activeTask.results : [];

    activeTask = {
      from,
      departureDate,
      returnDate,
      current: 0,
      total: airportCities.length,
      cityName: '',
      status: '已启动',
      results: previousResults
    };
    saveActiveTask();

    // Run background scraping task
    runCrawlerTask(from, departureDate, returnDate, io, currentGeneration)
      .catch((err) => {
        if (taskGeneration !== currentGeneration) return;
        console.error('[Flight Scraper] Background process failed:', err);
        io.emit('flight:error', { message: err.message });
        if (activeTask) {
          activeTask.status = `出错: ${err.message}`;
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

    ctx.body = { status: 'started', message: '已成功启动飞机票后台爬虫' };
  }

  async stopCrawler(ctx) {
    if (!isRunning) {
      ctx.body = { message: '当前没有运行中的飞机票爬虫任务' };
      return;
    }

    shouldCancel = true;
    isRunning = false;

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
      if (fs.existsSync(ticketFlagPath)) {
        fs.writeFileSync(ticketFlagPath, '0');
      }
    } catch (e) {
      console.error('[Flight Scraper] Failed to clear query cache:', e.message);
    }
    ctx.body = { status: 'cleared', message: '已成功清除飞机票缓存数据' };
  }
}

module.exports = new FlightCtl();
