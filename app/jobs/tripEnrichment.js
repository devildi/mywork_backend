const Trip = require('../models/trip')
const agentController = require('../controllers/agent')
const agenda = require('../lib/agenda')
const { getBingFirstImage } = require('../config')

const isBlank = (value) => {
  if (value == null) return true
  if (typeof value === 'string') {
    return value.trim() === ''
  }
  return false
}

const safeParse = (value) => {
  // 接口可能返回字符串或对象，统一解析后再使用
  if (value == null) return null
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch (error) {
      return value
    }
  }
  return value
}

agenda.define('trip.enrich', async (job) => {
  const { uid } = job.attrs.data || {}
  if (!uid) return

  let trip = await Trip.findOne({ uid })
  if (!trip) return

  trip.enrichmentStatus = 'processing' // 标记为处理中，避免重复调度
  trip.enrichmentErrors = [] // 清空历史错误，准备记录本次执行结果
  await trip.save()

  const errors = []
  const detail = Array.isArray(trip.detail) ? trip.detail : []
  const poiNames = []

  detail.forEach((day) => {
    if (!Array.isArray(day)) return
    day.forEach((point) => {
      if (!point || typeof point !== 'object') return
      const name = typeof point.nameOfScence === 'string' ? point.nameOfScence.trim() : ''
      if (name) {
        poiNames.push(name)
      }
    })
  })

  const uniquePoiNames = [...new Set(poiNames)] // 去重后统一请求行程城市/标签信息

  if (uniquePoiNames.length > 0 && (isBlank(trip.city) || isBlank(trip.country) || isBlank(trip.tags))) {
    try {
      const ctx = { request: { query: { chat: uniquePoiNames.join('/') } }, body: null }
      await agentController.getInfos(ctx)
      const payload = safeParse(ctx.body)
      if (payload && typeof payload === 'object') {
        if (isBlank(trip.city) && payload.city && !isBlank(payload.city)) {
          trip.city = payload.city
        }
        if (isBlank(trip.country) && payload.country && !isBlank(payload.country)) {
          trip.country = payload.country
        }
        if (isBlank(trip.tags) && payload.tags && !isBlank(payload.tags)) {
          trip.tags = payload.tags
        }
      }
    } catch (error) {
      console.error(`行程 ${uid} 元信息补全失败：`, error)
      errors.push(`meta:${error.message}`)
    }
  }

  let detailChanged = false // 标记 detail 是否被修改，便于统一保存

  for (let dayIndex = 0; dayIndex < detail.length; dayIndex += 1) {
    const day = detail[dayIndex]
    if (!Array.isArray(day)) continue

    for (let pointIndex = 0; pointIndex < day.length; pointIndex += 1) {
      const point = day[pointIndex]
      if (!point || typeof point !== 'object') continue
      const name = typeof point.nameOfScence === 'string' ? point.nameOfScence.trim() : ''
      if (!name) continue

      if (isBlank(point.des)) {
        try {
          const ctx = { request: { query: { chat: name } }, body: null }
          await agentController.getDes(ctx)
          const description = typeof ctx.body === 'string' ? ctx.body : ''
          if (!isBlank(description)) {
            point.des = description
            detailChanged = true
          }
        } catch (error) {
          console.error(`获取 ${name} 描述失败：`, error)
          errors.push(`des:${name}`)
        }
      }

      if (isBlank(point.picURL)) {
        try {
          const imageUrl = await getBingFirstImage(name)
          if (!isBlank(imageUrl)) {
            point.picURL = imageUrl
            detailChanged = true
          }
        } catch (error) {
          console.error(`获取 ${name} 图片链接失败：`, error)
          errors.push(`pic:${name}`)
        }
      }
    }
  }

  if (detailChanged) {
    trip.markModified('detail')
  }

  if (errors.length > 0) {
    trip.enrichmentStatus = 'failed'
    trip.enrichmentErrors = errors
  } else {
    trip.enrichmentStatus = 'done'
    trip.enrichmentErrors = []
  }

  await trip.save()
})

module.exports = agenda
