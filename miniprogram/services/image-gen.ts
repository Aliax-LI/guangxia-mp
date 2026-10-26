import { IMAGE_MODEL, SUB2API_BASE_URL } from '../config/index'
import { getApiKey } from '../utils/storage'
import type { Sub2ApiEnvelope } from './http'

export type GenerateInput = {
  prompt: string
  imagePath?: string
  size?: string
  /** 张数，网关按 1–4 收，默认 1 */
  n?: number
  /** 不传则用 IMAGE_MODEL */
  model?: string
  /** low / medium / high。auto 或空则不传。 */
  quality?: string
}

export type GeneratedImage = {
  imageUrl?: string
  b64?: string
}

export type GenerateResult = GeneratedImage & {
  outputs: GeneratedImage[]
}

/** gpt-image 单次最多 4 张，非法值收成 1。 */
export function clampImageCount(n?: number): number {
  const count = Math.round(Number(n) || 1)
  if (count < 1) return 1
  if (count > 4) return 4
  return count
}

function imagePayload(input: GenerateInput): Record<string, string | number> {
  const body: Record<string, string | number> = {
    model: input.model || IMAGE_MODEL,
    prompt: input.prompt,
    n: clampImageCount(input.n),
    size: input.size || 'auto',
    response_format: 'url',
  }
  if (input.quality && input.quality !== 'auto') body.quality = input.quality
  return body
}

function imageForm(input: GenerateInput): Record<string, string> {
  const body = imagePayload(input)
  return {
    model: String(body.model),
    prompt: String(body.prompt),
    n: String(body.n),
    size: String(body.size),
    response_format: String(body.response_format),
    ...(body.quality ? { quality: String(body.quality) } : {}),
  }
}

function parseGatewayError(data: unknown): string {
  if (!data || typeof data !== 'object') return '生图失败'
  const d = data as Sub2ApiEnvelope<unknown> & {
    error?: { message?: string }
  }
  if (d.message) return d.message
  if (d.error?.message) return d.error.message
  return '生图失败'
}

function parseImageResponse(data: unknown): GenerateResult {
  if (data && typeof data === 'object' && 'code' in data) {
    const env = data as Sub2ApiEnvelope<{ data?: Array<{ url?: string; b64_json?: string }> }>
    if (env.code !== 0) {
      throw new Error(env.message || '生图失败')
    }
    data = env.data
  }
  if (!data || typeof data !== 'object') {
    throw new Error('生图响应格式异常')
  }
  const d = data as {
    data?: Array<{ url?: string; b64_json?: string }>
    error?: { message?: string }
  }
  if (d.error?.message) throw new Error(d.error.message)
  const outputs: GeneratedImage[] = []
  for (const item of d.data || []) {
    if (item.url) outputs.push({ imageUrl: item.url })
    else if (item.b64_json) outputs.push({ b64: item.b64_json })
  }
  if (!outputs.length) throw new Error('未返回图片')
  return { ...outputs[0], outputs }
}

export function humanizeGenerateError(raw: string): string {
  if (/未登录/.test(raw)) return '登录后才能生成'
  if (/file path invalid/i.test(raw)) return '参考图读不到，请重新选一张'
  if (/url not in domain list/i.test(raw)) return '这张图的域名还没加入小程序下载白名单'
  if (/downloadFile:fail/i.test(raw)) return '参考图下载失败，请换一张本地照片'
  if (/timeout/i.test(raw)) return '生成超时，点重试'
  if (/interrupted|abort/i.test(raw)) return '连接中断了，点重试'
  return raw || '生成失败，请再试一次'
}

/** 文生图（无用户图，R3 纯 prompt 模板） */
export function generateFromPrompt(input: GenerateInput): Promise<GenerateResult> {
  const apiKey = getApiKey()
  if (!apiKey) return Promise.reject(new Error('请先登录'))

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUB2API_BASE_URL}/v1/images/generations`,
      method: 'POST',
      timeout: 180000,
      header: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: imagePayload(input),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(parseImageResponse(res.data))
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)))
          }
        } else {
          reject(new Error(parseGatewayError(res.data)))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '生图失败'))
      },
    })
  })
}

/** 开发者工具的临时文件和用户目录也以 http://tmp、http://usr 开头，不能当网络图去下载。 */
function isRemoteUrl(path: string): boolean {
  return /^https?:\/\//i.test(path) && !/^https?:\/\/(tmp|usr)\//i.test(path)
}

function fileExt(path: string): string {
  const matched = path.match(/\.([a-zA-Z0-9]{1,4})(?:\?|#|$)/)
  const ext = (matched?.[1] || 'jpg').toLowerCase()
  return ext === 'jpeg' ? 'jpg' : ext === 'png' || ext === 'webp' ? ext : 'jpg'
}

function downloadRemote(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error(`下载图片失败: HTTP ${res.statusCode}`))
      },
      fail(err) {
        reject(new Error(err.errMsg || '下载图片失败'))
      },
    })
  })
}

/** 复制到用户目录再交给 uploadFile。http://tmp、被截断的地址会直接报 file path invalid。 */
function materializeUploadPath(src: string): Promise<string> {
  const dest = `${wx.env.USER_DATA_PATH}/upload_${Date.now()}.${fileExt(src)}`
  const fs = wx.getFileSystemManager()
  return new Promise((resolve, reject) => {
    const writeCopied = (data: string | ArrayBuffer) => {
      fs.writeFile({
        filePath: dest,
        data,
        success: () => resolve(dest),
        fail: (err) => reject(new Error(err.errMsg || '图片无法读取')),
      })
    }
    fs.copyFile({
      srcPath: src,
      destPath: dest,
      success: () => resolve(dest),
      fail: () => {
        fs.readFile({
          filePath: src,
          success: (res) => writeCopied(res.data),
          fail: (err) => reject(new Error(err.errMsg || '图片路径无效，请重新选择照片')),
        })
      },
    })
  })
}

async function resolveUploadPath(imagePath: string): Promise<string> {
  const local = isRemoteUrl(imagePath) ? await downloadRemote(imagePath) : imagePath
  return materializeUploadPath(local)
}

/** 图 + prompt（修图 / 需上传的模板） */
export function generateFromImage(input: GenerateInput): Promise<GenerateResult> {
  const apiKey = getApiKey()
  if (!apiKey) return Promise.reject(new Error('请先登录'))
  const imagePath = input.imagePath
  if (!imagePath) return Promise.reject(new Error('请选择图片'))

  return resolveUploadPath(imagePath).then(
    (filePath) =>
      new Promise<GenerateResult>((resolve, reject) => {
        uploadImageFile(filePath, input, apiKey, resolve, reject)
      }),
  )
}

function uploadImageFile(
  filePath: string,
  input: GenerateInput,
  apiKey: string,
  resolve: (value: GenerateResult) => void,
  reject: (reason: Error) => void
) {
  wx.uploadFile({
    url: `${SUB2API_BASE_URL}/v1/images/edits`,
    filePath,
    name: 'image',
    formData: imageForm(input),
    header: {
      Authorization: `Bearer ${apiKey}`,
    },
    success(res) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const data = JSON.parse(res.data)
          resolve(parseImageResponse(data))
        } catch (e) {
          reject(e instanceof Error ? e : new Error('解析响应失败'))
        }
      } else {
        try {
          reject(new Error(parseGatewayError(JSON.parse(res.data))))
        } catch {
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      }
    },
    fail(err) {
      reject(new Error(err.errMsg || '上传生图失败'))
    },
  })
}

export async function runGenerate(input: GenerateInput): Promise<GenerateResult> {
  if (input.imagePath) {
    return generateFromImage(input)
  }
  return generateFromPrompt(input)
}
