const puppeteer = require('puppeteer')
const { 
	Excel,
	sleep,
	trainFilter,
    testURL
} = require('../config');

//获取命令行参数
let arr = process.argv.splice(2)

;(async() => {
	let arrFrom = [...arr[0]]
  	let item = JSON.parse(arr[1])
	//let arrTo = [...arr[1]]
	console.log(`开始爬${item.stationsName}站：`)
    let arrTo = [...item.stationsNameCHN]
	const browser = await puppeteer.launch({
		args: ['--no-sandbox'],
		dumpio: false
	})

	const page = await browser.newPage()
	await page.goto(testURL, {waitUntil: 'networkidle2'})

	if(page.url() === "https://www.12306.cn/mormhweb/logFiles/error.html"){
			console.log('爬虫被BAN！系统准备休眠10mins！')
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

    if(result.length > 0){
		let resultInfo = trainFilter(item.stationsName, result)
		if(resultInfo){
			//Info.push(resultInfo)
			//写入文件
			await Excel(resultInfo, arr[0])
		}
	}
	browser.close()
    console.log(`${item.stationsName}站已经爬完！`)
	//process.send("done")
	//console.log(JSON.stringify("done"))
	process.exit(0)
})()