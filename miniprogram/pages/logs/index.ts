import { fetchSelfLogs, type UsageLogItem } from '../../services/logs'
import { formatPointsFromUsd } from '../../utils/quota'

type Row = {
  id: number
  title: string
  meta: string
  costDisplay: string
}

Page({
  data: {
    items: [] as Row[],
    loading: false,
    page: 1,
    hasMore: true,
  },

  onLoad() {
    this.loadMore()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  onGoEdit() {
    wx.switchTab({ url: '/pages/edit/index' })
  },

  async loadMore() {
    this.setData({ loading: true })
    try {
      const page = this.data.page
      const res = await fetchSelfLogs(page, 20)
      const mapped = res.items.map(mapLogRow)
      this.setData({
        loading: false,
        page: page + 1,
        hasMore: mapped.length >= 20 && page * 20 < res.total,
        items: this.data.items.concat(mapped),
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({
        title: e instanceof Error ? e.message : '加载失败',
        icon: 'none',
      })
    }
  },
})

function mapLogRow(it: UsageLogItem): Row {
  const count = it.image_count > 0 ? it.image_count : 1
  return {
    id: it.id,
    title: friendlyTitle(it),
    meta: `${formatWhen(it.created_at)} · ${count} 张图片`,
    costDisplay: formatPointsFromUsd(it.actual_cost ?? it.total_cost ?? 0),
  }
}

function friendlyTitle(it: UsageLogItem): string {
  const rt = String(it.request_type || '').toLowerCase()
  if (rt.includes('template') || rt.includes('灵感')) return '灵感模版'
  if (rt.includes('edit') || rt.includes('修图')) return '智能修图'
  return 'AI 修图'
}

function formatWhen(ts: string | number): string {
  if (!ts) return ''
  const ms = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts)
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return String(ts)

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(d, now)) return `今天 ${clock}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d, yesterday)) return `昨天 ${clock}`

  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${clock}`
  }
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${clock}`
}
