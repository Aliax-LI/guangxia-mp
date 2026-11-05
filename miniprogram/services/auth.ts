import { requestJson } from './http'
import { IMAGE_KEY_GROUP_ID, IMAGE_KEY_GROUP_NAME } from '../config/index'
import {
  clearAuth,
  getAccessToken,
  clearApiKey,
  getApiKey,
  getApiKeyGroup,
  setAccessToken,
  setAccessTokenExpiry,
  setApiKey,
  setApiKeyGroup,
  setApiKeyId,
  setRefreshToken,
  setUserEmail,
} from '../utils/storage'

export type Sub2User = {
  id: number
  username: string
  email: string
  balance: number
  frozen_balance?: number
  status: string
}

type AuthResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  user: Sub2User
}

type ApiKeyGroup = {
  id?: number
  name?: string
  status?: string
  allow_image_generation?: boolean
}

type ApiKeyRow = {
  id: number
  key: string
  name: string
  status: string
  /** 顶层分组 id，数字（真实接口结构） */
  group_id?: number
  /** 嵌套的分组对象，含 name 与 allow_image_generation */
  group?: ApiKeyGroup | null
}

/** 这条 Key 是否属于目标生图分组：优先比对 group_id，回退嵌套对象的 name */
function inImageGroup(row: ApiKeyRow): boolean {
  if (row.group_id != null) return Number(row.group_id) === IMAGE_KEY_GROUP_ID
  const name = row.group?.name || ''
  return name === IMAGE_KEY_GROUP_NAME
}

/** 分组的展示名：嵌套对象优先，回退到配置名 */
function groupDisplayName(row: ApiKeyRow): string {
  return row.group?.name || IMAGE_KEY_GROUP_NAME
}

type KeyList = {
  items: ApiKeyRow[]
  total: number
}

function saveAuthSession(res: AuthResponse, email: string) {
  setAccessToken(res.access_token)
  setAccessTokenExpiry(res.expires_in, res.access_token)
  if (res.refresh_token) setRefreshToken(res.refresh_token)
  setUserEmail(email)
}

export async function login(email: string, password: string): Promise<void> {
  const data = await requestJson<AuthResponse>({
    url: '/auth/login',
    method: 'POST',
    data: { email, password },
  })
  if (!data.access_token) throw new Error('登录未返回 token')
  saveAuthSession(data, email)
  await ensureApiKey()
}

export async function sendRegisterVerifyCode(email: string): Promise<{ countdown?: number }> {
  return requestJson({
    url: '/auth/send-verify-code',
    method: 'POST',
    data: { email },
  })
}

export async function register(
  email: string,
  password: string,
  verifyCode: string
): Promise<void> {
  const data = await requestJson<AuthResponse>({
    url: '/auth/register',
    method: 'POST',
    data: { email, password, verify_code: verifyCode },
  })
  if (!data.access_token) throw new Error('注册未返回 token')
  saveAuthSession(data, email)
  await ensureApiKey()
}

export async function fetchUserSelf(): Promise<Sub2User> {
  const token = getAccessToken()
  if (!token) throw new Error('未登录')
  return requestJson<Sub2User>({
    url: '/auth/me',
    accessToken: token,
  })
}

function isFullApiKey(key: string): boolean {
  return key.length > 20 && !key.includes('***') && !key.includes('…')
}

/**
 * 取一个能出图的 API Key。
 *
 * 规则：
 * 1. 本地已存且分组正确 → 直接用；
 * 2. 本地存的是错分组的旧 Key → 丢弃，重新挑（老用户迁移）；
 * 3. 列表里有同分组且启用的 Key → 用它；
 * 4. 都没有 → 带 group 新建一个。
 *
 * 分组不对时 `gpt-image-2.5` 会在网关侧直接报 not supported，所以宁可在
 * 这里多一次请求，也不要把错 Key 带进生成流程。
 */
export async function ensureApiKey(): Promise<string> {
  const token = getAccessToken()
  if (!token) throw new Error('未登录')

  const cachedGroup = getApiKeyGroup()
  const existing = getApiKey()
  if (existing && isFullApiKey(existing) && cachedGroup === String(IMAGE_KEY_GROUP_ID)) {
    return existing
  }

  const list = await requestJson<KeyList>({
    url: '/keys?page=1&page_size=50',
    accessToken: token,
  })
  const items = list.items || []
  const active = items.find(
    (k) => k.status === 'active' && isFullApiKey(k.key) && inImageGroup(k),
  )
  if (active) {
    setApiKey(active.key)
    setApiKeyId(active.id)
    setApiKeyGroup(String(IMAGE_KEY_GROUP_ID))
    return active.key
  }

  const created = await requestJson<ApiKeyRow>({
    url: '/keys',
    method: 'POST',
    accessToken: token,
    // 后端接收的是数字 group_id；传名字符串 name 会被忽略，建出无分组 Key
    data: { name: `miniprogram-${Date.now().toString(36)}`, group_id: IMAGE_KEY_GROUP_ID },
  })
  if (!created.key || !isFullApiKey(created.key)) {
    throw new Error(
      `创建 API Key 失败。请到网页端创建「${groupDisplayName(created)}」分组的 Key 后粘贴到设置里`,
    )
  }
  setApiKey(created.key)
  setApiKeyId(created.id)
  setApiKeyGroup(String(created.group_id ?? IMAGE_KEY_GROUP_ID))
  return created.key
}

/**
 * 生成失败时统一翻译上游错误。
 *
 * 典型：切换分组前拿到的 Key 会返回
 * `Model "gpt-image-2.5" is not supported by any configured account in this group`。
 * 直接把英文抛给用户等于没提示，这里换成「要做什么」。
 */
export function humanizeGatewayError(raw: string): string {
  const text = String(raw || '')
  if (/is not supported by any configured account/i.test(text) || /in this group/i.test(text)) {
    return `当前 API Key 不在「${IMAGE_KEY_GROUP_NAME}」分组，出图渠道不可用。已为你重置 Key，请重试；仍失败请到网页端确认分组`
  }
  if (/insufficient|balance|quota|额度|余额/i.test(text)) {
    return '积分或额度不足，请到「我的 · 积分明细」确认后再试'
  }
  if (/rate limit|too many requests|429/i.test(text)) {
    return '请求过于频繁，稍等几秒再试'
  }
  return text
}

/** 出图失败且判定为分组问题时，丢掉本地 Key，下次 ensureApiKey 会重新挑选 */
export function invalidateApiKeyOnGroupError(raw: string): boolean {
  const text = String(raw || '')
  const isGroupIssue =
    /is not supported by any configured account/i.test(text) ||
    /in this group/i.test(text) ||
    /not assigned to any group/i.test(text)
  if (!isGroupIssue) return false
  clearApiKey()
  return true
}

export function logout() {
  clearAuth()
}

export function isLoggedIn(): boolean {
  return !!getAccessToken()
}

export function maskApiKey(key: string): string {
  if (!key) return '未设置'
  if (key.length <= 8) return '****'
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}

export function setManualApiKey(key: string) {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('Key 不能为空')
  setApiKey(trimmed)
  // 用户手动粘贴的 Key 由用户自行保证分组；标记为已知，避免下次启动被误判并覆盖
  setApiKeyGroup(String(IMAGE_KEY_GROUP_ID))
}
