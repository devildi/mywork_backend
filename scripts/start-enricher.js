const mongoose = require('mongoose')
const agenda = require('../app/lib/agenda')

const connectionString = process.env.MONGODB_URI || 'mongodb://woody:41538bc6dd@127.0.0.1/davinci'

const graceful = () => {
  // 监听退出信号，确保 Agenda 先停再结束进程
  Promise.allSettled([agenda.stop(), mongoose.connection.close()])
    .finally(() => process.exit(0))
}

process.on('SIGTERM', graceful)
process.on('SIGINT', graceful)

;(async () => {
  try {
    await mongoose.connect(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    console.log('Mongoose connected for Agenda worker')

    require('../app/jobs/tripEnrichment') // 注册行程补全相关的 Agenda 任务

    await agenda.start()
    console.log('Trip enrichment worker started')
  } catch (error) {
    console.error('Failed to start agenda worker', error)
    process.exit(1)
  }
})()
