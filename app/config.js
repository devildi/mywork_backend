const nodemailer = require("nodemailer")
const puppeteer = require('puppeteer')
const xls = require("exceljs")
const path = require('path')
const cp = require('child_process')
const util = require('util')
require('events').EventEmitter.defaultMaxListeners = 0

function farmet(data){
	for (let key in data){
		if (data[key] instanceof Array ){
			data[key] = data[key].length > 0 ? data[key].join('  ') : ''
		}
	}
	return data
}

async function Excel(data, from){
	farmet(data)
	const workbook = new xls.Workbook()

	try{
		await workbook.xlsx.readFile(path.join(__dirname, `./${from}.xlsx`))
		const sheet = workbook.getWorksheet('测试报表')
		sheet.columns = [
			{header: '城市', key: 'destination', width: 15},
			{header: '动车高铁', key: 'hasGOrD', width: 100},
			{header: '夕发朝至', key: 'overNight', width: 100}
		]
		sheet.addRow(data)
		await workbook.xlsx.writeFile(path.join(__dirname, `./${from}.xlsx`))
		console.log(`将${data.destination}站的信息写入Excel文件`)
	}catch(err){
		let sheet = workbook.addWorksheet('测试报表')
		sheet.columns = [
			{header: '城市', key: 'destination', width: 15},
			{header: '动车高铁', key: 'hasGOrD', width: 100},
			{header: '夕发朝至', key: 'overNight', width: 100}
		]
		sheet.addRow(data)
		await workbook.xlsx.writeFile(path.join(__dirname, `./${from}.xlsx`))
		console.log(`将${data.destination}站的信息写入Excel文件`)
	}

}

function timeDefine(str){
	let list = str.split(':')
	let hour = parseInt(list[0])
	let min = parseInt(list[1])
	let total = hour * 60 + min
	return total
}

function trainFilter(destination, array){
	let hasGOrD = []
	let overNight = []
	array.map(function(obj){
		if(obj.No.startsWith('G') || obj.No.startsWith('D')){
			hasGOrD.push(obj.No)
		} else {
			if(timeDefine(obj.depart) > 17 * 60 && timeDefine(obj.arrive) < 12 * 60 && timeDefine(obj.arrive) > 4 * 60 && timeDefine(obj.duration)< 13 * 60){
				overNight.push(obj.No)
			}
		}
	})
	if(hasGOrD.length === 0 && overNight.length === 0){
		return false
	}else {
		return {
			destination,
			hasGOrD,
			overNight
		}
	}
}

function sleep(time){
	return new Promise(function(resolve){
		setTimeout(resolve, time)
	})
}
const testURL = 'https://kyfw.12306.cn/otn/leftTicket/init'
const scriptPath = './script/12306'

async function crawler_child_process (array, Info, from, flag, index = 0){
	let script = path.resolve(__dirname, scriptPath)
	let item = array[index]
	const execFile = util.promisify(cp.execFile)
	let result = await execFile('node', [script, from, JSON.stringify(item)])
	console.log(result)
	
	index++
	if(index === flag){
		console.log('爬虫结束！')
		return Info
	} else{
		await crawler_child_process(array, Info, from, flag, index)
	}
}

async function crawler (array, Info, from, flag, index = 0){
	let arrFrom = [...from]
	let item = array[index]
	const browser = await puppeteer.launch({
		args: ['--no-sandbox'],
		dumpio: false
	})
	let arrTo = [...item.stationsNameCHN]
	console.log(`开始爬${item.stationsName}站：`)
	const page = await browser.newPage()
	await page.goto(testURL, { waitUntil: 'networkidle2' })

	if(page.url() === "https://www.12306.cn/mormhweb/logFiles/error.html"){
		console.log('爬虫被BAN！系统准备休眠10mins！')
		await sleep(1000 * 60 * 10)
		console.log(`再次爬取${array[index].stationsName}站：`)
		await crawler(array, Info, from, flag, index)
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
			Info.push(resultInfo)
			//写入文件
			await Excel(resultInfo, from)
		}
	}
	await page.close()
	await sleep(2000)
	console.log(`${item.stationsName}站已经爬完！${index + 1}/${flag}`)
	index++
	if(index === flag){
		console.log('爬虫结束！')
		await browser.close();
		console.log('爬虫结果：',Info)
		return Info
	} else{
		await crawler(array, Info, from, flag, index)
	}
}
module.exports = {
	appid: 'wx9dd29c9565a24027',
	wesecret: 'd8431676186d8248c2a7e01d32d31c25',
	port: 4000,
	secret: 'DavinciUser',
	authority: 'wudi41538bc6dd',
	f1: function(str1, str2){
		let index = str1.split('|').indexOf(str2)
		if(index > -1){
			return true
		} else {
			return false
		}
	},
	h0: function(timestamp = Date.now()){
		const target = new Date(timestamp);
		target.setHours(0);
		target.setMinutes(0);
		target.setSeconds(0);
		target.setMilliseconds(0);
		return target.getTime();
	},
	d0: function(gap, timestamp = Date.now()){
		const target = new Date(timestamp);
		return target.setDate(target.getDate() - gap);
	},
	sendMail: async function(wechat, destination){
		//let testAccount = await nodemailer.createTestAccount();
		let transporter = nodemailer.createTransport({
			// host: "smtp.gmail.com",
			// port: 465,
			// service: 'gmail',
			// secure: true, // true for 465, false for other ports
			// auth: {
			// 	user: 'devildi1987@gmail.com', // generated ethereal user
			// 	pass: '41538bc6dd', // generated ethereal password
			// },
			host: "smtp.163.com",
			port: 587,
			service: '163',
			secure: false, // true for 465, false for other ports
			auth: {
				user: 'aabbcc9250@163.com', // generated ethereal user
				pass: 'CXWBXFZKTYEYRYLI', // generated ethereal password
			},
		});
		let info = await transporter.sendMail({
			//from: '吴迪<devildi1987@gmail.com>', // sender address
			from: '吴迪<aabbcc9250@163.com>', // sender address
			to: "387694318@qq.com", // list of receivers
			subject: "NextSticker有新增用户", // Subject line
			text: `NextSticker有新增用户:${wechat}`, // plain text body
			html: `<b>微信号：${wechat}</b><br /><b>目的地：${destination}</b>`, // html body
		});
    	//console.log("Message sent: %s", info.messageId);
    	//console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
	},
	getWidthAndHeight: async function(picURL){
		const browser = await puppeteer.launch();
		const page = await browser.newPage();
		await page.goto(picURL);
		let result = await page.title();
		//console.log(result)
		await browser.close();
		return result;
	},
	stationsURL: 'https://kyfw.12306.cn/otn/resources/js/framework/station_name.js',
	mockData: [
		{"stationsName":"北京北","stationsNameCHN":"beijingbei"},
		{"stationsName":"上海","stationsNameCHN":"shanghai"}
	],
	crawler,
	crawler_child_process,
	Excel,
	sleep,
	trainFilter,
	testURL
};