export type ChoiceCard = {
  hint: string
  options: { value: string; label: string }[]
  placeholder: string
  button: string
  initial: string
}

export type ReplySegment =
  | { kind: 'md'; text: string }
  | { kind: 'choices'; card: ChoiceCard }

function dedent(text: string): string {
  const lines = text.replace(/[ \t]+\n/g, '\n').split('\n')
  const widths = lines.filter((line) => line.trim()).map((line) => /^[ ]*/.exec(line)![0].length)
  const cut = widths.length ? Math.min(...widths) : 0
  return lines
    .map((line) => line.slice(cut))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripChrome(text: string): string {
  return dedent(
    text
      .replace(/\{@body[\s\S]*?\}/g, '')
      .replace(/<AsyncImage\b[^>]*\/>/g, '')
      .replace(/<divider\b[^>]*\/>/g, '')
      .replace(/<\/?(box|row|text)\b[^>]*>/g, ''),
  )
}

function buttonLabel(block: string): string {
  const inner = /<button\b([\s\S]*?)<\/button>/.exec(block)
  if (!inner) return '开始'
  const raw = inner[1]
  const cut = raw.lastIndexOf('>')
  return (cut >= 0 ? raw.slice(cut + 1) : raw).replace(/<[^>]+>/g, '').trim() || '开始'
}

function readCard(raw: string, block: string): ChoiceCard | null {
  const options: { value: string; label: string }[] = []
  const radio = /<radio\b[^>]*\bvalue="([^"]*)"[^>]*>([\s\S]*?)<\/radio>/g
  let match: RegExpExecArray | null
  while ((match = radio.exec(block))) {
    const label = match[2].replace(/<[^>]+>/g, '').trim()
    if (match[1] && label) options.push({ value: match[1], label })
  }
  if (!options.length) return null
  const hint = (/<text\b[^>]*>([\s\S]*?)<\/text>/.exec(block)?.[1] || '').replace(/<[^>]+>/g, '').trim()
  const placeholder = /placeholder="([^"]*)"/.exec(block)?.[1] || ''
  const stated: string[] = []
  const stateRe = /useState\("([^"]+)"\)/g
  let statedMatch: RegExpExecArray | null
  while ((statedMatch = stateRe.exec(raw))) stated.push(statedMatch[1])
  const initial = stated.find((value) => options.some((item) => item.value === value)) || options[0].value
  return { hint, options, placeholder, button: buttonLabel(block), initial }
}

/** 模型有时输出自定义代码标签。转成 markdown 代码块，避免原标签和代码一起撑出屏幕。 */
export function normalizeReply(raw: string): string {
  return raw
    .replace(/<CodeBlock\b([^>]*)>([\s\S]*?)<\/CodeBlock>/gi, (_, attrs: string, body: string) => {
      const lang = /language="([^"]*)"/i.exec(attrs)?.[1] || ''
      return `\n\`\`\`${lang}\n${body.replace(/^\n+|\n+$/g, '')}\n\`\`\`\n`
    })
    .replace(/<\/?CodeBlock\b[^>]*>/gi, '')
}

/** 模型有时会夹一段生成式界面。能认出选项卡就拆出来，其余标记剥掉，普通回复返回 null。 */
export function parseReply(raw: string): ReplySegment[] | null {
  if (!raw || !/<(box|row|radio-group|AsyncImage)\b|\{@body/.test(raw)) return null
  const radioAt = raw.search(/<radio-group\b/)
  if (radioAt >= 0) {
    const head = raw.slice(0, radioAt)
    const boxAt = head.lastIndexOf('<box')
    let start = boxAt >= 0 ? boxAt : radioAt
    const lead = raw.slice(0, start)
    const bodyRe = /\{@body[\s\S]*?\}/g
    const bodies: { index: number; length: number }[] = []
    let bodyMatch: RegExpExecArray | null
    while ((bodyMatch = bodyRe.exec(lead))) bodies.push({ index: bodyMatch.index, length: bodyMatch[0].length })
    if (bodies.length) {
      let index = bodies.length - 1
      const tailGap = lead.slice(bodies[index].index + bodies[index].length)
      if (/^\s*$/.test(tailGap)) {
        while (index > 0) {
          const between = lead.slice(bodies[index - 1].index + bodies[index - 1].length, bodies[index].index)
          if (!/^\s*$/.test(between)) break
          index -= 1
        }
        start = bodies[index].index
      }
    }
    const tail = raw.slice(radioAt)
    const endRel = tail.search(/<\/button>/)
    if (endRel >= 0) {
      let end = radioAt + endRel + '</button>'.length
      const close = /^\s*<\/box>/.exec(raw.slice(end))
      if (close) end += close[0].length
      const card = readCard(raw.slice(Math.max(0, start - 500), end), raw.slice(start, end))
      if (card) {
        const segments: ReplySegment[] = []
        const before = stripChrome(raw.slice(0, start))
        const after = stripChrome(raw.slice(end))
        if (before) segments.push({ kind: 'md', text: before })
        segments.push({ kind: 'choices', card })
        if (after) segments.push({ kind: 'md', text: after })
        return segments
      }
    }
  }
  const text = stripChrome(raw)
  if (!text || text === raw.trim()) return null
  return [{ kind: 'md', text }]
}

export function choicePrompt(value: string, detail: string): string {
  const extra = detail.trim()
  return `我想让你：${value}。${extra ? `具体要求：${extra}` : '请直接开始。'}`
}
