#!/usr/bin/env node
/**
 * 从 YouMind 全量 prompts 生成分页 manifest（M2 定时任务可 cron 调用本脚本后上传 OSS）。
 *
 * 用法:
 *   node scripts/build-youmind-manifest.mjs
 *   node scripts/build-youmind-manifest.mjs --out ./manifest-output
 */
import fs from 'fs'
import path from 'path'

const SOURCE_URL =
  process.env.YOUMIND_SOURCE_URL ||
  'https://inner-oss-wlcb.bellecdn.cn/files/platform-ai-base/youmind/youmind-prompts.json'

const PAGE_SIZE = Number(process.env.MANIFEST_PAGE_SIZE || 20)
const outArg = process.argv.indexOf('--out')
const OUT_DIR =
  outArg >= 0 ? path.resolve(process.argv[outArg + 1]) : path.resolve('manifest-output')

const REF_HINT =
  /参考图|上传|提供的参考|使用提供|主体图|参考图像/i

function hasChinese(s) {
  return /[\u4e00-\u9fff]/.test(s)
}

function inferRequiresImage(row) {
  if (row.referenceImageUrls?.length) return true
  return REF_HINT.test(row.prompt || '')
}

function safeTagFile(tag) {
  return encodeURIComponent(tag)
}

async function downloadJson(url) {
  const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } })
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const { gunzipSync } = await import('zlib')
    return JSON.parse(gunzipSync(buf).toString('utf8'))
  }
  return JSON.parse(buf.toString('utf8'))
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data))
}

async function main() {
  console.log('下载源数据…', SOURCE_URL)
  const all = await downloadJson(SOURCE_URL)
  if (!Array.isArray(all)) throw new Error('源 JSON 应为数组')

  const byTag = new Map()
  const details = new Map()

  for (const row of all) {
    const tags = (row.tags || []).filter((t) => hasChinese(String(t)))
    if (!tags.length) continue

    const listItem = {
      id: row.id,
      title: row.title,
      coverUrl: row.coverUrl,
      tags: row.tags,
      requiresImage: inferRequiresImage(row),
    }

    if (!details.has(row.id)) {
      details.set(row.id, {
        ...listItem,
        prompt: row.prompt,
        description: row.description,
        referenceImageUrls: row.referenceImageUrls,
      })
    }

    for (const tag of tags) {
      if (!byTag.has(tag)) byTag.set(tag, [])
      byTag.get(tag).push(listItem)
    }
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(path.join(OUT_DIR, 'list'), { recursive: true })
  fs.mkdirSync(path.join(OUT_DIR, 'detail'), { recursive: true })

  const version = new Date().toISOString().replace(/[:.]/g, '-')
  const tagMeta = []

  for (const [tag, items] of byTag.entries()) {
    tagMeta.push({ name: tag, count: items.length })
    const pages = Math.ceil(items.length / PAGE_SIZE) || 1
    for (let p = 1; p <= pages; p++) {
      const slice = items.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
      writeJson(path.join(OUT_DIR, 'list', `${safeTagFile(tag)}.p${p}.json`), {
        tag,
        page: p,
        total: items.length,
        items: slice,
      })
    }
  }

  tagMeta.sort((a, b) => b.count - a.count)

  for (const [id, detail] of details.entries()) {
    writeJson(path.join(OUT_DIR, 'detail', `${id}.json`), detail)
  }

  writeJson(path.join(OUT_DIR, 'meta.json'), {
    version,
    pageSize: PAGE_SIZE,
    tags: tagMeta,
    updatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    detailCount: details.size,
  })

  console.log(
    `完成: ${details.size} 条详情, ${tagMeta.length} 个中文 tag, 输出目录 ${OUT_DIR}`
  )
  console.log('请上传到 OSS 路径与 miniprogram/config MANIFEST_BASE_URL 一致')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
