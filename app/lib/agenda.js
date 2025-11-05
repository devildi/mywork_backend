const Agenda = require('agenda')

const connectionString = process.env.MONGODB_URI || 'mongodb://woody:41538bc6dd@127.0.0.1/davinci' // 默认沿用现有 Mongo 实例

const agenda = new Agenda({
  db: {
    address: connectionString,
    collection: process.env.AGENDA_COLLECTION || 'agenda_jobs',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  processEvery: process.env.AGENDA_PROCESS_EVERY || '30 seconds', // 定时轮询数据库拉取新任务
  maxConcurrency: Number.parseInt(process.env.AGENDA_MAX_CONCURRENCY || '5', 10), // 全局最大并发
  defaultConcurrency: Number.parseInt(process.env.AGENDA_DEFAULT_CONCURRENCY || '1', 10), // 单任务默认并发
})

module.exports = agenda
