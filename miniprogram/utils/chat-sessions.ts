import { syncInputImages, type ChatTurn, loadTurns as loadLegacyTurns } from './compose'

const SESSIONS_KEY = 'chat_sessions_v2'
const ACTIVE_KEY = 'chat_active_session_v2'
const LEGACY_MIGRATED_KEY = 'chat_sessions_legacy_migrated'

export type SessionKind = 'chat' | 'image'

export type ChatSession = {
  id: string
  kind: SessionKind
  title: string
  updatedAt: number
  turns: ChatTurn[]
}

const MAX_SESSIONS = 50
const MAX_TURNS = 40

function trimTitle(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return t.length > 24 ? `${t.slice(0, 24)}…` : t
}

function defaultTitle(kind: SessionKind): string {
  return kind === 'image' ? '新画图' : '新对话'
}

function normalizeTurn(item: ChatTurn): ChatTurn {
  const kind = item.kind === 'text' ? 'text' : 'image'
  return {
    ...item,
    kind,
    model: item.model || (kind === 'text' ? 'auto' : 'gpt-image-2.5'),
    reply: item.reply || '',
    images: item.images || [],
    error: item.error || '',
    ...syncInputImages(
      Array.isArray(item.imagePaths) && item.imagePaths.length
        ? item.imagePaths
        : item.imagePath
          ? [item.imagePath]
          : [],
    ),
    size: item.size || 'auto',
    ratioLabel: item.ratioLabel || '自动',
    count: item.count || 1,
    quality: item.quality || 'auto',
    templateId: item.templateId || '',
    templateTitle: item.templateTitle || '',
  }
}

function normalizeSession(raw: unknown): ChatSession | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as ChatSession
  if (typeof item.id !== 'string' || (item.kind !== 'chat' && item.kind !== 'image')) return null
  const turns = Array.isArray(item.turns)
    ? item.turns
        .filter((t) => t && typeof t.id === 'string' && typeof t.prompt === 'string')
        .map((t) => normalizeTurn({ ...t, kind: item.kind === 'chat' ? 'text' : 'image' }))
        .slice(-MAX_TURNS)
    : []
  return {
    id: item.id,
    kind: item.kind,
    title: item.title || defaultTitle(item.kind),
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    turns,
  }
}

function migrateLegacySessions(): ChatSession[] {
  if (wx.getStorageSync(LEGACY_MIGRATED_KEY)) return []
  const legacy = loadLegacyTurns()
  wx.setStorageSync(LEGACY_MIGRATED_KEY, 1)
  if (!legacy.length) return []

  const now = Date.now()
  const chatTurns = legacy.filter((t) => t.kind === 'text').map(normalizeTurn)
  const imageTurns = legacy.filter((t) => t.kind !== 'text').map(normalizeTurn)
  const sessions: ChatSession[] = []

  if (chatTurns.length) {
    sessions.push({
      id: `s${now}_chat`,
      kind: 'chat',
      title: trimTitle(chatTurns[0].prompt) || defaultTitle('chat'),
      updatedAt: now,
      turns: chatTurns,
    })
  }
  if (imageTurns.length) {
    sessions.push({
      id: `s${now}_img`,
      kind: 'image',
      title: trimTitle(imageTurns[0].prompt) || defaultTitle('image'),
      updatedAt: now + 1,
      turns: imageTurns,
    })
  }
  return sessions
}

export function loadAllSessions(): ChatSession[] {
  let raw = wx.getStorageSync(SESSIONS_KEY)
  let list = Array.isArray(raw) ? raw.map(normalizeSession).filter(Boolean) as ChatSession[] : []
  if (!list.length) {
    const migrated = migrateLegacySessions()
    if (migrated.length) {
      list = migrated
      saveAllSessions(list)
    }
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveAllSessions(sessions: ChatSession[]) {
  const trimmed = sessions
    .slice(0, MAX_SESSIONS)
    .map((s) => ({ ...s, turns: s.turns.slice(-MAX_TURNS) }))
  wx.setStorageSync(SESSIONS_KEY, trimmed)
}

export function getActiveSessionId(): string {
  return wx.getStorageSync(ACTIVE_KEY) || ''
}

export function setActiveSessionId(id: string) {
  wx.setStorageSync(ACTIVE_KEY, id)
}

export function getSession(id: string): ChatSession | null {
  return loadAllSessions().find((s) => s.id === id) || null
}

export function findLatestSession(kind: SessionKind): ChatSession | null {
  return loadAllSessions().find((s) => s.kind === kind) || null
}

export function createSession(kind: SessionKind): ChatSession {
  const session: ChatSession = {
    id: `s${Date.now()}_${kind}`,
    kind,
    title: defaultTitle(kind),
    updatedAt: Date.now(),
    turns: [],
  }
  const sessions = [session, ...loadAllSessions()]
  saveAllSessions(sessions)
  setActiveSessionId(session.id)
  return session
}

export function ensureBootstrapped(): ChatSession {
  let sessions = loadAllSessions()
  let activeId = getActiveSessionId()
  let active = activeId ? sessions.find((s) => s.id === activeId) : null
  if (!active) {
    active = sessions[0] || createSession('chat')
    setActiveSessionId(active.id)
  }
  return active
}

/** 删除一条会话；若删的是当前活跃会话，返回应切换到的会话（必要时新建空会话）。 */
export function deleteSession(id: string): ChatSession | null {
  const all = loadAllSessions()
  const target = all.find((s) => s.id === id)
  if (!target) return null

  const nextList = all.filter((s) => s.id !== id)
  saveAllSessions(nextList)

  if (getActiveSessionId() !== id) return null

  if (nextList.length) {
    const next = nextList.find((s) => s.kind === target.kind) || nextList[0]
    setActiveSessionId(next.id)
    return next
  }
  return createSession(target.kind)
}

/** 保留会话条目，清空其全部消息并重置标题。 */
export function clearSessionTurns(id: string): ChatSession | null {
  const sessions = loadAllSessions()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx < 0) return null
  const session = sessions[idx]
  const cleared: ChatSession = {
    ...session,
    title: defaultTitle(session.kind),
    turns: [],
    updatedAt: Date.now(),
  }
  sessions[idx] = cleared
  saveAllSessions(sessions)
  return cleared
}

export function updateSessionTurns(id: string, turns: ChatTurn[], opts?: { titleFromPrompt?: string }) {
  const sessions = loadAllSessions()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx < 0) return
  const session = sessions[idx]
  const nextTurns = turns.slice(-MAX_TURNS)
  let title = session.title
  if (opts?.titleFromPrompt && (title === defaultTitle(session.kind) || !title)) {
    const derived = trimTitle(opts.titleFromPrompt)
    if (derived) title = derived
  }
  sessions[idx] = {
    ...session,
    title,
    turns: nextTurns,
    updatedAt: Date.now(),
  }
  saveAllSessions(sessions)
}

export function activateOrCreate(kind: SessionKind): ChatSession {
  const existing = findLatestSession(kind)
  if (existing) {
    setActiveSessionId(existing.id)
    return existing
  }
  return createSession(kind)
}

export function sessionKindToTool(kind: SessionKind): 'chat' | 'image' {
  return kind === 'image' ? 'image' : 'chat'
}

export function formatSessionTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) {
    const h = d.getHours()
    const m = d.getMinutes()
    return `${h}:${m < 10 ? '0' : ''}${m}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}
