const puppeteer = require('puppeteer')
const xls = require("exceljs")
const path = require('path')
const {
    sleep,
    formatTimeDiff
} = require('../app/config')

const timestamp1 = Date.now()
let sleepTimes = 0

let from = '沈阳'
let citie = ['阿尔山']

let departureDate = '2025-04-19'
let returnDate = '2025-04-25'

let browser = null
let page = null

crawler(departureDate, returnDate, citie.length)

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
        if(!page){
            page = await browser.newPage();
            // 导航到目标网站
            await page.goto('https://sjipiao.fliggy.com/flight_search_result.htm', {
                waitUntil: 'networkidle2', // 等待网络空闲
                timeout: 60000 // 超时时间60秒
            });
        }
        console.log(`开始爬取【${citie[index]}】的机票信息...`);
        // 第一步：点击搜索类型的第二个子元素
        await page.waitForSelector('.search-type.J_Radio', {visible: true});
        await page.evaluate(() => {
            const searchType = document.querySelector('.search-type.J_Radio');
            if (searchType && searchType.children.length >= 2) {
                searchType.children[1].click(); // 点击第二个子元素
            }
        });
        //console.log('已完成第一步：选择搜索类型');
        // 第二步：填写出发城市
        await page.waitForSelector('.pi-input.J_DepCity.ks-autocomplete-input', {visible: true});
        await page.type('.pi-input.J_DepCity.ks-autocomplete-input', from);
        //await page.keyboard.press('Enter');
        //console.log('已完成第二步：填写出发城市');
        // 等待一下，避免操作太快
        await sleep(1000);
        // 第三步：填写到达城市
        await page.waitForSelector('.pi-input.J_ArrCity.ks-autocomplete-input', {visible: true});
        await page.type('.pi-input.J_ArrCity.ks-autocomplete-input', citie[index]);
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
        await page.waitForSelector('.pi-input.J_EndDate.trigger-node-602', {visible: true});
        await page.evaluate(() => {
            const endDateInput = document.querySelector('.pi-input.J_EndDate.trigger-node-602');
            if (endDateInput) {
                endDateInput.value = ''; // 清空原有值
            }
        });
        await page.type('.pi-input.J_EndDate.trigger-node-602', returnDate);
        //await page.keyboard.press('Enter');
        //console.log('已完成第五步：填写返回日期');
        // 等待一下
        await sleep(1000);
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
        // await page.waitForSelector('.flight-list-item.clearfix.J_FlightItem', { 
        //     visible: true, 
        //     timeout: 30000 
        // });
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
        console.log(`【${from}】到【${citie[index]}】最便宜的航班数据:`, {
            '价格': firstFlight.price || '未获取到',
            '飞行时长': firstFlight.durating || '未获取到',
            '出发时间': firstFlight.departTime || '未获取到',
            '到达时间': firstFlight.arriveTime || '未获取到',
        });
        let toCSVData = {...firstFlight, city: citie[index], departureDate, returnDate}
        await excel(toCSVData)
        await page.close()
		page = null
        console.log(`爬取【${citie[index]}】的机票信息已完成！${index + 1}/${flag}，已经用时${formatTimeDiff(Date.now() - timestamp1)}，物理内存占用：${(process.memoryUsage().rss/1024/1024).toFixed(1)}MB；JS堆内存已分配：${(process.memoryUsage().heapTotal/1024/1024).toFixed(1)}MB，已使用：${(process.memoryUsage().heapUsed/1024/1024).toFixed(1)}MB；`)
        index++
        if(index === flag){
            console.log(`爬虫结束！总用时${formatTimeDiff(Date.now() - timestamp1)}，休眠${sleepTimes}次！`)
            await browser.close()
            browser = null
            return
        } else{
            await sleep(Math.random() * 2000 + 1000)
            await crawler(departureDate, returnDate, flag, index)
        }
    } catch (error) {
        console.error(`爬虫出错，错误信息：${error.message}。2min后重新爬【${citie[index]}】！`);
        await sleep(browser, 1000 * 60 * 2)
        if(page){
			await page.close()
			page = null
		}
		if(browser){
			await browser.close()
			browser = null
		}
		sleepTimes++
        await crawler(departureDate, returnDate, flag, index)
    }
}

async function excel(data){
    const workbook = new xls.Workbook()
    try{
        await workbook.xlsx.readFile(path.join(__dirname, `../results/ticketInfo.xlsx`))
        const sheet = workbook.getWorksheet('廉价机票信息')
        sheet.columns = [
            {header: '城市', key: 'city', width: 15},
            {header: '价格', key: 'price', width: 15},
            {header: '飞行时长', key: 'durating', width: 15},
            {header: '出发时间', key: 'departTime', width: 20},
            {header: '到达时间', key: 'arriveTime', width: 20},
            {header: '出发日期', key: 'departureDate', width: 20},
            {header: '返回日期', key: 'returnDate', width: 20}
        ]
        sheet.addRow(data)
        await workbook.xlsx.writeFile(path.join(__dirname, `../results/ticketInfo.xlsx`))
        console.log(`已将${data.city}的机票信息写入Excel文件`)
    }catch(err){
        let sheet = workbook.addWorksheet('廉价机票信息')
        sheet.columns = [
            {header: '城市', key: 'city', width: 15},
            {header: '价格', key: 'price', width: 15},
            {header: '飞行时长', key: 'durating', width: 15},
            {header: '出发时间', key: 'departTime', width: 20},
            {header: '到达时间', key: 'arriveTime', width: 20},
            {header: '出发日期', key: 'departureDate', width: 20},
            {header: '返回日期', key: 'returnDate', width: 20}
        ]
        sheet.addRow(data)
        await workbook.xlsx.writeFile(path.join(__dirname, `../results/ticketInfo.xlsx`))
        console.log(`已将【${data.city}】的机票信息写入Excel文件`)
    }
}