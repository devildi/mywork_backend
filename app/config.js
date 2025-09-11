const nodemailer = require("nodemailer")
const puppeteer = require('puppeteer')
const xls = require("exceljs")
const path = require('path')
const cp = require('child_process')
const util = require('util')
const os = require('os');
const qiniu = require('qiniu');
const axios = require('axios')
require('dotenv').config();
require('events').EventEmitter.defaultMaxListeners = 0

const testURL = 'https://kyfw.12306.cn/otn/leftTicket/init'
const scriptPath = './script/12306'
const googleTravelURL = 'https://www.google.com/travel/things-to-do'
const baiduBaike = 'https://baike.baidu.com/'
const pageMock = 'https://mp.weixin.qq.com/s?__biz=MzIyMTM3MzE1MA==&mid=2247484651&idx=1&sn=2cbf9de89735555acbd30f456ec68b90&chksm=e83cf35adf4b7a4c25c72bdffc6b4c6bfa751d74a47a51b541b70f67bdc0ca020663fef050c2&token=1642341609&lang=zh_CN#rd'
const airportCities = [
	// 直辖市
	"北京", "上海", "天津", "重庆",
	// 河北省
	"石家庄", "秦皇岛", "唐山", "邯郸", "张家口", "承德", "邢台",
	// 山西省
	"太原", "大同", "长治", "运城", "忻州", "临汾", "吕梁", "朔州",
	// 内蒙古自治区
	"呼和浩特", "包头", "呼伦贝尔", "赤峰", "鄂尔多斯", "乌兰浩特", "通辽", "乌海", "锡林浩特", "阿拉善左旗","巴彦淖尔", "乌兰察布",
	// 辽宁省
	"沈阳", "大连", "丹东", "锦州", "朝阳", "鞍山", "营口",
	// 吉林省
	"长春", "延吉", "白山", "通化", "白城", "吉林市", "松原",
	// 黑龙江省
	"哈尔滨", "大庆", "齐齐哈尔", "牡丹江", "佳木斯", "黑河", "漠河", "伊春", "鸡西",
	// 江苏省
	"南京", "无锡", "徐州", "常州", "南通", "连云港", "盐城", "扬州", "淮安",
	// 浙江省
	"杭州", "宁波", "温州", "舟山", "台州", "衢州", "丽水", "义乌",
	// 安徽省
	"合肥", "黄山", "阜阳", "安庆", "池州", "芜湖", "蚌埠", "亳州",
	// 福建省
	"福州", "厦门", "泉州", "武夷山", "连城", "三明",
	// 江西省
	"南昌", "赣州", "景德镇", "井冈山", "九江", "宜春", "上饶",
	// 山东省
	"济南", "青岛", "烟台", "威海", "临沂", "济宁", "日照", "潍坊", "东营", "菏泽", "枣庄",
	// 河南省
	"郑州", "洛阳", "南阳", "信阳", "安阳", "新郑", "周口", "商丘", "驻马店",
	// 湖北省
	"武汉", "宜昌", "襄阳", "恩施", "十堰", "神农架",
	// 湖南省
	"长沙", "张家界", "常德", "衡阳", "怀化", "永州", "邵阳", "岳阳",
	// 广东省
	"广州", "深圳", "珠海", "揭阳", "湛江", "梅州", "韶关", "惠州", "佛山",
	// 广西壮族自治区
	"南宁", "桂林", "北海", "柳州", "百色", "河池", "梧州", "玉林", 
	// 海南省
	"海口", "三亚", "琼海", "三沙",
	// 四川省
	"成都", "绵阳", "泸州", "宜宾", "达州", "西昌", "广元", "攀枝花", "九寨沟", "康定", "巴中",
	// 贵州省
	"贵阳", "遵义", "铜仁", "兴义", "安顺", "六盘水", "毕节",
	// 云南省
	"昆明", "丽江", "大理", "西双版纳", "保山", "临沧", "普洱", "昭通", "文山", "德宏",
	// 西藏自治区
	"拉萨", "林芝", "昌都", "日喀则", "阿里",
	// 陕西省
	"西安", "榆林", "延安", "汉中", "安康", "宝鸡",
	// 甘肃省
	"兰州", "敦煌", "嘉峪关", "庆阳", "张掖", "天水", "甘南",
	// 青海省
	"西宁", "格尔木", "玉树", "果洛",
	// 宁夏回族自治区
	"银川", "中卫", "固原",
	// 新疆维吾尔自治区
	"乌鲁木齐", "喀什", "伊宁", "阿勒泰", "库尔勒", "阿克苏", "和田", "克拉玛依", "塔城", "哈密", "石河子",
	// 港澳台
	//"香港", "澳门", "台北", "高雄", "台中", "花莲", "金门"
];

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
		const sheet = workbook.getWorksheet('火车车次信息')
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
		let sheet = workbook.addWorksheet('火车车次信息')
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
		//出发时间：凌晨1点以前，下午5点以后；到达时间：早上4点以后，中午12点以前；时长：16小时以内
		if(timeDefine(obj.depart) < 1 * 60 || timeDefine(obj.depart) > 17 * 60 && timeDefine(obj.arrive) < 14 * 60 && timeDefine(obj.arrive) > 4 * 60 && timeDefine(obj.duration)< 19 * 60){
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
		client.SayHello({name: url}, (err, response) => {
			if(err){
				reject()
			}
			console.log('从GRPC回传的信息：',response.message);
			resolve(response.message)
		});
	})
}

function promise2(client, str){
	return new Promise((resolve, reject) => {
		client.GetPic({name: str}, (err, response) => {
			if(err){
				reject()
			}
			console.log('从GRPC回传的信息：',response.message);
			resolve(response.message)
		});
	})
}

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

/**
 * 将二维数组转换为一维数组
 * @param {Array<Array>} array - 输入的二维数组
 * @returns {Array} - 转换后的一维数组
 */
function flattenArray(array) {
    return [].concat(...array);
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

function getWirelessIP() {
  	const interfaces = os.networkInterfaces();
    let wifiIp = null;
	console.log(interfaces)
    // 常见的无线网卡名称在不同操作系统下可能不同
    const wifiInterfaceNames = [
        'lo0',       
        'en2',       
        'awdl0',         
        'llw0',        
        'utun0',
		'utun1',
		'utun2',
        '无线网络连接'  
    ];

    for (const name of wifiInterfaceNames) {
        if (interfaces[name]) {
            for (const iface of interfaces[name]) {
                // 跳过内部（ipv6）和非IPv4地址
                if (iface.family === 'IPv4' && !iface.internal) {
                    wifiIp = iface.address;
                    break;
                }
            }
            if (wifiIp) break;
        }
    }

    return wifiIp || '无法确定无线IP地址';
}

/**
 * 从必应图片搜索获取第一张图片链接
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<string>} - 返回图片链接
 */
async function getBingFirstImage(keyword = '棋盘山') {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', 
			'--start-maximized',  
			'--disable-web-security',
			'--disable-features=IsolateOrigins,site-per-process'],
        dumpio: false,
		//headless: false,
		defaultViewport: null,
    });
    
    try {
        const page = await browser.newPage();  
        // 存储图片URL
        let targetImageUrl = null;
        // 监听新页面的创建
        browser.on('targetcreated', async (target) => {
            if (target.type() === 'page') {
                const newPage = await target.page();
                //console.log('新页面已打开');
                // 获取新页面的标题
                targetImageUrl = await newPage.url();
                //console.log('新页面的标题:', targetImageUrl);
                // 关闭新页面（可选）
                await newPage.close();
            }
        });
        await page.goto('https://cn.bing.com/images', { 
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        // 找到搜索框并输入关键词
        await page.type('input[name="q"]', keyword);
        await page.keyboard.press('Enter');
		// 等待一下确保结果完全加载
        await new Promise(resolve => setTimeout(resolve, 2000));
        // 点击第一个图片
        const firstImage = await page.$('.mimg');
        if (firstImage) {
            await firstImage.click();
            await new Promise(resolve => setTimeout(resolve, 3000));
			await page.waitForFunction(() => {
				const iframe = document.querySelector('.insightsOverlay');
				return iframe && getComputedStyle(iframe).display !== 'none';
			}, { timeout: 5000 });
			// 2. 获取 iframe 元素句柄
			const iframeHandle = await page.$('iframe.insightsOverlay');
			// 3. 转换为 Frame 上下文
			const frame = await iframeHandle.contentFrame();
			// 4. 在 iframe 内操作
			const viewButton = await frame.waitForSelector('#actionbar > ul > li.imgsrcc > div', {
				visible: true,
				timeout: 5000
			});
			await viewButton.click()
			await new Promise(resolve => setTimeout(resolve, 2000));
			if (!targetImageUrl) {
				targetImageUrl = await frame.evaluate(() => {
					const img = document.querySelector('.imgContainer img');
					return img ? img.src : null;
				});
			}
        }
        await browser.close();
		console.log('get url: ', targetImageUrl)
		if('chrome-error://chromewebdata/' === targetImageUrl || !targetImageUrl){
			return 'https://s21.ax1x.com/2025/08/04/pVUP4XQ.jpg';
		}
        return targetImageUrl;
    } catch (error) {
        console.error('Error in getBingFirstImage:', error.message);
        if (browser) {
            await browser.close();
        }
        return 'https://s21.ax1x.com/2025/08/04/pVUP4XQ.jpg';
    }
}

async function getFirstBaiduImage(searchTerm) {
  const browser = await puppeteer.launch({
    headless: 'new', // 设置为 false 可以看到浏览器操作
    defaultViewport: null,
    args: ['--start-maximized'] // 最大化窗口
  });

  try {
    const page = await browser.newPage();
    
    // 打开百度图片首页
    await page.goto('https://image.baidu.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('已打开百度图片首页');

    // 输入搜索词并提交
    await page.type('#image-search-input', searchTerm);
    await page.click('.submit-btn_38GYq');
    console.log(`已搜索: ${searchTerm}`);

    // 等待瀑布流容器加载
    await page.waitForSelector('#waterfall', { timeout: 15000 });
    
    // 等待li元素加载（添加重试逻辑）
    let retries = 3;
    let liElements = null;
    
    while (retries > 0 && (!liElements || liElements.length < 2)) {
      try {
        await page.waitForSelector('#waterfall ul > li:nth-child(2)', { timeout: 5000 });
        liElements = await page.$$('#waterfall ul > li');
      } catch (e) {
        retries--;
        console.log(`等待li元素失败，剩余重试次数: ${retries}`);
        await page.waitFor(1000); // 等待1秒后重试
      }
    }

    if (!liElements || liElements.length < 2) {
      throw new Error('无法找到足够数量的图片元素');
    }

    // 点击第二个li元素（索引为1）
    await liElements[1].click();
    console.log('已点击第二张图片');

    // 等待新页面打开
    const newPagePromise = new Promise(resolve => 
      browser.once('targetcreated', target => resolve(target.page()))
    );
    const newPage = await newPagePromise;
    await newPage.waitForNavigation({ waitUntil: 'networkidle2' });

    console.log('新页面已打开');

    // 获取高清图片URL（添加多种选择器尝试）
    const imageUrl = await newPage.evaluate(() => {
      const selectors = [
        '.image_1Vzas',
        '.image-contain-y_1fkDN',
        'img[src*="http"]' // 更通用的选择器
      ];
      
      for (const selector of selectors) {
        const img = document.querySelector(selector);
        if (img && img.src) return img.src;
      }
      return null;
    });

    if (imageUrl) {
      console.log('获取到的图片URL:', imageUrl);
      return imageUrl;
    } else {
      throw new Error('无法获取图片URL');
    }
  } catch (error) {
    console.error('爬取过程中出错:', error);
    return null;
  } finally {
    await browser.close();
  }
}
async function isImageUrlValid(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0', // 某些服务器要求
        'Referer': url // 有些CDN检查Referer
      }
    });

    const contentType = response.headers['content-type'] || '';
    const isImage = contentType.startsWith('image/');
    
    // 关闭 stream（不读取内容）
    response.data.destroy();

    return response.status === 200 && isImage;
  } catch (error) {
    return false;
  }
}
async function isImageUrlValid2(url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  try {
    const result = await page.evaluate((url) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve({
          isValid: true,
          width: img.naturalWidth,
          height: img.naturalHeight
        });
        img.onerror = () => resolve({
          isValid: false,
          width: 0,
          height: 0
        });
      });
    }, url);

    await browser.close();
    return result;
  } catch (err) {
    await browser.close();
    return {
      isValid: false,
      width: 0,
      height: 0
    };
  }
}
module.exports = {
	deepseekKey: process.env.DEEPSEEK_API_KEY,
	gaodeWebKey: process.env.gaodeWebKey,
	tencentMapKey: process.env.tencentMapKey,
	accessKey :process.env.accessKey,
	secretKey :process.env.secretKey,
	appid: process.env.appid,
	wesecret: process.env.wesecret,
	bucket: 'nextstickeroversea',
	outerURL: 'http://nextsticker.xyz/',
	port: 4000,
	defaultPicUrl: 'https://s21.ax1x.com/2025/08/04/pVUP4XQ.jpg',
	logo: 'https://res.cloudinary.com/dnfhsjz8u/image/upload/v1620372687/u_4168080911_4188088242_fm_15_gp_0_qfgrpg.jpg',
	secret: 'DavinciUser',
	authority: 'wudi41538bc6dd',
	getLocation: function(apiKey, str){
		return new Promise((resolve, reject) => {
			const url = `https://restapi.amap.com/v3/geocode/geo?address=${str}&key=${apiKey}&output=JSON`;
			fetch(url)
				.then(response => response.json())
				.then(data => {
					if (data.geocodes && data.geocodes.length > 0) {
						resolve(data.geocodes[0].location);
					} else {
						reject(new Error('No location found'));
					}
				})
				.catch(err => reject(err));
		});
	},
	deleteQiniu: function (accessKey, secretKey, bucket, key){
		const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
		const config = new qiniu.conf.Config();
		config.zone = qiniu.zone.Zone_z0;
		const bucketManager = new qiniu.rs.BucketManager(mac, config);
		return new Promise((resolve, reject) => {
			bucketManager.delete(bucket, key, function(err, respBody, respInfo) {
				if (err) {
					reject(err);
				} else {
					resolve(respBody);
				}
			});
		});
	},
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
		{"stationsName":"铁岭","stationsNameCHN":"tieling","inWhichCity":"铁岭","inWhichProvince":"辽宁省"},
		{"stationsName":"南京","stationsNameCHN":"nanjing","inWhichCity":"南京","inWhichProvince":"江苏省"},
	],
	crawler,
	crawler_child_process,
	Excel,
	sleep,
	trainFilter,
	testURL,
	promise1,
	promise2,
	getInfoFromGoogleTravel,
	getPicsFromGoogleTravel,
	spliceArray,
	formatTimeDiff,
	filterByProvinceAndCity,
	sleepWithHeartbeat,
	sleepWithHeartbeat1,
	flattenArray,
	getBingFirstImage,
	airportCities,
	getWirelessIP,
	isImageUrlValid,
	isImageUrlValid2,
	getFirstBaiduImage
};