const puppeteer = require('puppeteer')
const Trip = require('../app/models/trip')
const mongoose = require('mongoose')
const db = 'mongodb://woody:41538bc6dd@127.0.0.1/davinci'
const {
    isImageUrlValid2,
	defaultPicUrl,
    getBingFirstImage,
	getFirstBaiduImage
} = require('../app/config')
async function main() {
    try {
        mongoose.connect(db,{useNewUrlParser: true, useUnifiedTopology: true}, (err) => {
          if(err){
            console.log('数据库连接失败', err)
          }
        })
        await checkPicsUrl();
        mongoose.disconnect();
    } catch (err) {
        console.error('❌ 连接 MongoDB 失败', err);
    }
}
async function checkPicsUrl(){
    const uid = '1' //默认测试用的uid
    const trips = await Trip.find({ uid: uid })
    let array = []
    for (let i = 0; i < trips.length; i++) {
        let trip = trips[i]
        let detail = trip.detail
        let name = trip.tripName
        console.log(`==================准备检查${name}下的景点图片链接：==================`)
        for (let j = 0; j < detail.length; j++) {
            let day = detail[j]
            for (let k = 0; k < day.length; k++) {
                let point = day[k]
                if(point.picURL === defaultPicUrl) {
                    console.log(`${name}的【${point.nameOfScence}】的图片为【默认链接】！即将重置图片链接！！`);
                    const imageUrl = await getBingFirstImage(point.nameOfScence);
                    point.picURL = imageUrl
                    trip.markModified('detail');
                    await trip.save()
                    array.push({
                        whichTrip: i,
                        whichDay: j,
                        whichPoint: k,
                        nameOfScence: point.nameOfScence,
                        picURL:imageUrl,
                    })
                } else {
                    let {isValid, width, height }= await isImageUrlValid2(point.picURL)
                    console.log(point.nameOfScence, isValid, width, height)
                    if(!isValid || (width < 100 && height < 100 && width == height)){
                        console.log(`${name}的【${point.nameOfScence}】的图片链接【有问题】！即将重置图片链接！！`);
                        const imageUrl = await getBingFirstImage(point.nameOfScence);
                        if(imageUrl !== defaultPicUrl && imageUrl !== null && imageUrl !== undefined){
                            console.log(`已获取【${point.nameOfScence}】的新图片链接：${imageUrl}`);
                            point.picURL = imageUrl
                            trip.markModified('detail');
                            await trip.save()
                            array.push({
                                whichTrip: i,
                                whichDay: j,
                                whichPoint: k,
                                nameOfScence: point.nameOfScence,
                                picURL:imageUrl,
                            })
                        }
                    }
                }
            }
        }
    }

    for (let i = 0; i < array.length; i++) {
        console.log(`再次检验的【${array[i].nameOfScence}】的图片链接有效性！！`);
        let {isValid, width, height }= await isImageUrlValid2(array[i].picURL)
        if(!isValid || (width < 100 && height < 100 && width == height)){
            console.log(`${array[i].nameOfScencename}的图片链接【有问题】！即将重置图片链接！！`);
            const imageUrl = await getFirstBaiduImage(point.nameOfScence);
            if(imageUrl !== defaultPicUrl && imageUrl !== null && imageUrl !== undefined){
                trips[array[i].whichTrip][array[i].whichDay][array[i].whichPoint].picURL = imageUrl
                trip.markModified('detail');
                await trip.save()
            }
        } else{
            console.log(`【${array[i].nameOfScence}】的图片链接有效！！`);
        }
    }
}
main()
