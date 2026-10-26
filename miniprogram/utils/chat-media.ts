import type { ChatContentPart } from '../services/chat'
import { turnInputImages } from './compose'

function mimeFromPath(path: string): string {
  if (/\.jpe?g($|\?)/i.test(path)) return 'image/jpeg'
  if (/\.webp($|\?)/i.test(path)) return 'image/webp'
  if (/\.gif($|\?)/i.test(path)) return 'image/gif'
  return 'image/png'
}

function readLocalBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        const data = res.data
        if (typeof data === 'string' && data) resolve(data)
        else reject(new Error('图片读取失败'))
      },
      fail(err) {
        reject(new Error(err.errMsg || '图片读取失败'))
      },
    })
  })
}

function downloadToTemp(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('图片下载失败'))
      },
      fail(err) {
        reject(new Error(err.errMsg || '图片下载失败'))
      },
    })
  })
}

/** 本地路径或 https 图转为 data URL，供 Open Responses `input_image` 使用。 */
export async function imagePathToDataUrl(imagePath: string): Promise<string> {
  const src = (imagePath || '').trim()
  if (!src) throw new Error('缺少图片')
  if (/^data:image\//i.test(src)) return src
  if (/^https?:\/\//i.test(src)) {
    const local = await downloadToTemp(src)
    const b64 = await readLocalBase64(local)
    return `data:${mimeFromPath(local)};base64,${b64}`
  }
  const b64 = await readLocalBase64(src)
  return `data:${mimeFromPath(src)};base64,${b64}`
}

function normalizePathArg(imagePath?: string | string[]): string[] {
  if (Array.isArray(imagePath)) return imagePath.filter(Boolean)
  const single = (imagePath || '').trim()
  return single ? [single] : []
}

export async function buildUserChatContent(
  prompt: string,
  imagePath?: string | string[],
): Promise<string | ChatContentPart[]> {
  const text = (prompt || '').trim()
  const paths = normalizePathArg(imagePath)
  if (!paths.length) return text || ' '
  const parts: ChatContentPart[] = []
  if (text) parts.push({ type: 'text', text })
  for (const path of paths) {
    const url = await imagePathToDataUrl(path)
    parts.push({ type: 'image_url', image_url: { url, detail: 'auto' } })
  }
  return parts
}

export function chatTurnLabel(prompt: string, imagePath?: string | string[]): string {
  const text = (prompt || '').trim()
  if (text) return text
  const n = normalizePathArg(imagePath).length
  if (n > 1) return `${n} 张图片`
  if (n === 1) return '图片消息'
  return ''
}

export function chatTurnLabelFromTurn(turn: { prompt?: string; imagePath?: string; imagePaths?: string[] }): string {
  return chatTurnLabel(turn.prompt || '', turnInputImages(turn))
}
