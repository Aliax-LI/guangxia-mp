/** Sub2API 用户 balance / cost 字段为 USD 数值 */
export const USD_TO_POINTS = 100

export function usdToPoints(usd: number): number {
  if (!Number.isFinite(usd)) return 0
  return usd * USD_TO_POINTS
}

/** 将 USD 转为用户可见积分文案（不含单位） */
export function formatPointsFromUsd(usd: number): string {
  const points = usdToPoints(usd)
  if (!Number.isFinite(points) || points <= 0) return '0'
  const rounded = Math.round(points * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    return String(Math.round(rounded))
  }
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
