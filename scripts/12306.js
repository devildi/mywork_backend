//单进程版本
//const puppeteer = require('puppeteer')
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const AnonymizeUA = require('puppeteer-extra-plugin-anonymize-ua')
const fs = require('fs')
const path = require('path')
const {
    sleep,
    testURL,
    Excel,
    mockData,
    trainFilter,
	formatTimeDiff,
	filterByProvinceAndCity,
	sleepWithHeartbeat
} = require('../app/config')
const fileUrl = path.join(__dirname, '../results/finalStationInfo.txt')

const timestamp1 = Date.now()
let browser = null
let page = null
let sleepTimes = 0
let from = 'shenyang'
let to = '吉林省'
const data = fs.readFileSync(fileUrl)
console.log('读车站信息文件成功！')
let stationsArray = JSON.parse(data.toString('utf-8'))
let dataForSpider = filterByProvinceAndCity(stationsArray, to)
puppeteer.use(StealthPlugin())
puppeteer.use(AnonymizeUA({
	makeWindows: true
}))
crawler(dataForSpider, from, dataForSpider.length)

async function crawler (array, from, flag, index = 0){
    let arrFrom = [...from]
	let item = array[index]
	if(!browser){
		browser = await puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
			dumpio: false,
		})
	}

	if(!page){
		page = await browser.newPage()
		await page.goto(testURL, { waitUntil: 'networkidle2' })
	}

	let arrTo = [...item.stationsNameCHN]
	console.log(`开始爬${item.stationsName}站：`)

    try {
		if(page.url() === "https://www.12306.cn/mormhweb/logFiles/error.html"){
			console.log('爬虫被BAN！系统准备休眠10mins！')
			await page.close()
			page = null
			sleepTimes++
			//await sleep(1000 * 60 * 10)
			await sleepWithHeartbeat(browser, 1000 * 60 * 10)
			console.log(`再次爬取${array[index].stationsName}站：`)
			await crawler(array, from, flag, index)
		} else{
			const warningBtn = await page.$('#qd_closeDefaultWarningWindowDialog_id')
			if(warningBtn){
				await page.tap('#qd_closeDefaultWarningWindowDialog_id')
			}

			await page.tap('#fromStationText')
			for (let i = 0; i < arrFrom.length; i++){
				await page.keyboard.press(arrFrom[i]);
			}
			await page.keyboard.press('Enter')

			await page.tap('#toStationText')
			for (let i = 0; i < arrTo.length; i++){
				await page.keyboard.press(arrTo[i]);
			}
			await page.keyboard.press('Enter')

			await page.click('#date_range>ul>li:nth-child(2)')

			await sleep(2000)
			while(true){
				const className = await page.$eval('#query_ticket', element => element.className)
				if(className === 'btn92s'){
					console.log(`爬${item.stationsName}站的Ajax请求完成！`)
					break;
				} else {
					console.log(`等待爬${item.stationsName}站的Ajax请求加载完成！`)
					await sleep(2000)
				}
			}
			
			const result = await page.evaluate( () => {
					var result = []
					var arr = document.querySelectorAll('.ticket-info')
					if(arr && arr.length > 0){
						for (let i = 0; i < arr.length; i++){
							if(arr[i].querySelector('.ls>strong')){
								let No = arr[i].querySelector('.train > div > a').innerText
								let depart = arr[i].querySelector('.cds>.start-t ').innerText
								let arrive = arr[i].querySelector('.cds>.color999').innerText
								let duration = arr[i].querySelector('.ls>strong').innerText
								result.push({No, depart, arrive, duration})
							}
						}
					}
					return result
				}
			)
			console.log(`${from}-->${item.stationsName}共${result.length}个车次`)
			if(result.length > 0){
				let resultInfo = trainFilter(item.stationsName, result, item.inWhichCity, item.inWhichProvince)
				if(resultInfo){
					await Excel(resultInfo, to)
				}
			}
			await page.close()
			page = null
			console.log(`${item.stationsName}站已经爬完！${index + 1}/${flag}，已经用时${formatTimeDiff(Date.now() - timestamp1)}，物理内存占用：${(process.memoryUsage().rss/1024/1024).toFixed(1)}MB；JS堆内存已分配：${(process.memoryUsage().heapTotal/1024/1024).toFixed(1)}MB，已使用：${(process.memoryUsage().heapUsed/1024/1024).toFixed(1)}MB；`)
			index++
			if(index === flag){
				console.log(`爬虫结束！总用时${formatTimeDiff(Date.now() - timestamp1)}，休眠${sleepTimes}次！`)
				await browser.close()
				browser = null
				return
			} else{
				await sleep(Math.random() * 2000 + 1000)
				await crawler(array, from, flag, index)
			}
		}
	} catch (error) {
		console.log(`爬虫出错，错误信息：${error.message}。10min后重新爬${item.stationsName}站！`)
		await sleepWithHeartbeat(browser, 1000 * 60 * 10)
		if(page){
			await page.close()
			page = null
		}
		if(browser){
			await browser.close()
			browser = null
		}
		sleepTimes++
		//await sleep(1000 * 60 * 10)
		await crawler(array, from, flag, index)
	}
}