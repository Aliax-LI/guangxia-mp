import { SUB2API_API_V1, SUB2API_BASE_URL } from '../config/index'

/** Sub2API 标准响应：code === 0 为成功 */
export type Sub2ApiEnvelope<T> = {
  code: number
  message?: string
  data?: T
  reason?: string
}

type RequestOptions = {
  url: string
  method?: WechatMiniprogram.RequestOption['method']
  data?: WechatMiniprogram.IAnyObject | string
  accessToken?: string
  apiKey?: string
  /** 默认 SUB2API_API_V1；生图网关传 SUB2API_BASE_URL */
  baseUrl?: string
  rawResponse?: boolean
}

function parseEnvelope<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'code' in body) {
    const env = body as Sub2ApiEnvelope<T>
    if (env.code !== 0) {
      throw new Error(env.message || env.reason || `错误码 ${env.code}`)
    }
    return env.data as T
  }
  return body as T
}

export function requestJson<T>(opts: RequestOptions): Promise<T> {
  const base = opts.baseUrl ?? SUB2API_API_V1
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (opts.apiKey) {
    header.Authorization = `Bearer ${opts.apiKey}`
  } else if (opts.accessToken) {
    header.Authorization = `Bearer ${opts.accessToken}`
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}${opts.url}`,
      method: opts.method ?? 'GET',
      data: opts.data,
      header,
      success(res) {
        const status = res.statusCode
        const body = res.data
        if (status >= 200 && status < 300) {
          try {
            if (opts.rawResponse) {
              resolve(body as T)
              return
            }
            resolve(parseEnvelope<T>(body))
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)))
          }
        } else {
          try {
            parseEnvelope(body)
          } catch (e) {
            reject(e instanceof Error ? e : new Error(`HTTP ${status}`))
          }
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络错误'))
      },
    })
  })
}

export function getJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T)
        } else {
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络错误'))
      },
    })
  })
}

export { SUB2API_BASE_URL }
