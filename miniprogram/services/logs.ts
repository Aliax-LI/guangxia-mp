import { requestJson } from './http'
import { getAccessToken } from '../utils/storage'

export type UsageLogItem = {
  id: number
  model: string
  actual_cost: number
  total_cost: number
  image_count: number
  created_at: string
  request_type?: string
  duration_ms?: number | null
}

type UsagePage = {
  items: UsageLogItem[]
  total: number
  page: number
  page_size: number
}

export type UsageStats = {
  total_requests: number
  total_cost: number
  total_actual_cost: number
  average_duration_ms: number
}

export type UsageSummary = {
  /** 累计调用笔数 */
  usageCount: number
  /** 累计实际消费（USD，展示时 ×100 为积分） */
  totalCost: number
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  const token = getAccessToken()
  if (!token) throw new Error('未登录')

  const stats = await requestJson<UsageStats>({
    url: '/usage/stats?start_date=2000-01-01&end_date=2030-12-31&timezone=Asia%2FShanghai',
    accessToken: token,
  })
  return {
    usageCount: Number(stats.total_requests) || 0,
    totalCost: Number(stats.total_actual_cost) || 0,
  }
}

export async function fetchSelfLogs(page: number, pageSize = 20): Promise<UsagePage> {
  const token = getAccessToken()
  if (!token) throw new Error('未登录')
  return requestJson<UsagePage>({
    url: `/usage?page=${page}&page_size=${pageSize}`,
    accessToken: token,
  })
}
