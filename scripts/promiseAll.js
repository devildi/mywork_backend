const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const AnonymizeUA = require('puppeteer-extra-plugin-anonymize-ua')
const puppeteer = require('puppeteer-extra')
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

let step = 5
let pause = false
const timestamp1 = Date.now()
let sleepTimes = 0
let from = 'shenyang'
let to = '黑龙江省'

const data = fs.readFileSync(fileUrl)
console.log('读车站信息文件成功！')
let stationsArray = JSON.parse(data.toString('utf-8'))
let dataForSpider = filterByProvinceAndCity(stationsArray, to)

startMission(dataForSpider)

async function startMission(array){
	let cache = []
	cache = array.splice(0, step)
	let results = await fetchMultiplePagesWithLimit(cache, step, from)
	if(pause){
		await sleep(1000 * 60 * 10)
		sleepTimes++
		await startMission([...cache, ...array])
	} else {
		await write2CSV(results)
		if(array.length === 0){
			console.log(`爬虫结束，总用时${formatTimeDiff(Date.now() - timestamp1)}，休眠${sleepTimes}次`)
			return
		}else {
			console.log(`还剩${array.length}个车站，已经用时${formatTimeDiff(Date.now() - timestamp1)}`)
			await startMission(array)
		}
	}
}

async function write2CSV(array, index=0){
	if(array[index]){
		await Excel(array[index], to)
	}
	index++
	if(index === array.length){
		console.log('本次并发数据已写入====================')
	} else {
		await write2CSV(array, index)
	}
}

async function fetchMultiplePagesWithLimit(array, maxConcurrency, from) {
	try{
		pause = false
		const results = await Promise.all(array.map(item => crawler(testURL, item, from)))
		return results
	}catch(err){
		console.log(`爬虫出错，错误信息：${err.message}；10min后重启爬虫！`)
		pause = true
		return null
	}
}

async function crawler (url, item, from){
	let browser = await puppeteer.launch({
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
		dumpio: false,
	})
    let page = await browser.newPage()
    let arrFrom = [...from]
    let arrTo = [...item.stationsNameCHN]
	console.log(`开始爬${item.stationsName}站：`)
	await page.goto(url, { waitUntil: 'networkidle0'})
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
		console.log(`${item.stationsName}站已经爬完`)
		if(page){
			await page.close()
			page = null
		}
		if(browser){
			await browser.close()
			browser = null
		}
		return resultInfo
	} else {
		if(page){
			await page.close()
			page = null
		}
		if(browser){
			await browser.close()
			browser = null
		}
		return false
	}
}