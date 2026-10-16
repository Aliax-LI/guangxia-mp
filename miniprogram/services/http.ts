import { SUB2API_API_V1, SUB2API_BASE_URL } from '../config/index'
import {
  clearAuth,
  getAccessToken,
  getAccessTokenExpiresAt,
  getRefreshToken,
  setAccessToken,
  setAccessTokenExpiry,
  setRefreshToken,
} from '../utils/storage'

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

/** 到期前 60 秒就刷新，避免请求打到已过期的 access token。 */
const ACCESS_TOKEN_SKEW_MS = 60_000

type StatusError = Error & { status: number }

type RefreshPayload = {
  access_token: string
  refresh_token: string
  expires_in: number
}

let refreshing: Promise<string> | null = null

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

function statusError(status: number, message: string): StatusError {
  const err = new Error(message) as StatusError
  err.status = status
  return err
}

function errorStatus(err: unknown): number {
  if (!err || typeof err !== 'object' || !('status' in err)) return 0
  const status = Number((err as { status: unknown }).status)
  return Number.isFinite(status) ? status : 0
}

/** 网络抖动、限流、服务端故障时保留本地登录态。 */
function keepsSession(status: number): boolean {
  return status === 0 || status === 429 || status >= 500
}

function isSessionEndpoint(url: string): boolean {
  return (
    url.startsWith('/auth/login') ||
    url.startsWith('/auth/register') ||
    url.startsWith('/auth/refresh') ||
    url.startsWith('/auth/send-verify-code')
  )
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const env = body as Sub2ApiEnvelope<unknown>
    if (env.message || env.reason) return env.message || env.reason || fallback
  }
  return fallback
}

function postRefresh(refreshToken: string): Promise<RefreshPayload> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUB2API_API_V1}/auth/refresh`,
      method: 'POST',
      timeout: 30000,
      data: { refresh_token: refreshToken },
      header: { 'Content-Type': 'application/json' },
      success(res) {
        const status = res.statusCode || 0
        if (status < 200 || status >= 300) {
          reject(statusError(status, messageFromBody(res.data, `HTTP ${status}`)))
          return
        }
        try {
          const data = parseEnvelope<RefreshPayload>(res.data)
          if (!data?.access_token || !data.refresh_token) {
            reject(statusError(500, '刷新登录态失败'))
            return
          }
          resolve(data)
        } catch (e) {
          reject(e instanceof Error ? e : new Error('刷新登录态失败'))
        }
      },
      fail(err) {
        reject(statusError(0, err.errMsg || '网络错误'))
      },
    })
  })
}

async function rotateAccessToken(failedAccessToken?: string): Promise<string> {
  const refreshToken = getRefreshToken()
  const accessToken = getAccessToken()
  if (!refreshToken) throw statusError(401, '登录已过期，请重新登录')

  if (failedAccessToken && accessToken && accessToken !== failedAccessToken) {
    const exp = getAccessTokenExpiresAt(accessToken)
    if (!exp || exp > Date.now()) return accessToken
  }

  try {
    const data = await postRefresh(refreshToken)
    if (getRefreshToken() !== refreshToken) {
      const latest = getAccessToken()
      if (latest && latest !== failedAccessToken) return latest
      throw statusError(401, '登录状态已变化，请重新登录')
    }
    setAccessToken(data.access_token)
    setAccessTokenExpiry(data.expires_in, data.access_token)
    setRefreshToken(data.refresh_token)
    return data.access_token
  } catch (err) {
    if (getRefreshToken() !== refreshToken) {
      const latest = getAccessToken()
      if (latest && latest !== failedAccessToken) return latest
      throw statusError(401, '登录状态已变化，请重新登录')
    }
    if (keepsSession(errorStatus(err))) {
      throw err instanceof Error ? err : new Error('刷新登录态失败')
    }
    clearAuth()
    throw statusError(401, '登录已过期，请重新登录')
  }
}

function refreshAccessToken(failedAccessToken?: string): Promise<string> {
  if (refreshing) return refreshing
  let pending: Promise<string>
  pending = rotateAccessToken(failedAccessToken).then(
    (token) => {
      if (refreshing === pending) refreshing = null
      return token
    },
    (err: unknown) => {
      if (refreshing === pending) refreshing = null
      throw err
    }
  )
  refreshing = pending
  return pending
}

async function ensureAccessToken(passed: string): Promise<string> {
  if (!getRefreshToken()) return passed

  const current = getAccessToken()
  if (passed !== current && current) {
    const currentExp = getAccessTokenExpiresAt(current)
    if (!currentExp || currentExp - ACCESS_TOKEN_SKEW_MS > Date.now()) return current
  }

  const token = current || passed
  const exp = getAccessTokenExpiresAt(token)
  if (!exp || Date.now() < exp - ACCESS_TOKEN_SKEW_MS) return token
  return refreshAccessToken(token)
}

function dispatch<T>(opts: RequestOptions): Promise<T> {
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
        const status = res.statusCode || 0
        const body = res.data
        if (status >= 200 && status < 300) {
          try {
            if (opts.rawResponse) resolve(body as T)
            else resolve(parseEnvelope<T>(body))
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)))
          }
          return
        }
        reject(statusError(status, messageFromBody(body, `HTTP ${status}`)))
      },
      fail(err) {
        reject(statusError(0, err.errMsg || '网络错误'))
      },
    })
  })
}

async function runRequest<T>(opts: RequestOptions, retried: boolean): Promise<T> {
  const sessionRequest = !!opts.accessToken && !opts.apiKey && !isSessionEndpoint(opts.url)
  let accessToken = opts.accessToken
  if (sessionRequest && !retried && accessToken) {
    try {
      accessToken = await ensureAccessToken(accessToken)
    } catch (err) {
      if (!keepsSession(errorStatus(err))) throw err
    }
  }

  try {
    return await dispatch<T>({ ...opts, accessToken })
  } catch (err) {
    if (sessionRequest && !retried && errorStatus(err) === 401 && getRefreshToken()) {
      const next = await refreshAccessToken(accessToken)
      return runRequest({ ...opts, accessToken: next }, true)
    }
    if (sessionRequest && !retried && errorStatus(err) === 401 && !getRefreshToken()) {
      clearAuth()
      throw statusError(401, '登录已过期，请重新登录')
    }
    throw err
  }
}

export function requestJson<T>(opts: RequestOptions): Promise<T> {
  return runRequest(opts, false)
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
