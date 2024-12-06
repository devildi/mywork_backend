const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const {
    sleep,
    testURL,
    Excel,
    mockData,
    trainFilter,
	formatTimeDiff
} = require('../app/config')
const fileUrl = path.join(__dirname, '../results/finalStationInfo.txt')

const timestamp1 = Date.now()
let browser = null
let from = 'shenyang'
const data = fs.readFileSync(fileUrl)
console.log('读车站信息文件成功！')
let stationsArray = JSON.parse(data.toString('utf-8'))

crawler(mockData, from, mockData.length)

async function crawler (array, from, flag, index = 0){
    let arrFrom = [...from]
	let item = array[index]
	if(!browser){
		browser = await puppeteer.launch({
			args: ['--no-sandbox'],
			dumpio: false
		})
	}

    let arrTo = [...item.stationsNameCHN]
	console.log(`开始爬${item.stationsName}站：`)

    const page = await browser.newPage()
	await page.goto(testURL, { waitUntil: 'networkidle2' })

    try {
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
				await Excel(resultInfo, from)
			}
		}
		await page.close()
		console.log(`${item.stationsName}站已经爬完！${index + 1}/${flag}，已经用时${formatTimeDiff(Date.now() - timestamp1)}`)
		index++
		if(index === flag){
			console.log('爬虫结束！')
			await browser.close();
		} else{
			await sleep(2000)
			await crawler(array, from, flag, index)
		}
	} catch (error) {
		console.log(`爬虫出错，10min后重新爬${item.stationsName}站！`)
        console.log(error)
		if(page){
			await page.close()
		}
		if(browser){
			await browser.close()
			browser = null
		}
		await sleep(1000 * 60 * 10)
		await crawler(array, from, flag, index)
	}
}