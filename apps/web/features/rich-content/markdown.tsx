import React, { Fragment, type ReactNode } from 'react'

const allowedLink = (href: string): boolean => {
  if (/^\/(?!\/)/.test(href)) return true
  try {
    const parsed = new URL(href)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password
  } catch { return false }
}

const inline = (source: string): ReactNode[] => {
  const tokens = source.split(/(`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*)/g)
  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith('`') && token.endsWith('`')) return <code key={index}>{token.slice(1, -1)}</code>
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) return allowedLink(link[2]!) ? <a href={link[2]} key={index} rel="noreferrer">{link[1]}</a> : <Fragment key={index}>{token}</Fragment>
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={index}>{token.slice(2, -2)}</strong>
    if (token.startsWith('~~') && token.endsWith('~~')) return <s key={index}>{token.slice(2, -2)}</s>
    if (token.startsWith('*') && token.endsWith('*')) return <em key={index}>{token.slice(1, -1)}</em>
    return <Fragment key={index}>{token}</Fragment>
  })
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const nodes: ReactNode[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.startsWith('```')) {
      const code: string[] = []; index += 1
      while (index < lines.length && !lines[index]!.startsWith('```')) { code.push(lines[index]!); index += 1 }
      nodes.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>); index += 1; continue
    }
    const list = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/)
    if (list) {
      const ordered = /\d+\./.test(list[2]!); const items: ReactNode[] = []
      while (index < lines.length) { const current = lines[index]!.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/); if (!current || /\d+\./.test(current[2]!) !== ordered) break; items.push(<li key={index}>{inline(current[3]!)}</li>); index += 1 }
      nodes.push(ordered ? <ol key={`ol-${index}`}>{items}</ol> : <ul key={`ul-${index}`}>{items}</ul>); continue
    }
    if (line.startsWith('### ')) nodes.push(<h3 key={index}>{inline(line.slice(4))}</h3>)
    else if (line.startsWith('## ')) nodes.push(<h2 key={index}>{inline(line.slice(3))}</h2>)
    else if (line.startsWith('> ')) nodes.push(<blockquote key={index}>{inline(line.slice(2))}</blockquote>)
    else if (line) nodes.push(<p key={index}>{inline(line)}</p>)
    index += 1
  }
  return <div className="rich-markdown" data-testid="rich-markdown">{nodes}</div>
}

export { allowedLink }
