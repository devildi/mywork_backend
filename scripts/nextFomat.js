//进一步格式化，使得省份空项非空
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const fileUrl = path.join(__dirname, './stationsWithProvince.txt')
//const fileUrl = path.join(__dirname, './finalStationInfo.txt')
const fileUrl1 = path.join(__dirname, './finalStationInfo.txt')
async function formatStationData(stationsURL){
    try{
        const data = fs.readFileSync(fileUrl)
        console.log('读车站信息文件成功！')
        stationsArray = JSON.parse(data.toString('utf-8'))
        await fomatData(stationsArray, stationsArray.length)
    }catch(err){
        console.log(err)
    }
}

async function fomatData(array, length, index = 0){
    let item = array[index]
    if(item.hasOwnProperty('inWhichProvince') && item.inWhichProvince){

    } else {
        console.log(item)
        city2Province(array, index)
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
    } else {
        fomatData(array, length, index)
    }
}

function city2Province(array, index){
    console.log(array[index].inWhichCity)
    switch (array[index].inWhichCity) {
        case '吉林':
            array[index]['inWhichProvince'] = '吉林省'
            break;
        case '江边村':
            array[index]['inWhichProvince'] = '江西省'
            break;
        case '万象' || '磨丁' || '琅勃拉邦' || '孟赛' || '老挝万荣':
            array[index]['inWhichProvince'] = '老挝'
            break;
        case '岗嘎' || '米林':
            array[index]['inWhichProvince'] = '西藏自治区'
            break;
        case '来舟' || '麦园' || '沙县':
            array[index]['inWhichProvince'] = '福建省'
            break;
        case '马桥河':
            array[index]['inWhichProvince'] = '黑龙江省'
            break;
        case '昌江':
            array[index]['inWhichProvince'] = '海南省'
            break;
        default:
            array[index]['inWhichProvince'] = '香港特别行政区'
    }
}

formatStationData()
