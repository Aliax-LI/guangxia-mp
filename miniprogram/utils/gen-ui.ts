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

  | { kind: 'copy'; label: string; text: string }



type CopySite = { index: number; length: number; text: string; label: string }



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



function decodeCopyLiteral(raw: string): string {

  return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')

}



const copyArgRe = /GenUI\.copy\s*\(\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1\s*\)/i



/** 常见 GenUI 标签 → Markdown，避免原样展示 JSX。 */

function convertGenUiTags(text: string): string {

  return text

    .replace(/<title\b[^>]*>([\s\S]*?)<\/title>/gi, (_, inner: string) => {

      const t = inner.replace(/<[^>]+>/g, '').trim()

      return t ? `\n\n**${t}**\n\n` : ''

    })

    .replace(/<text\b[^>]*>([\s\S]*?)<\/text>/gi, (_, inner: string) => inner.replace(/<[^>]+>/g, '').trim())

    .replace(/\{@body[\s\S]*?\}/g, '')

    .replace(/<AsyncImage\b[^>]*\/>/g, '')

    .replace(/<divider\b[^>]*\/>/g, '')

    .replace(/<icon\b[^>]*\/>/gi, '')

    .replace(/<icon\b[^>]*>[\s\S]*?<\/icon>/gi, '')

    .replace(/<\/?(box|row|card)\b[^>]*>/gi, '')

}



function stripChrome(text: string): string {

  return dedent(convertGenUiTags(text))

}



/** 模型有时把 GenUI 标签包进 markdown 代码块，markdown 会整段当代码展示。 */

function unwrapGenUiCodeFences(text: string): string {

  return text.replace(/```(?:[\w-]+)?\n([\s\S]*?)```/g, (full, body: string) => {

    if (/<(?:icon|button|title|text)\b|GenUI\.copy/i.test(body)) return body.trim()

    return full

  })

}



function eachButtonBlock(raw: string, fn: (block: string, index: number) => void) {

  const re = /<button[\s\S]*?<\/button>/gi

  let match: RegExpExecArray | null

  while ((match = re.exec(raw))) fn(match[0], match.index)

}



function readCopyFromFragment(fragment: string): { label: string; text: string } | null {

  const copyMatch = copyArgRe.exec(fragment)

  if (!copyMatch) return null

  const after = fragment.slice(copyMatch.index! + copyMatch[0].length)

  const tailLabel = after

    .replace(/^\s*\}?>\s*/, '')

    .replace(/<\/button>\s*$/i, '')

    .replace(/<[^>]+>/g, '')

    .trim()

  const fromInner = fragment

    .replace(/^[\s\S]*?>/, '')

    .replace(/<\/button>\s*$/i, '')

    .replace(/<[^>]+>/g, '')

    .trim()

  const label = tailLabel || fromInner || '复制文案'

  return { label: /^复制/.test(label) ? label : '复制文案', text: decodeCopyLiteral(copyMatch[2]) }

}



function rangesOverlap(a: CopySite[], start: number, end: number): boolean {

  return a.some((s) => start < s.index + s.length && end > s.index)

}



/** 完整 button 块 + 流式截断后残留的 GenUI.copy(...)}> 复制 */

function findCopySites(raw: string): CopySite[] {

  const sites: CopySite[] = []



  eachButtonBlock(raw, (block, index) => {

    const copy = readCopyFromFragment(block)

    if (copy) sites.push({ index, length: block.length, text: copy.text, label: copy.label })

  })



  const orphanRe =

    /GenUI\.copy\s*\(\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1\s*\)\s*\}?>\s*(复制[^\n<]*)?/gi

  let match: RegExpExecArray | null

  while ((match = orphanRe.exec(raw))) {

    const index = match.index

    const length = match[0].length

    if (rangesOverlap(sites, index, index + length)) continue

    const label = (match[3] || '复制文案').trim() || '复制文案'

    sites.push({

      index,

      length,

      text: decodeCopyLiteral(match[2]),

      label: /^复制/.test(label) ? label : '复制文案',

    })

  }



  sites.sort((a, b) => a.index - b.index)

  return sites

}



function removeCopyArtifacts(text: string): string {

  return text

    .replace(/<button[\s\S]*?<\/button>/gi, '')

    .replace(/GenUI\.copy\s*\(\s*(["'])(?:\\.|(?!\1)[\s\S])*?\1\s*\)\s*\}?>\s*(复制[^\n<]*)?/gi, '')

    .replace(/<button[\s\S]*$/i, '')

    .replace(/<button\b[^>]*\/>/gi, '')

}



function polishMd(text: string): string {

  return stripChrome(removeCopyArtifacts(text))

}



function hasGenUiMarkup(raw: string): boolean {

  return /<(?:icon|button|title|text|box|row|card)\b|GenUI\.copy/i.test(raw)

}



/** 文案卡片等：title / icon + GenUI.copy 按钮（无 radio-group 选项卡）。 */

function parseActionGenUi(raw: string): ReplySegment[] | null {

  if (!hasGenUiMarkup(raw)) return null



  const sites = findCopySites(raw)

  if (!sites.length) {

    const md = polishMd(raw)

    return md ? [{ kind: 'md', text: md }] : null

  }



  const segments: ReplySegment[] = []

  let last = 0

  for (const site of sites) {

    const before = polishMd(raw.slice(last, site.index))

    if (before) segments.push({ kind: 'md', text: before })

    segments.push({ kind: 'copy', label: site.label, text: site.text })

    last = site.index + site.length

  }

  const tail = polishMd(raw.slice(last))

  if (tail) segments.push({ kind: 'md', text: tail })

  return segments.length ? segments : null

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



/** 上游（带内置生图 tool 的对话模型）常见失败原文 → 可操作的说明。 */
function softenUpstreamToolErrors(text: string): string {
  return text.replace(
    /The image generation tool encountered an error\.?\s*Please try again\.?/gi,
    '对话模型调用的上游「内置生图」失败了。请改用底部「画图」出图，或换一句描述后重试；仍失败需 Sub2API/渠道排查。',
  )
}

/** 模型有时输出自定义代码标签。转成 markdown 代码块，避免原标签和代码一起撑出屏幕。 */

export function normalizeReply(raw: string): string {

  const withBlocks = softenUpstreamToolErrors(raw)

    .replace(/<CodeBlock\b([^>]*)>([\s\S]*?)<\/CodeBlock>/gi, (_, attrs: string, body: string) => {

      const lang = /language="([^"]*)"/i.exec(attrs)?.[1] || ''

      return `\n\`\`\`${lang}\n${body.replace(/^\n+|\n+$/g, '')}\n\`\`\`\n`

    })

    .replace(/<\/?CodeBlock\b[^>]*>/gi, '')

  return unwrapGenUiCodeFences(withBlocks)

}



/** 解析失败时仍去掉 GenUI 标签，避免 Markdown 原样展示 JSX。 */

export function stripGenUiForMarkdown(normalizedReply: string): string {

  return polishMd(normalizedReply)

}



/** 模型有时会夹一段生成式界面。能认出选项卡就拆出来，其余标记剥掉，普通回复返回 null。 */

export function parseReply(raw: string): ReplySegment[] | null {

  if (!raw) return null

  const radioAt = /<radio-group\b/.test(raw) ? raw.search(/<radio-group\b/) : -1

  if (radioAt < 0 || !/<(box|row|radio-group|AsyncImage)\b|\{@body/.test(raw)) {

    return parseActionGenUi(raw)

  }

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

  const action = parseActionGenUi(raw)

  if (action) return action

  const text = stripChrome(raw)

  if (!text || text === raw.trim()) return null

  return [{ kind: 'md', text }]

}



export function choicePrompt(value: string, detail: string): string {

  const extra = detail.trim()

  return `我想让你：${value}。${extra ? `具体要求：${extra}` : '请直接开始。'}`

}


