//多进程并发版本
const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const xls = require("exceljs")
const {
    sleep,
    spliceArray,
    testURL,
    trainFilter,
    Excel,
    formatTimeDiff,
	filterByProvinceAndCity,
	sleepWithHeartbeat1
} = require('../app/config')

let from = 'shenyang'
let to = '吉林省'
const fileUrl = path.join(__dirname, '../results/finalStationInfo.txt');
const data = fs.readFileSync(fileUrl)
console.log('读车站信息文件成功！')
let stationsArray = JSON.parse(data.toString('utf-8'))
//let testData = stationsArray.splice(0, 100)
let dataForSpider = filterByProvinceAndCity(stationsArray, to)
let step = 5
const timestamp1 = Date.now()
let queue = []
let pause = false
let sleepTimes = 0

startMission(stationsArray)
	
async function startMission(array){
	let cache = []
	cache = array.splice(0, step)
	await cluster(cache)
	if(pause){
		await sleep(1000 * 60 * 10)
		//await sleepWithHeartbeat1(1000 * 60 * 10, 1000 * 60 * 1, heartbeat, page1)
		sleepTimes++
		await startMission([...cache, ...array])
	} else {
		await write2CSV()
		if(array.length === 0){
			console.log(`爬虫结束，总用时${formatTimeDiff(Date.now() - timestamp1)}，休眠${sleepTimes}次`)
			return
		}else {
			console.log(`还剩${array.length}个车站，已经用时${formatTimeDiff(Date.now() - timestamp1)}`)
			await startMission(array)
		}
	}
}

async function cluster(dataArray){ 
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: dataArray.length,
		puppeteerOptions: {
            //headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
		closeOnComplete: false
    })

    await cluster.task(async ({ page, data }) => {
        try {
			pause = false
            await crawler (page, data.url, data.item, from)
        } catch (error) {
			pause = true
			queue = []
			if(page.url() === "https://www.12306.cn/mormhweb/logFiles/error.html"){
				console.log(`爬${data.item.stationsName}站出错，错误信息：${error.message}！本次并发中断，爬虫被BAN！系统准备休眠10mins！=====`)
			} else {
				console.log(`爬${data.item.stationsName}站出错，本次并发中断，错误信息：${error.message}！系统准备休眠10mins！=====`)
			}
			//await cluster.close()
			//throw new Error(`爬取失败: ${data.item.stationsName}`)
        }finally {
			// 任务完成后关闭页面，确保资源被回收
			await page.close()  // 关闭页面
		}
    })

	// cluster.on('taskerror', async (err, data) => {
	// 	console.error(`任务失败: ${JSON.stringify(data)}: ${err.message},暂停集群`)
	// 	pause = true;
	// 	await cluster.close()
	// 	//console.log(data)
	// })

    for (let i = 0; i < dataArray.length; i++) {
        cluster.queue({ url: testURL, item: dataArray[i]});
    }

    await cluster.idle()
    await cluster.close()
	if(!pause){
		console.log('=====本次并发结束=====')
	}
}

async function write2CSV(){
	if(queue.length === 0){
		return 
	}
	let data = queue.splice(0, queue.length)
	await toCSV(data)
}

async function toCSV(array, index=0){
	await Excel(array[index], to)
	index++
	if(index === array.length){
		console.log('本次并发数据已写入====================')
	} else {
		await toCSV(array, index)
	}
}

async function crawler (page, url, item, from){
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
		if(resultInfo){
			queue.push(resultInfo)
		}
	}
	console.log(`${item.stationsName}站已经爬完`)
}

const heartbeat = async (page) => {
	try {
	  await page.evaluate(() => {
		console.log('Heartbeat: Keeping the page active');
	  })
	} catch (err) {
	  console.error('Error during heartbeat:', err.message);
	}
}