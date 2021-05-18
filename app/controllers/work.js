const Work = require('../models/work')
const User = require('../models/users')
const { h0, f1, d0 } = require('../config');

class WorkCtl {
  async create(ctx) {
    const user = ctx.state.user._id;
    const { date, shootnums, program, des} = ctx.request.body
    let work = await Work.findOne({whose: user, date: date})
    if(work){
      work.shootnums = work.shootnums + parseInt(shootnums)
      if(!f1(work.program, program)){
        work.program = work.program + '|' + program
      }
      if(!f1(work.des, des)){
        work.des = work.des + '|' + des
      }
      let work2 = await work.save()
      ctx.body = work2
    } else {
      let work1 = await new Work({...ctx.request.body, whose: user}).save();
      ctx.body = work1;
    }
  }

  async count(ctx){
    //获取全部有数据用户：
    console.log('获取全部有数据用户：')
    const worksAll = await Work.find().populate({path: 'whose',select: 'name'})
    let allUsers = await User.find()
    let allUsersClone = [...allUsers]
    let filterUser = []
    console.log(worksAll, allUsers)
    for(let i = 0; i < allUsers.length; i++){

      filterUser.push(worksAll.filter(function(item){
        return item.whose.name === allUsers[i].name
      })) 
    }
    // filterUser.forEach(function(i, index){
    //   if(i.length === 0){
    //     allUsers.splice(index, 1)
    //   }
    // })
    for(let i = filterUser.length - 1; i >= 0; i--){
      if(filterUser[i].length === 0){
        allUsersClone.splice(i, 1)
      }
    }
    //获取7天数据：图表
    let obj = {
      name: '',
    }
    for(let i = 0; i < allUsersClone.length; i++){
      obj[allUsersClone[i].name] = 0
    }
    let chartArray = []
    let tasks = []
    let chartArrayWorker = []
    let output = []
    for(let i = 0; i < 7; i++){
      chartArray.unshift(h0(d0(i)))
    }
    for(let i =0; i < chartArray.length; i++){
      tasks.push(Work.find({date: chartArray[i]}).populate('whose'))
    }
    chartArrayWorker = await Promise.all(tasks)
    for(let i = 0; i < chartArrayWorker.length; i++){
      if(chartArrayWorker[i].length){
        let obj1 = Object.assign({}, obj)
        for(let j = 0; j < chartArrayWorker[i].length; j++){
          obj1[chartArrayWorker[i][j].whose.name] = chartArrayWorker[i][j].shootnums
        }

        output.push(Object.assign({}, obj1, {name: chartArray[i]}))
      } else {
        output.push(Object.assign({}, obj, {name: chartArray[i]}))
      }
    }

    output = Object.keys(output[0]).length === 1 ? null : output

    //分页获取全部数据：表格
    const perPage = 30 * allUsers.length
    const page = parseInt(ctx.query.page) || 1
    const works= await Work.find().sort({'date':-1}).limit(page * perPage).populate('whose')
    
    let arrWork = []
    let arrWork1 = []
    for(let i = 0; i < allUsers.length; i++){
      arrWork1 = works.filter(function(item){
        return item.whose.name === allUsers[i].name
      })
      if(arrWork1.length){
        arrWork.push(arrWork1)
      }
    }

    ctx.body = {
      allUsers,
      output,
      arrWork,
      total: worksAll.length,
    }
  }
}

module.exports = new WorkCtl();