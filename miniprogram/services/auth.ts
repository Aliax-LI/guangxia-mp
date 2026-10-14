import { requestJson } from './http'
import {
  clearAuth,
  getAccessToken,
  getApiKey,
  setAccessToken,
  setApiKey,
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

type ApiKeyRow = {
  id: number
  key: string
  name: string
  status: string
}

type KeyList = {
  items: ApiKeyRow[]
  total: number
}

function saveAuthSession(res: AuthResponse, email: string) {
  setAccessToken(res.access_token)
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

export async function ensureApiKey(): Promise<string> {
  const existing = getApiKey()
  if (existing && isFullApiKey(existing)) return existing

  const token = getAccessToken()
  if (!token) throw new Error('未登录')

  const list = await requestJson<KeyList>({
    url: '/keys?page=1&page_size=20',
    accessToken: token,
  })
  const active = (list.items || []).find((k) => k.status === 'active' && isFullApiKey(k.key))
  if (active) {
    setApiKey(active.key)
    setApiKeyId(active.id)
    return active.key
  }

  const created = await requestJson<ApiKeyRow>({
    url: '/keys',
    method: 'POST',
    accessToken: token,
    data: { name: 'miniprogram' },
  })
  if (!created.key || !isFullApiKey(created.key)) {
    throw new Error('创建 API Key 失败，请到网页端复制 Key 后粘贴')
  }
  setApiKey(created.key)
  setApiKeyId(created.id)
  return created.key
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
}
