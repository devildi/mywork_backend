//用于分类格式化全国所有火车站：
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const fileUrl = path.join(__dirname, '../results/stations.txt')
const fileUrl1 = path.join(__dirname, '../results/stationsWithProvince.txt')
const {
    tencentMapKey,
	stationsURL,
} = require('../app/config')

async function formatStationData(stationsURL){
    let stationsArray = []
    try{
        const data = fs.readFileSync(fileUrl)
        console.log('读车站信息文件成功！')
        stationsArray = JSON.parse(data.toString('utf-8'))
        
    }catch(err){
        console.log('文件不存在或者文件打不开！重新获取文件！')
        const stations = await axios.get(stationsURL)
        const array = stations.data.split('@')
        array.splice(0,1)
        array.forEach(function(item){
            const array1 = item.split('|')
            stationsArray.push({
                stationsName: array1[1],
                stationsNameCHN: array1[3],
                inWhichCity: array1[7].split(' ').join('')
            })
        })
        fs.writeFile(fileUrl, JSON.stringify(stationsArray), err => {
            if(err){
                console.log('文件写入失败！',err)
            }else {
                console.log('文件写入成功！')
            }
        })
    }
    await fomatData(stationsArray, stationsArray.length)
}

async function fomatData(array, length, index=0) {
    let item = array[index]
    try{
        const URL = `https://apis.map.qq.com/ws/geocoder/v1?address=${item.inWhichCity}&key=${tencentMapKey}`
        const cityInfo = await axios.get(encodeURI(URL))
        if(cityInfo.data.message === 'Success'){
            array[index]['inWhichProvince'] = cityInfo.data.result.address_components.province
            console.log(`${item.stationsName}站已完成！${index + 1}/${length}`)
        } else {
            console.log(`已跳过${item.stationsName}=====================`)
        }
        index ++
        if(index === length){
			console.log('Finish')
            fs.writeFile(fileUrl1, JSON.stringify(array), err => {
                if(err){
                    console.log('文件写入失败！')
                }else {
                    console.log('文件写入成功！')
                }
            })
		} else{
			await fomatData(array, length, index)
		}
    }catch(err){
        if(index !== length){
            console.log(`第${index + 1}个出错（${item.stationsName}），准备重新发起请求：！`)
            await fomatData(array, length, index)
        }
    }
}

formatStationData(stationsURL)