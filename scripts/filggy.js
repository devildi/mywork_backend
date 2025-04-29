//const puppeteer = require('puppeteer')
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

let deBugMode = false

const timestamp1 = Date.now()
let sleepTimes = 0
let from = '沈阳'
let departureDate = '2025-05-16'
let returnDate = '2025-05-18'
let citie = deBugMode ? ["本溪", "上海", "沈阳"] : airportCities
let browser = null
let noAirport = false
//let page = null
let number = null
const data = fs.readFileSync(ticketFlagPath, 'utf8')
number = Number(data.trim())

crawler(departureDate, returnDate, citie.length, number == 10086 ? 0 : number + 1)

async function crawler(departureDate, returnDate, flag, index = 0) {
    try {
        // 启动浏览器
        if(!browser){
            browser = await puppeteer.launch({
                //headless: false, // 设置为false可以看到浏览器操作
                defaultViewport: null, // 使用默认视口大小
                args: ['--start-maximized'] // 最大化窗口
            });
        }
        // if(!page){
        //     page = await browser.newPage();
        //     // 导航到目标网站
        //     await page.goto('https://sjipiao.fliggy.com/flight_search_result.htm', {
        //         waitUntil: 'networkidle2', // 等待网络空闲
        //         timeout: 60000 // 超时时间60秒
        //     });
        // }

        //let firstFlight = await singleTo(from, citie[index], departureDate)
        let results = await Promise.all([
            single(from, citie[index], departureDate),
            single(citie[index], from, returnDate)
        ])
        
        if(results[0] === 'nextloop' || results[1] === 'nextloop'){
            console.log(`从【${from}】到【${citie[index]}】无航班！`)
        } else if(results[0] === 'sameCity' || results[1] === 'sameCity'){
            console.log(`从【${from}】到【${citie[index]}】无航班！`)
        }
        else {
            let toCSVData = {
                city: citie[index],
                totalPrice: Number(results[0].price) + Number(results[1].price),
                goDepartTime: results[0].departTime,
                goArriveTime: results[0].arriveTime,
                goPrice: results[0].price,
                goDurating: results[0].durating,
                returnDepartTime: results[1].departTime,
                returnArriveTime: results[1].arriveTime,
                returnPrice: results[1].price,
                returnDurating: results[1].durating,
                departureDate,
                returnDate
            }
            await excel(toCSVData)
            fs.writeFileSync(ticketFlagPath, index.toString());
            console.log(`爬取【${from}】到【${citie[index]}】的往返机票信息已完成！${index + 1}/${flag}，已经用时${formatTimeDiff(Date.now() - timestamp1)}，物理内存占用：${(process.memoryUsage().rss/1024/1024).toFixed(1)}MB；JS堆内存已分配：${(process.memoryUsage().heapTotal/1024/1024).toFixed(1)}MB，已使用：${(process.memoryUsage().heapUsed/1024/1024).toFixed(1)}MB；`)
        }
        index++
        if(index === flag){
            try {
                fs.writeFileSync(ticketFlagPath, '10086');
                console.log('index已复位');
            } catch (err) {
                console.error('写入flag文件出错:', err);
            }
            console.log(`爬虫结束！总用时${formatTimeDiff(Date.now() - timestamp1)}，休眠${sleepTimes}次！`)
            await browser.close()
            browser = null
            noAirport = false
        } else{
            noAirport = false
            await sleep(Math.random() * 2000 + 1000)
            await crawler(departureDate, returnDate, flag, index)
        }
    } catch (error) {
        console.error(`爬虫出错，错误信息：${error.message}。5min后重新爬【${citie[index]}】！`);
		if(browser){
			await browser.close()
			browser = null
		}
		sleepTimes++
        await sleep(1000 * 60 * 5)
        await crawler(departureDate, returnDate, flag, index)
    }
}

async function single(from, to, departureDate) {
    let page = await browser.newPage();
    // 导航到目标网站
    await page.goto('https://sjipiao.fliggy.com/flight_search_result.htm', {
        waitUntil: 'networkidle2', // 等待网络空闲
        timeout: 60000 // 超时时间60秒
    });
    console.log(`开始爬取从【${from}】到【${to}】的机票信息...`);
    // 第一步：点击搜索类型的第二个子元素
    // await page.waitForSelector('.search-type.J_Radio', {visible: true});
    // await page.evaluate(() => {
    //     const searchType = document.querySelector('.search-type.J_Radio');
    //     if (searchType && searchType.children.length >= 2) {
    //         searchType.children[1].click(); // 点击第二个子元素
    //     }
    // });
    // 第二步：填写出发城市
    await page.waitForSelector('.pi-input.J_DepCity.ks-autocomplete-input', {visible: true});
    await page.type('.pi-input.J_DepCity.ks-autocomplete-input', from);
    //await page.keyboard.press('Enter');
    //console.log('已完成第二步：填写出发城市');
    // 等待一下，避免操作太快
    await sleep(1000);
    // 第三步：填写到达城市
    await page.waitForSelector('.pi-input.J_ArrCity.ks-autocomplete-input', {visible: true});
    await page.type('.pi-input.J_ArrCity.ks-autocomplete-input', to);
    //await page.keyboard.press('Enter');
    //console.log('已完成第三步：填写到达城市');
    // 等待一下
    await sleep(1000);
    // 第四步：填写出发日期
    await page.waitForSelector('.pi-input.J_DepDate.trigger-node-602', {visible: true});
    await page.evaluate(() => {
        const depDateInput = document.querySelector('.pi-input.J_DepDate.trigger-node-602');
        if (depDateInput) {
            depDateInput.value = ''; // 清空原有值
        }
    });
    await page.type('.pi-input.J_DepDate.trigger-node-602', departureDate);
    //await page.keyboard.press('Enter');
    //console.log('已完成第四步：填写出发日期');
    // 等待一下
    await sleep(1000);
    // 第五步：填写返回日期
    // await page.waitForSelector('.pi-input.J_EndDate.trigger-node-602', {visible: true});
    // await page.evaluate(() => {
    //     const endDateInput = document.querySelector('.pi-input.J_EndDate.trigger-node-602');
    //     if (endDateInput) {
    //         endDateInput.value = ''; // 清空原有值
    //     }
    // });
    // await page.type('.pi-input.J_EndDate.trigger-node-602', returnDate);
    //await page.keyboard.press('Enter');
    //console.log('已完成第五步：填写返回日期');
    // 等待一下
    await sleep(1000);

    const noAirportDivs = await page.$$('.ks-ac-message.J_AcMessage');
    for (const element of noAirportDivs) {
        const display = await element.evaluate(el => el.style.display);
        if(display === ''){
            noAirport = true
        }
    }
    if(noAirport){
        return 'nextloop'
    }

    // 第六步：点击搜索按钮
    await page.waitForSelector('.pi-btn.pi-btn-primary', {visible: true});
    await page.click('.pi-btn.pi-btn-primary');
    //console.log('已完成第六步：点击搜索按钮');
    // 第七步：等待特定元素出现 - 修改为等待id=J_listBox的元素
    //console.log('开始等待排序控件(J_listBox)出现...');
    // await page.waitForSelector('#J_FlightListBox', {
    //     visible: true,
    //     timeout: 30000
    // });
    //console.log('已完成第七步：排序控件已加载');
    // 额外等待1秒确保内容完全渲染
    await sleep(10000);
    // 第九步：提取第一个航班项目数据
    //console.log('开始提取第一个航班数据...');
    // 等待航班列表加载完成
    // await Promise.race([
    //     page.waitForSelector('.flight-list-item.clearfix.J_FlightItem', { 
    //         visible: true, 
    //         timeout: 30000 
    //     }),
    //     page.waitForSelector('.list-information', { 
    //         visible: true, 
    //         timeout: 30000 
    //     })
    // ]);
    const iframeElement = await page.$('#baxia-dialog-content');
    if(iframeElement){
        const iframe = await iframeElement.contentFrame();
        //await iframe.waitForSelector('.nc_iconfont', { visible: true, timeout: 5000 })
        const firstElement = await Promise.race([
            iframe.waitForSelector('.nc_iconfont', { visible: true, timeout: 5000 }),
            iframe.waitForSelector('.captcha-tips', { visible: true, timeout: 5000 })
        ]);

        const className = await firstElement.evaluate(el => el.className);
        if(className === 'captcha-tips'){
            console.log('出现滑块验证码，以后处理...')
            let result = 'sameCity'
            return result
        }
        console.log('开始滑块验证')
        // 获取滑块和轨道
        const sliderHandle = await iframe.$('.nc_iconfont');
        const sliderTrack = await iframe.$('.nc_scale');
        // 获取滑块位置和大小
        const handle = await sliderHandle.boundingBox();
        const track = await sliderTrack.boundingBox();
        
        // 计算需要拖动的距离
        const dragDistance = track.width - handle.width + 100;
        
        // 模拟人类拖动行为
        await sliderHandle.hover();
        await page.mouse.down();
        
        // 分步拖动
        for (let i = 0; i <= dragDistance; i += 5) {
            await page.mouse.move(handle.x + i, handle.y);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        await page.mouse.up();
        console.log('滑块验证已完成');
        
        // 等待验证完成
        await iframe.waitForSelector('.nc_iconfont', { hidden: true, timeout: 3000 });
    }

    const flightSorter = await page.$('#J_FlightSorter');
    const sortByPrice = await flightSorter.$('#J_SortByPrice');
    const span = await sortByPrice.$('span');
    const className = await span.evaluate(el => el.className);
    const title = await span.evaluate(el => el.title);
    if(className !== 'J_Tip current' || title !== '点击按票价从高到低'){
        await page.click('#J_SortByPrice');
        await sleep(1000)
    }

    const noneInfo = await page.$('.list-information')
    if(noneInfo){
        console.log(`从【${from}】到【${to}】无航班！`);
        const noneflights = await page.$eval('.list-information', (flightItem) => {
            const durating = flightItem.querySelector('.tips-in')?.textContent?.trim();
            return {
                durating,
            };
        });
        console.log(noneflights)
        await page.close()
		page = null
        return 'sameCity'
    } else {
        // 获取第一个航班项目
        const firstFlight = await page.$eval('.flight-list-item.clearfix.J_FlightItem', (flightItem) => {
            // 1. 获取航班时间信息
            const timeCell = flightItem.querySelector('.flight-time');
            const departTime = timeCell?.querySelector('.flight-time-deptime')?.textContent?.trim();
            const arriveTime = timeCell?.querySelector('span:nth-child(1)')?.textContent?.trim();
            // 2. 获取价格信息
            const price = flightItem.querySelector('.J_FlightListPrice')?.textContent?.trim();
            // 3. 获取飞行时长
            const durating = flightItem.querySelector('.flight-total-time')?.textContent?.trim();
            return {
                durating,
                price,
                departTime,
                arriveTime,
            };
        });
        console.log(`【${from}】到【${to}】最便宜的航班数据:`, {
            '价格': firstFlight.price || '未获取到',
            '飞行时长': firstFlight.durating || '未获取到',
            '出发时间': firstFlight.departTime || '未获取到',
            '到达时间': firstFlight.arriveTime || '未获取到',
        });
        await page.close()
		page = null
        return firstFlight
    }
}

async function excel(data){
    const workbook = new xls.Workbook()
    try{
        await workbook.xlsx.readFile(path.join(__dirname, `../results/ticketInfo.xlsx`))
        const sheet = workbook.getWorksheet('机票信息')
        sheet.columns = [
            {header: '城市', key: 'city', width: 15},
            {header: '总价', key: 'totalPrice', width: 15},
            {header: '出发日期', key: 'departureDate', width: 15},
            {header: '返回日期', key: 'returnDate', width: 15},
            {header: '去程出发时间', key: 'goDepartTime', width: 15},
            {header: '去程到达时间', key: 'goArriveTime', width: 15},
            {header: '去程价格', key: 'goPrice', width: 15},
            {header: '去程耗时', key: 'goDurating', width: 15},
            {header: '回程出发时间', key: 'returnDepartTime', width: 15},
            {header: '回程到达时间', key: 'returnArriveTime', width: 15},
            {header: '回程价格', key: 'returnPrice', width: 15},
            {header: '回程耗时', key: 'returnDurating', width: 15},
        ]
        sheet.addRow(data)
        await workbook.xlsx.writeFile(path.join(__dirname, `../results/ticketInfo.xlsx`))
        console.log(`已将【${from}】到【${data.city}】的往返机票信息写入Excel文件`)
    }catch(err){
        let sheet = workbook.addWorksheet('机票信息')
        sheet.columns = [
            {header: '城市', key: 'city', width: 15},
            {header: '总价', key: 'totalPrice', width: 15},
            {header: '出发日期', key: 'departureDate', width: 15},
            {header: '返回日期', key: 'returnDate', width: 15},
            {header: '去程出发时间', key: 'goDepartTime', width: 15},
            {header: '去程到达时间', key: 'goArriveTime', width: 15},
            {header: '去程价格', key: 'goPrice', width: 15},
            {header: '去程耗时', key: 'goDurating', width: 15},
            {header: '回程出发时间', key: 'returnDepartTime', width: 15},
            {header: '回程到达时间', key: 'returnArriveTime', width: 15},
            {header: '回程价格', key: 'returnPrice', width: 15},
            {header: '回程耗时', key: 'returnDurating', width: 15},
        ]
        sheet.addRow(data)
        await workbook.xlsx.writeFile(path.join(__dirname, `../results/ticketInfo.xlsx`))
        console.log(`已将【${from}】到【${data.city}】的往返机票信息写入Excel文件`)
    }
}