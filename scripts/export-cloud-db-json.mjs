#!/usr/bin/env node
/**
 * scripts/export-cloud-db-json.mjs
 * 
 * 将 YouMind 全量 26,000+ 条 prompts 解析并转换为微信云开发数据库标准导入格式 (JSON Lines)
 * 生成文件: database-export/templates.json
 * 
 * 用法:
 *   node scripts/export-cloud-db-json.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const OUT_DIR = path.resolve(ROOT_DIR, 'database-export')
const OUT_FILE = path.resolve(OUT_DIR, 'templates.json')

const SOURCE_URL =
  process.env.YOUMIND_SOURCE_URL ||
  'https://inner-oss-wlcb.bellecdn.cn/files/platform-ai-base/youmind/youmind-prompts.json'

const REF_HINT = /参考图|上传|提供的参考|使用提供|主体图|参考图像|基于参考|自拍/i

// 智能归类一级大分类
function inferCategory(item) {
  const s = ((item.tags || []).join(' ') + ' ' + (item.title || '')).toLowerCase()
  if (/美食|饮料|食品|咖啡|甜品|烘焙|吃|蛋糕|酒/i.test(s)) return 'food'
  if (/拼图|故事板|漫画 \/ 故事板|网格|连拍|分屏/i.test(s)) return 'puzzle'
  if (/粉丝|应援|明星|偶像|爱豆/i.test(s)) return 'fan'
  if (/生活|日常|旅行|城市|街道|自然|风景|探店|露营|建筑/i.test(s)) return 'life'
  if (/动效|live|动态|视频|微动/i.test(s)) return 'live'
  if (/摄影|胶片|光影|棚拍|复古|黑白|人像 \/ 自拍/i.test(s)) return 'photo'
  return 'ai'
}

// 智能归类二级标签胶囊
function inferSubTag(item) {
  const s = ((item.tags || []).join(' ') + ' ' + (item.title || '')).toLowerCase()
  if (/人像|写真|自拍|模特|面容|妆容|婚纱|肖像/i.test(s)) return 'portrait'
  if (/动漫|漫画|二次元|q版|q 萌风|萌|插画/i.test(s)) return 'anime'
  if (/3d|渲染|建模|c4d|盲盒|手办|立体|等距/i.test(s)) return '3d'
  if (/复古|怀旧|胶片|拍立得|y2k|ccd|港风|80s|90s/i.test(s)) return 'retro'
  if (/艺术|海报|排版|水彩|油画|设计|波普|risograph/i.test(s)) return 'art'
  if (/动效|动态|创意|特效|魔法/i.test(s)) return 'motion'
  if (/趣味|搞怪|恶搞|表情|游戏|动物|生物|宠物/i.test(s)) return 'fun'
  return 'featured'
}

// 确定是否需要参考图
function inferRequiresImage(item) {
  if (item.referenceImageUrls && item.referenceImageUrls.length > 0) return true
  return REF_HINT.test(item.prompt || '') || REF_HINT.test(item.description || '')
}

// 计算随机而稳定的点赞与宽高比
function hashLikes(idStr) {
  let hash = 0
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash * 31 + idStr.charCodeAt(i)) >>> 0
  }
  return 300 + (hash % 4700)
}

function hashAspect(idStr) {
  let hash = 0
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash * 17 + idStr.charCodeAt(i)) >>> 0
  }
  const ratios = [1.1, 1.15, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5]
  return ratios[hash % ratios.length]
}

function hashAvatarIndex(idStr) {
  let hash = 0
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash + idStr.charCodeAt(i)) >>> 0
  }
  return (hash % 5) + 1
}

async function main() {
  console.log(`[1/3] 开始拉取源数据: ${SOURCE_URL}...`)
  const startTime = Date.now()
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`HTTP 请求失败: ${res.status}`)
  
  const rawList = await res.json()
  if (!Array.isArray(rawList)) throw new Error('源 JSON 格式必须为数组')
  console.log(`[2/3] 成功读取 ${rawList.length} 条数据，开始标准化清洗与转化...`)

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const allStream = fs.createWriteStream(path.resolve(OUT_DIR, 'templates_all.json'), { encoding: 'utf8' })
  const part1Stream = fs.createWriteStream(path.resolve(OUT_DIR, 'templates_part1.json'), { encoding: 'utf8' })
  const part2Stream = fs.createWriteStream(path.resolve(OUT_DIR, 'templates_part2.json'), { encoding: 'utf8' })
  const topStream = fs.createWriteStream(path.resolve(OUT_DIR, 'templates_top2000.json'), { encoding: 'utf8' })

  let validCount = 0
  const categoryStats = {}
  const subTagStats = {}
  const half = Math.ceil(rawList.length / 2)

  for (let idx = 0; idx < rawList.length; idx++) {
    const item = rawList[idx]
    if (!item.id || !item.coverUrl) continue

    const idStr = String(item.id).trim()
    const category = inferCategory(item)
    const subTag = inferSubTag(item)
    const likes = hashLikes(idStr)
    const aspectRatio = hashAspect(idStr)
    const avatarIdx = hashAvatarIndex(idStr)

    categoryStats[category] = (categoryStats[category] || 0) + 1
    subTagStats[subTag] = (subTagStats[subTag] || 0) + 1

    const doc = {
      _id: idStr,
      id: idStr,
      title: item.title || '无标题模版',
      coverUrl: item.coverUrl,
      prompt: item.prompt || '',
      description: item.description || '',
      referenceImageUrls: Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : [],
      requiresImage: inferRequiresImage(item),
      category,
      subTag,
      tags: Array.isArray(item.tags) ? item.tags : [],
      author: {
        name: item.author || 'AI主理人',
        avatar: `https://tdesign.gtimg.com/mobile/demos/avatar${avatarIdx}.png`,
      },
      likes,
      aspectRatio,
      createdAt: item.createdAt || new Date().toISOString(),
      sourceUrl: item.sourceUrl || '',
    }

    const line = JSON.stringify(doc) + '\n'
    allStream.write(line)

    if (validCount < 2000) {
      topStream.write(line)
    }

    if (validCount < half) {
      part1Stream.write(line)
    } else {
      part2Stream.write(line)
    }

    validCount++
  }

  allStream.end()
  part1Stream.end()
  part2Stream.end()
  topStream.end()

  console.log(`[3/3] 转换完成！`)
  console.log(`耗时: ${((Date.now() - startTime) / 1000).toFixed(1)} 秒`)
  console.log(`输出目录: ${OUT_DIR}`)
  console.log(`- templates_all.json     (全量 ${validCount} 条)`)
  console.log(`- templates_part1.json   (第 1 部分，约 1.3 万条，规避50MB单文件限制)`)
  console.log(`- templates_part2.json   (第 2 部分，约 1.3 万条)`)
  console.log(`- templates_top2000.json (前 2000 条精选模版，约 4MB，极速导入)`)
  console.log('分类统计:', categoryStats)
  console.log('子标签统计:', subTagStats)
}

main().catch((err) => {
  console.error('执行失败:', err)
  process.exit(1)
})
