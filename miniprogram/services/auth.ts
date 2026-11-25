import { requestJson } from './http'
import { APP_API_KEY_NAME, IMAGE_KEY_GROUP_ID, IMAGE_KEY_GROUP_NAME } from '../config/index'
import {
  clearAuth,
  getAccessToken,
  clearApiKey,
  getApiKey,
  getApiKeyGroup,
  getApiKeyId,
  getApiKeyName,
  getPreferredGroupId,
  getPreferredGroupName,
  setAccessToken,
  setAccessTokenExpiry,
  setApiKey,
  setApiKeyGroup,
  setApiKeyId,
  setApiKeyName,
  setPreferredGroup,
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

export type Sub2Group = {
  id: number
  name: string
  platform?: string
  rate_multiplier?: number
  status?: string
  allow_image_generation?: boolean
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

function targetGroupId(override?: number): number {
  return override || getPreferredGroupId() || IMAGE_KEY_GROUP_ID
}

/** 分组的展示名：嵌套对象优先，回退到配置名 */
function groupDisplayName(row: ApiKeyRow): string {
  return row.group?.name || getPreferredGroupName() || IMAGE_KEY_GROUP_NAME
}

function syncKeyCache(row: ApiKeyRow) {
  const gid = Number(row.group_id ?? row.group?.id ?? targetGroupId())
  setApiKey(row.key)
  setApiKeyId(row.id)
  setApiKeyName(row.name || APP_API_KEY_NAME)
  setApiKeyGroup(String(gid))
  setPreferredGroup(gid, row.group?.name || (gid === IMAGE_KEY_GROUP_ID ? IMAGE_KEY_GROUP_NAME : undefined))
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
 * 确保「光匣」专用 API Key 就绪并返回。
 *
 * 规则：
 * 1. 本地已缓存且名称为「光匣」→ 直接使用；
 * 2. 查询 `/keys` 列表寻找名为「光匣」的激活 Key → 命中则同步其真实服务端分组到本地；
 * 3. 若账号下还没有「光匣」Key → 按当前目标分组（默认限时特价）初始化创建。
 */
export async function ensureApiKey(forceRefresh = false): Promise<string> {
  const token = getAccessToken()
  if (!token) throw new Error('未登录')

  const existing = getApiKey()
  const existingId = getApiKeyId()
  const existingName = getApiKeyName()
  if (!forceRefresh && existing && isFullApiKey(existing) && existingId > 0 && existingName === APP_API_KEY_NAME) {
    return existing
  }

  const list = await requestJson<KeyList>({
    url: '/keys?page=1&page_size=50',
    accessToken: token,
  })
  const items = list.items || []
  const dedicated = items.find(
    (k) => k.name === APP_API_KEY_NAME && k.status === 'active' && isFullApiKey(k.key),
  )
  if (dedicated) {
    syncKeyCache(dedicated)
    return dedicated.key
  }

  const groupId = targetGroupId()
  const created = await requestJson<ApiKeyRow>({
    url: '/keys',
    method: 'POST',
    accessToken: token,
    // 后端接收的是数字 group_id；传名字符串 name 会被忽略，建出无分组 Key
    data: { name: APP_API_KEY_NAME, group_id: groupId },
  })
  if (!created.key || !isFullApiKey(created.key)) {
    throw new Error(
      `创建「${APP_API_KEY_NAME}」API Key 失败。请到网页端创建名为「${APP_API_KEY_NAME}」的 Key（${groupDisplayName(created)}分组）后重试`,
    )
  }
  syncKeyCache(created)
  return created.key
}

export async function fetchAvailableGroups(): Promise<Sub2Group[]> {
  const token = getAccessToken()
  if (!token) throw new Error('未登录')
  const list = await requestJson<Sub2Group[]>({
    url: '/groups/available',
    accessToken: token,
  })
  return (Array.isArray(list) ? list : []).filter((g) => g && g.id && (!g.status || g.status === 'active'))
}

export function getBoundGroupSnapshot(): { groupId: number; groupName: string; keyName: string } {
  const groupId = targetGroupId()
  const cachedName = getPreferredGroupName()
  const groupName = cachedName || (groupId === IMAGE_KEY_GROUP_ID ? IMAGE_KEY_GROUP_NAME : `分组 #${groupId}`)
  return { groupId, groupName, keyName: getApiKeyName() || APP_API_KEY_NAME }
}

/** 从服务端拉取/初始化「光匣」Key，并返回其真实的当前绑定分组 */
export async function refreshBoundGroup(): Promise<{ groupId: number; groupName: string; keyName: string }> {
  await ensureApiKey(true)
  return getBoundGroupSnapshot()
}

/** 切换「光匣」Key 绑定的 Sub2API 分组（直接更新该 Key 的 group_id，不新建多余 Key） */
export async function switchBoundGroup(groupId: number, groupName?: string): Promise<string> {
  const token = getAccessToken()
  if (!token) throw new Error('未登录')

  await ensureApiKey()
  const keyId = getApiKeyId()
  if (!keyId) throw new Error(`未找到「${APP_API_KEY_NAME}」API Key`)

  const updated = await requestJson<ApiKeyRow>({
    url: `/keys/${keyId}`,
    method: 'PUT',
    accessToken: token,
    data: { name: APP_API_KEY_NAME, group_id: groupId },
  })
  if (!updated?.key) {
    throw new Error('更新绑定分组失败')
  }
  syncKeyCache({
    ...updated,
    group_id: updated.group_id ?? groupId,
    group: updated.group || (groupName ? { id: groupId, name: groupName } : undefined),
  })
  return updated.key
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
    return `当前「${APP_API_KEY_NAME}」Key 所绑定的分组不支持该生图模型，请到「我的 → 编辑资料 → Sub2API 分组」切换支持生图的分组（如「${IMAGE_KEY_GROUP_NAME}」）后重试`
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
