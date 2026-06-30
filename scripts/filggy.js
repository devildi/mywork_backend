const xls = require("exceljs")
const path = require('path')
const fs = require('fs')

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const {
    sleep,
    formatTimeDiff,
    airportCities
} = require('../app/config')

const ticketFlagPath = path.join(__dirname, '../results/ticketFlag.txt')
const resultsDir = path.join(__dirname, '../results')

let deBugMode = false

const timestamp1 = Date.now()
let sleepTimes = 0
let from = '沈阳'
let departureDate = '2026-02-18'
let returnDate = '2026-02-23'
let citie = deBugMode ? ["本溪", "上海", "沈阳"] : airportCities

// 确保 results 目录存在
if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
}

// 安全读取 flag 进度
let startIndex = 0;
try {
    if (fs.existsSync(ticketFlagPath)) {
        const flagData = fs.readFileSync(ticketFlagPath, 'utf8').trim();
        const number = Number(flagData);
        if (number === 10086) {
            startIndex = 0;
        } else if (!isNaN(number) && number >= 0 && number < citie.length) {
            startIndex = number;
        }
    }
} catch (e) {
    console.error('读取 ticketFlag.txt 进度文件失败, 默认从0开始:', e.message);
}

// 启动爬虫循环
runScraper(departureDate, returnDate, citie.length, startIndex);

async function runScraper(departureDate, returnDate, flag, startIdx) {
    let browser = null;
    let index = startIdx;
    let noAirport = false;

    while (index < flag) {
        console.log(`\n=================== 开始爬取 [${index + 1}/${flag}]: ${citie[index]} ===================`);
        try {
            if (!browser) {
                browser = await puppeteer.launch({
                    headless: true,
                    defaultViewport: null,
                    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
                });
            }

            // 串行执行，避免由于高频并发在同一 IP 下触发滑块
            const goFlight = await single(browser, from, citie[index], departureDate);
            await sleep(1500);
            const returnFlight = await single(browser, citie[index], from, returnDate);

            if (goFlight === 'nextloop' || returnFlight === 'nextloop' ||
                goFlight === 'sameCity' || returnFlight === 'sameCity') {
                console.log(`从【${from}】到【${citie[index]}】无直飞航班或数据无效，跳过！`);
            } else {
                let toCSVData = {
                    city: citie[index],
                    totalPrice: Number(goFlight.price) + Number(returnFlight.price),
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

                await excel(toCSVData);
                // 写入当前已成功爬取完毕的下标
                fs.writeFileSync(ticketFlagPath, (index + 1).toString());
                console.log(`进度已保存: ticketFlag = ${index + 1}`);
            }

            index++;
            noAirport = false;
            await sleep(Math.random() * 2000 + 1500);

        } catch (error) {
            console.error(`爬虫出错，错误信息：${error.message}。5min后重新爬【${citie[index]}】！`);
            if (browser) {
                await browser.close().catch(() => { });
                browser = null;
            }
            noAirport = false;
            sleepTimes++;
            await sleep(1000 * 60 * 5);
        }
    }

    // 爬取完全部任务
    if (browser) {
        await browser.close().catch(() => { });
    }
    try {
        fs.writeFileSync(ticketFlagPath, '10086');
        console.log('所有城市爬取完毕，进度索引已复位为 10086');
    } catch (err) {
        console.error('复位 ticketFlag.txt 文件出错:', err);
    }
    console.log(`爬虫结束！总用时${formatTimeDiff(Date.now() - timestamp1)}，休眠${sleepTimes}次！`);
}

async function single(browser, fromCity, toCity, date) {
    if (fromCity === toCity) return 'sameCity';

    let page = await browser.newPage();
    try {
        // 设置真实 UA，降低反爬拦截概率
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto('https://sjipiao.fliggy.com/flight_search_result.htm', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log(`正在填单: ${fromCity} -> ${toCity} (${date})`);

        // 1. 输入出发城市
        await page.waitForSelector('.pi-input.J_DepCity.ks-autocomplete-input', { visible: true });
        await page.click('.pi-input.J_DepCity.ks-autocomplete-input');
        await page.evaluate(() => document.querySelector('.pi-input.J_DepCity.ks-autocomplete-input').value = '');
        await page.type('.pi-input.J_DepCity.ks-autocomplete-input', fromCity);
        await sleep(1000);
        await page.keyboard.press('Enter');

        // 2. 输入到达城市
        await page.waitForSelector('.pi-input.J_ArrCity.ks-autocomplete-input', { visible: true });
        await page.click('.pi-input.J_ArrCity.ks-autocomplete-input');
        await page.evaluate(() => document.querySelector('.pi-input.J_ArrCity.ks-autocomplete-input').value = '');
        await page.type('.pi-input.J_ArrCity.ks-autocomplete-input', toCity);
        await sleep(1000);
        await page.keyboard.press('Enter');

        // 3. 输入出发日期（触发 React/Vue 底层事件绑定）
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

        // 检查是否支持目标机场（联想框是否有无机场提示）
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
            return 'nextloop';
        }

        // 4. 点击搜索
        await page.waitForSelector('.pi-btn.pi-btn-primary', { visible: true });
        await page.click('.pi-btn.pi-btn-primary');

        // 检测并点击可能出现的跳转提示按钮 (notify-panel-dialog 下的 notify-button)
        try {
            const btnSelector = '.notify-panel-dialog .notify-button, .notify-button';
            const extraBtn = await page.waitForSelector(btnSelector, { visible: true, timeout: 3500 });
            if (extraBtn) {
                console.log('检测到过渡跳转按钮，正在点击...');
                await extraBtn.click();
                await sleep(1500);
            }
        } catch (err) {
            // 未出现该按钮，忽略
        }

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
                        console.log(`检测到弹窗，正在通过选择器【${selector}】进行关闭...`);
                        await closeBtn.click();
                        await sleep(1000);
                    }
                }
            }
        } catch (err) {
            console.error('检测/关闭弹窗出错:', err.message);
        }

        // 继续等待页面内容加载与渲染
        await sleep(4500);

        // 处理阿里系的滑块验证码
        const iframeElement = await page.$('#baxia-dialog-content');
        if (iframeElement) {
            console.log('检测到滑块验证码，尝试破解...');
            const iframe = await iframeElement.contentFrame();

            const firstElement = await Promise.race([
                iframe.waitForSelector('.nc_iconfont', { visible: true, timeout: 5000 }),
                iframe.waitForSelector('.captcha-tips', { visible: true, timeout: 5000 })
            ]).catch(() => null);

            if (firstElement) {
                const className = await firstElement.evaluate(el => el.className);
                if (className === 'captcha-tips') {
                    console.log('验证码加载失败（需要手动干预），跳过当前城市');
                    await page.close();
                    return 'sameCity';
                }

                // 拟人化滑动拖动
                const sliderHandle = await iframe.$('.nc_iconfont');
                const sliderTrack = await iframe.$('.nc_scale');
                const handle = await sliderHandle.boundingBox();
                const track = await sliderTrack.boundingBox();

                const dragDistance = track.width - handle.width + 10;

                // 将鼠标平滑移动至滑块中心按下
                await sliderHandle.hover();
                await page.mouse.down();

                let currentX = handle.x + handle.width / 2;
                let currentY = handle.y + handle.height / 2;

                // 采用 Sine-wave 缓动算法模拟人手减速滑动
                const steps = 15;
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const ease = Math.sin(t * Math.PI / 2); // Sine ease-out
                    const targetX = currentX + (dragDistance * ease);
                    const targetY = currentY + (Math.random() * 2 - 1); // 微小垂直抖动

                    await page.mouse.move(targetX, targetY);
                    await sleep(Math.random() * 30 + 30);
                }

                await page.mouse.up();
                console.log('滑动验证码提交完毕，等待页面刷新...');
                await sleep(3000);
            }
        }

        // 5. 确保按价格从低到高排序
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

        // 6. 提取最低价格航班数据
        const noneInfo = await page.$('.list-information');
        if (noneInfo) {
            console.log(`未找到直飞航班！`);
            await page.close();
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

                    // 判断是否直飞（通常在航线或中转文字里不包含 "转" 或 "停"）
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
            console.log(`未找到有效航班！`);
            await page.close();
            return 'sameCity';
        }

        // 优先选直飞航班；如果没有直飞，则考虑转机
        const directFlights = allFlights.filter(f => f.isDirect);
        const targetList = directFlights.length > 0 ? directFlights : allFlights;

        // 找出最低价的一条
        const cheapestFlight = targetList.reduce((prev, curr) => prev.price < curr.price ? prev : curr);

        console.log(`-> 获取最便宜航班: 票价 ${cheapestFlight.price} 元, 耗时 ${cheapestFlight.durating} (${cheapestFlight.isDirect ? '直飞' : '转机/经停'})`);
        await page.close();
        return cheapestFlight;

    } catch (e) {
        await page.close().catch(() => { });
        throw e;
    }
}

async function excel(data) {
    const filePath = path.join(__dirname, '../results/ticketInfo.xlsx');
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
        console.log(`数据已成功写入 Excel: ${filePath}`);
    } catch (err) {
        console.error('写入 Excel 文件失败 (请确认文件未被 Excel 占用打开):', err.message);
        throw err;
    }
}