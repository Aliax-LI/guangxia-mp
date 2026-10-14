import { requestJson } from './http'
import { getAccessToken } from '../utils/storage'

export type RedeemResult = {
  message: string
  type: string
  value: number
  new_balance?: number
  new_concurrency?: number
}

/** Sub2API 用户卡密兑换 POST /api/v1/redeem */
export async function redeemCardCode(code: string): Promise<RedeemResult> {
  const token = getAccessToken()
  if (!token) throw new Error('未登录')
  const trimmed = code.trim()
  if (!trimmed) throw new Error('请输入卡密')
  return requestJson<RedeemResult>({
    url: '/redeem',
    method: 'POST',
    accessToken: token,
    data: { code: trimmed },
  })
}
