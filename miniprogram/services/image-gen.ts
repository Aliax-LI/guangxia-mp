import { IMAGE_MODEL, SUB2API_BASE_URL } from '../config/index'
import { getApiKey } from '../utils/storage'
import type { Sub2ApiEnvelope } from './http'

export type GenerateInput = {
  prompt: string
  imagePath?: string
  size?: string
}

export type GenerateResult = {
  imageUrl?: string
  b64?: string
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
  const first = d.data?.[0]
  if (!first) throw new Error('未返回图片')
  if (first.url) return { imageUrl: first.url }
  if (first.b64_json) return { b64: first.b64_json }
  throw new Error('未返回图片 URL 或 base64')
}

/** 文生图（无用户图，R3 纯 prompt 模板） */
export function generateFromPrompt(input: GenerateInput): Promise<GenerateResult> {
  const apiKey = getApiKey()
  if (!apiKey) return Promise.reject(new Error('请先登录'))

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUB2API_BASE_URL}/v1/images/generations`,
      method: 'POST',
      header: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        model: IMAGE_MODEL,
        prompt: input.prompt,
        n: 1,
        size: input.size || 'auto',
      },
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

/** 图 + prompt（修图 / 需上传的模板） */
export function generateFromImage(input: GenerateInput): Promise<GenerateResult> {
  const apiKey = getApiKey()
  if (!apiKey) return Promise.reject(new Error('请先登录'))
  const imagePath = input.imagePath
  if (!imagePath) return Promise.reject(new Error('请选择图片'))

  return new Promise((resolve, reject) => {
    // 检查是否是网络图片
    const isNetworkImage = imagePath.startsWith('http://') || imagePath.startsWith('https://')
    
    if (isNetworkImage) {
      // 如果是网络图片，先下载到本地
      wx.downloadFile({
        url: imagePath,
        success(downloadRes) {
          if (downloadRes.statusCode === 200) {
            // 下载成功，使用临时文件路径上传
            uploadImageFile(downloadRes.tempFilePath, input, apiKey, resolve, reject)
          } else {
            reject(new Error(`下载图片失败: HTTP ${downloadRes.statusCode}`))
          }
        },
        fail(err) {
          reject(new Error(err.errMsg || '下载图片失败'))
        },
      })
    } else {
      // 如果是本地路径，直接上传
      uploadImageFile(imagePath, input, apiKey, resolve, reject)
    }
  })
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
    formData: {
      model: IMAGE_MODEL,
      prompt: input.prompt,
      n: '1',
      size: input.size || 'auto',
    },
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
