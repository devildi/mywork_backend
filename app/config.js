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

async function Excel(data, to = '全国'){
	let farmetData = farmet(data)
	const workbook = new xls.Workbook()
	//console.log(farmetData)
	try{
		await workbook.xlsx.readFile(path.join(__dirname, `../results/${to}.xlsx`))
		const sheet = workbook.getWorksheet('测试报表')
		sheet.columns = [
			{header: '车站', key: 'destination', width: 15},
			{header: '城市', key: 'city', width: 15},
			{header: '省', key: 'province', width: 15},
			{header: '动车高铁', key: 'hasGOrD', width: 50},
			{header: '夕发朝至', key: 'overNight', width: 50},
			{header: '一日游', key: 'daytrip', width: 50}
		]
		sheet.addRow(farmetData)
		await workbook.xlsx.writeFile(path.join(__dirname, `../results/${to}.xlsx`))
		console.log(`将${farmetData.destination}站的信息写入Excel文件`)
	}catch(err){
		let sheet = workbook.addWorksheet('测试报表')
		sheet.columns = [
			{header: '车站', key: 'destination', width: 15},
			{header: '城市', key: 'city', width: 15},
			{header: '省', key: 'province', width: 15},
			{header: '动车高铁', key: 'hasGOrD', width: 50},
			{header: '夕发朝至', key: 'overNight', width: 50},
			{header: '一日游', key: 'daytrip', width: 50}
		]
		sheet.addRow(farmetData)
		await workbook.xlsx.writeFile(path.join(__dirname, `../results/${to}.xlsx`))
		console.log(`将${farmetData.destination}站的信息写入Excel文件`)
	}
}

function timeDefine(str){
	let list = str.split(':')
	let hour = parseInt(list[0])
	let min = parseInt(list[1])
	let total = hour * 60 + min
	return total
}

function trainFilter(destination, array, city, province){
	//console.log(array)
	let hasGOrD = []
	let overNight = []
	let daytrip = []
	array.map(function(obj){
		if(obj.No.startsWith('G') || obj.No.startsWith('D')){
			hasGOrD.push(obj.No)
		}
		if(timeDefine(obj.depart) < 1 * 60 || timeDefine(obj.depart) > 17 * 60 && timeDefine(obj.arrive) < 12 * 60 && timeDefine(obj.arrive) > 4 * 60 && timeDefine(obj.duration)< 13 * 60){
			overNight.push(obj.No)	
		}
		if(timeDefine(obj.arrive) < 12 * 60 && timeDefine(obj.depart) > 7 * 60 && timeDefine(obj.duration)<= 2 * 60){
			daytrip.push(obj.No)
		}
	})
	if(hasGOrD.length === 0 && overNight.length === 0 && daytrip.length === 0){
		return false
	}else {
		return {
			destination,
			hasGOrD,
			overNight,
			city,
			province,
			daytrip
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
	
	try {
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
			await browser.close();
			await crawler(array, Info, from, flag, index)
		}
	} catch (error) {
		console.log(`爬虫出错，10min后重新爬${item.stationsName}站！`)
		if(page){
			await page.close()
		}
		if(browser){
			await browser.close()
		}
		await sleep(1000 * 60 * 10)
		await crawler(array, Info, from, flag, index)
	}

}

function promise1(client, url){
	return new Promise((resolve, reject) => {
		client.sayHello({name: url}, (err, response) => {
			if(err){
				reject()
			}
			console.log('从GRPC回传的信息：',response.message);
			resolve(response.message)
		});
	})
}

const googleTravelURL = 'https://www.google.com/travel/things-to-do'
const baiduBaike = 'https://baike.baidu.com/'
const pageMock = 'https://mp.weixin.qq.com/s?__biz=MzIyMTM3MzE1MA==&mid=2247484651&idx=1&sn=2cbf9de89735555acbd30f456ec68b90&chksm=e83cf35adf4b7a4c25c72bdffc6b4c6bfa751d74a47a51b541b70f67bdc0ca020663fef050c2&token=1642341609&lang=zh_CN#rd'

async function getInfoFromGoogleTravel(des){
	const browser = await puppeteer.launch({
		args: ['--no-sandbox'],
		dumpio: false
	})
	const page = await browser.newPage()
	await page.goto(baiduBaike, { waitUntil: 'networkidle2' })
	const input = await page.$('input[type=text]')
	await input.type(des)
	await page.keyboard.press('Enter')
	await sleep(5000)
	const elementHandle = await page.$('.lemma-summary.J-summary')
	const elementContent = await elementHandle.evaluate(element => element.textContent)
	return elementContent
}

async function getPicsFromGoogleTravel(des){
	console.log(des)
	const browser = await puppeteer.launch({
		args: ['--no-sandbox'],
		dumpio: false
	})
	const page = await browser.newPage()
	await page.goto(googleTravelURL, { waitUntil: 'networkidle2' })
	const input = await page.$('input[type=text]')
	await input.type(des || '棋盘山')
	await page.keyboard.press('Enter')
	await sleep(5000)
	
	const ele = await page.$('.QtzoWd')
	const box = await ele.boundingBox()
	const x = box.x + box.width / 2
	const y = box.y + box.height / 2
	await page.mouse.move(x, y)
	
	const elementCount = await page.$$eval('.QtzoWd', elements => elements.length)
	let loopTimes = (elementCount - 1) / 2
	console.log(loopTimes)
	//await page.screenshot({ path: 'shotPath.png' })
	//await page.waitForSelector('.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-MV7yeb.VfPpkd-LgbsSe-OWXEXe-Bz112c-M1Soyc.VfPpkd-LgbsSe-OWXEXe-dgl2Hf.b9hyVd.MQas1c.LQeN7.qhgRYc.CoZ57.V0XOz.a2rVxf.VfPpkd-ksKsZd-mWPk3d');
	const buttonElements = await page.$('button.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-MV7yeb.VfPpkd-LgbsSe-OWXEXe-Bz112c-M1Soyc.VfPpkd-LgbsSe-OWXEXe-dgl2Hf.b9hyVd.MQas1c.LQeN7.qhgRYc.CoZ57.V0XOz.a2rVxf.VfPpkd-ksKsZd-mWPk3d')
	if(buttonElements){
		console.log('---')
		for (let i = 0; i < loopTimes; i++){
			await buttonElements.click()
		}
	}
	
	//await page.screenshot({ path: 'shotPath1.png' });
	const result = await page.evaluate( () => {
		var result = []
		var arr = document.querySelectorAll('.QtzoWd')
		if(arr && arr.length > 0){
			for (let i = 0; i < arr.length; i++){
				let img = arr[i].querySelector('img').src
				result.push(img)
			}
		}
		return result
		}
	)
	return result
}

function spliceArray (array, step){
	let newArray = []
	let loopTimes = Math.ceil(array.length / step)
	for(let i = 0 ; i < loopTimes ; i++){
		let cache = array.splice(0, step)
		newArray.push(cache)
	}
	return newArray
}

function formatTimeDiff(ms) {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24)); // 天数
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)); // 小时
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60)); // 分钟
    const seconds = Math.floor((ms % (1000 * 60)) / 1000); // 秒

    return `${days}天 ${hours}小时 ${minutes}分钟 ${seconds}秒`;
}

function filterByProvinceAndCity(array, string){
	let newArr = []
	newArr = array.filter(item => item.inWhichProvince === string)
	return newArr
}

async function sleepWithHeartbeat(browser, duration, interval = 1 * 60 * 1000) {
	const page = (await browser.pages())[0]; // 获取第一个页面
	const endTime = Date.now() + duration;
  
	while (Date.now() < endTime) {
	  await new Promise(resolve => setTimeout(resolve, interval)); // 等待心跳间隔
	  try {
		await page.title(); // 获取页面标题，维持活动
		console.log('Heartbeat sent to keep browser active.');
	  } catch (error) {
		console.error('Error during heartbeat:', error.message);
		throw error; // 如果心跳操作失败，抛出异常
	  }
	}
}

async function sleepWithHeartbeat1(duration, interval, heartbeat, page) {
	const steps = Math.ceil(duration / interval);
	for (let i = 0; i < steps; i++) {
	  await new Promise(resolve => setTimeout(resolve, interval))
	  console.log(`Heartbeat ${i + 1}/${steps}`);
	  if (heartbeat) {
		await heartbeat(page); // 调用心跳操作
	  }
	}
  }

module.exports = {
	tencentMapKey: 'GRCBZ-ZELKJ-H2FFV-FBSQT-OJM6T-ZSFK4',
	accessKey :'o9zaFko-BJ4y7txnOpEiFJfPTalWI2LQLS3exIr1',
	secretKey :'67dcr5piITYljpd8rkyEbDz0wugIRqOARK8Frvkk',
	bucket: 'devildi',
	outerURL: 'http://nextsticker.top/',
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
		{"stationsName":"本溪新城","stationsNameCHN":"benxixincheng","inWhichCity":"本溪","inWhichProvince":"辽宁省"},
		{"stationsName":"长春","stationsNameCHN":"changchun", "inWhichCity":"长沙","inWhichProvince":"湖南省"},
		{"stationsName":"上海","stationsNameCHN":"shanghai", "inWhichCity":"长沙","inWhichProvince":"湖南省"},
		{"stationsName":"横道河子","stationsNameCHN":"hengdaohezi","inWhichCity":"牡丹江","inWhichProvince":"黑龙江省"},
		{"stationsName":"铁岭","stationsNameCHN":"tieling","inWhichCity":"铁岭","inWhichProvince":"辽宁省"}
	],
	crawler,
	crawler_child_process,
	Excel,
	sleep,
	trainFilter,
	testURL,
	promise1,
	getInfoFromGoogleTravel,
	getPicsFromGoogleTravel,
	spliceArray,
	formatTimeDiff,
	filterByProvinceAndCity,
	sleepWithHeartbeat,
	sleepWithHeartbeat1
};