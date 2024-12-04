const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const {
    sleep,
    spliceArray,
    testURL,
    trainFilter,
    Excel,
} = require('../app/config');

(async () => {
    let from = 'shenyang'
    const fileUrl = path.join(__dirname, '../results/finalStationInfo.txt');
    const data = fs.readFileSync(fileUrl)
    console.log('读车站信息文件成功！')
    let stationsArray = JSON.parse(data.toString('utf-8'))
    let testData = stationsArray.splice(0, 100)
    let testArray = spliceArray(testData, 50)
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: testArray.length,
		puppeteerOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
		closeOnComplete: false
    })

    await cluster.task(async ({ page, data }) => {
        try {
            await crawler (cluster.browser, page, data.url, data.array, from, data.array.length)
        } catch (error) {
            console.log(error)
        }
    })

    for (let i = 0; i < testArray.length; i++) {
        cluster.queue({ url: testURL, array: testArray[i]});
    }

    await cluster.idle();
    await cluster.close();
})()

async function crawler (browser, page, url, array, from, flag, index = 0){
    let arrFrom = [...from]
    let item = array[index]
    let arrTo = [...item.stationsNameCHN]
	console.log(`开始爬${item.stationsName}站：`)
    try {
        await page.goto(url, { waitUntil: 'networkidle0' })
		if(page.url() === "https://www.12306.cn/mormhweb/logFiles/error.html"){
			console.log('爬虫被BAN！系统准备休眠10mins！')
			await sleep(1000 * 60 * 10)
			console.log(`再次爬取${array[index].stationsName}站：`)
			await crawler(array, from, flag, index)
		}
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
				console.log('Ajax请求完成！')
                break;
            } else {
                console.log('等待Ajax请求加载完成！')
                await sleep(2000)
            }
        }
        
		const result = await page.evaluate( () => {
				var result = []
				var arr = document.querySelectorAll('.ticket-info')
				if(arr && arr.length > 0){
					for (let i = 0; i < arr.length; i++){
						let No = arr[i].querySelector('.train > div > a').innerText
						let depart = arr[i].querySelector('.cds>.start-t ').innerText
						let arrive = arr[i].querySelector('.cds>.color999').innerText
						let duration = arr[i].querySelector('.ls>strong').innerText
						result.push({No, depart, arrive, duration})
					}
				}
				return result
			}
		)
        console.log(`${from}-->${item.stationsName}共${result.length}个车次`)
		if(result.length > 0){
			let resultInfo = trainFilter(item.stationsName, result, item.inWhichCity, item.inWhichProvince)
			if(resultInfo){
				await Excel(resultInfo, from)
			}
		}
		console.log(`${item.stationsName}站已经爬完！${index + 1}/${flag}`)
        console.log('=================================')
		index++
		if(index === flag){
			console.log('爬虫结束！')

		} else{
			await sleep(2000)
			await crawler(browser, page, url, array, from, flag, index)
		}
	} catch (error) {
		console.log(`爬虫出错，10min后重新爬${item.stationsName}站！`)
        console.log(error)
		//await page.screenshot({ path: 'example.png' });
		await sleep(1000 * 60 * 10)
		await crawler(browser, page, url, array, from, flag, index)
	}
}