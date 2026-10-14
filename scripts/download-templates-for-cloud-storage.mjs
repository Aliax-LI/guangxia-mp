#!/usr/bin/env node
/**
 * scripts/download-templates-for-cloud-storage.mjs
 * 
 * 将模版封面图片批量下载到本地目录 cloud-storage-assets/templates/
 * 方便在微信开发者工具「云开发 -> 云存储」中一键拖拽/上传至 templates 目录。
 * 
 * 用法:
 *   node scripts/download-templates-for-cloud-storage.mjs          # 默认下载精选前 100 张
 *   node scripts/download-templates-for-cloud-storage.mjs --count 500
 */

import fs from 'fs'
import path from 'path'
import https from 'https'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const ASSETS_DIR = path.resolve(ROOT_DIR, 'cloud-storage-assets', 'templates')
const JSON_FILES = [
  path.resolve(ROOT_DIR, 'database-export', 'templates.json'),
  path.resolve(ROOT_DIR, 'database-export', 'templates_part1.json'),
  path.resolve(ROOT_DIR, 'database-export', 'templates_part2.json'),
]

const countArgIdx = process.argv.indexOf('--count')
const countValue = countArgIdx >= 0 ? process.argv[countArgIdx + 1] : '100'
const MAX_COUNT = countValue === 'all' || countValue === '0' ? Number.POSITIVE_INFINITY : Number(countValue) || 100

function downloadHttp1(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        const fileStream = fs.createWriteStream(destPath)
        res.pipe(fileStream)
        fileStream.on('finish', () => {
          fileStream.close()
          resolve()
        })
        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {})
          reject(err)
        })
      }
    ).on('error', reject)
  })
}

async function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true })

  // 三个导出文件存在小量互补记录；用 id 去重后合并成全量任务
  const idSet = new Set()
  const allItems = []
  for (const jsonFile of JSON_FILES) {
    if (!fs.existsSync(jsonFile)) continue
    for (const line of fs.readFileSync(jsonFile, 'utf8').trim().split('\n')) {
      const item = JSON.parse(line)
      if (!item?.id || idSet.has(String(item.id))) continue
      idSet.add(String(item.id))
      allItems.push(item)
    }
  }

  if (!allItems.length) {
    throw new Error('导出文件中没有可用模版数据，请先执行 npm run export:cloud-db')
  }

  const targetItems = allItems.slice(0, MAX_COUNT)

  console.log(`源数据总数: ${allItems.length}`)
  console.log(`[1/2] 准备下载 ${targetItems.length} 张模版图片到: ${ASSETS_DIR}...`)
  const startTime = Date.now()

  let successCount = 0
  let skipCount = 0
  let failCount = 0

  // 适度并发，保证速度同时降低远端图片源限流概率
  const CONCURRENCY = 8
  const queue = [...targetItems]

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item || !item.coverUrl) continue

      const fileName = `${item.id}.jpg`
      const targetPath = path.resolve(ASSETS_DIR, fileName)

      if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1024) {
        skipCount++
        continue
      }

      let attempt = 0
      try {
        // 远端图片源偶尔会限流，失败后短暂重试，保证 2.6 万量级任务能断点续跑
        while (attempt < 3) {
          try {
            await downloadHttp1(item.coverUrl, targetPath)
            break
          } catch (err) {
            attempt++
            if (attempt >= 3) throw err
            await new Promise((r) => setTimeout(r, attempt * 800))
          }
        }
        successCount++
        if (successCount % 10 === 0 || successCount === targetItems.length) {
          console.log(`已成功下载 ${successCount} 张图片...`)
        }
      } catch (e) {
        failCount++
        console.warn(`下载失败 (id: ${item.id}): ${e.message}`)
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker())
  await Promise.all(workers)

  console.log(`\n[2/2] 下载任务完成！`)
  console.log(`总耗时: ${((Date.now() - startTime) / 1000).toFixed(1)} 秒`)
  console.log(`成功下载: ${successCount} 张`)
  console.log(`已存在跳过: ${skipCount} 张`)
  console.log(`失败: ${failCount} 张`)
  console.log(`\n📂 图片存放目录: ${ASSETS_DIR}`)
  console.log(`👉 上传操作指引:`)
  console.log(`1. 打开微信开发者工具 -> 点击「云开发」->「云存储」`)
  console.log(`2. 新建名为 templates 的文件夹（或直接进入根目录）`)
  console.log(`3. 点击「上传文件」或把上述目录中的图片拖拽上传至云存储 templates/`)
}

main().catch((err) => {
  console.error('运行失败:', err)
  process.exit(1)
})
