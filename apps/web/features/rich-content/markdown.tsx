'use client'

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './markdown.module.css'

export const COMPACT_MARKDOWN_LINE_LIMIT = 14
export const COMPACT_MARKDOWN_CHARACTER_LIMIT = 1600

export type MarkdownDensity = 'compact' | 'document'

export type MarkdownCopy = Readonly<{
  codeBlock: string
  copied: string
  copyCode: string
  copyFailed: string
  hideOverflow: string
  plainText: string
  showAll: string
  table: string
}>

const defaultCopy: MarkdownCopy = {
  codeBlock: 'Code block',
  copied: 'Copied',
  copyCode: 'Copy code',
  copyFailed: 'Copy failed',
  hideOverflow: 'Show less',
  plainText: 'Plain text',
  showAll: 'Show all',
  table: 'Markdown table',
}

/** Only navigation-safe, credential-free URLs enter rendered attributes. */
export function allowedLink(value: string): boolean {
  if (!value || value !== value.trim() || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return false
  if (/^\/(?!\/)/.test(value)) return true
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && !parsed.username
      && !parsed.password
  } catch {
    return false
  }
}

export function safeMarkdownUrl(value: string): string {
  return allowedLink(value) ? value : ''
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children)
  return ''
}

function codeLanguage(children: ReactNode): string | null {
  const child = Children.toArray(children).find(isValidElement<{ className?: string }>)
  if (!child) return null
  return child.props.className?.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? null
}

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard write failed')
}

function CodeBlock({ children, copy }: { children: ReactNode; copy: MarkdownCopy }) {
  const language = codeLanguage(children)
  const value = nodeText(children).replace(/\n$/, '')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (copyState === 'idle') return
    const timeout = window.setTimeout(() => setCopyState('idle'), 2000)
    return () => window.clearTimeout(timeout)
  }, [copyState])

  const label = language ?? copy.plainText
  return <div className={styles.codeFrame}>
    <div className={styles.codeHeader}>
      <span>{label}</span>
      <button
        aria-label={`${copy.copyCode}: ${label}`}
        className={styles.codeCopy}
        onClick={() => { void writeClipboard(value).then(() => setCopyState('copied'), () => setCopyState('failed')) }}
        type="button"
      >{copyState === 'copied' ? copy.copied : copy.copyCode}</button>
      <span aria-live="polite" className={styles.visuallyHidden} role="status">
        {copyState === 'copied' ? copy.copied : copyState === 'failed' ? copy.copyFailed : ''}
      </span>
    </div>
    <pre aria-label={`${copy.codeBlock}: ${label}`} className={styles.codePre}>{children}</pre>
  </div>
}

function markdownComponents(copy: MarkdownCopy): Components {
  return {
    a({ children, href, node: _node, ...props }) {
      if (!href || !allowedLink(href)) return <span>{children}</span>
      return <a {...props} href={href} rel="noreferrer">{children}</a>
    },
    code({ children, className, node: _node, ...props }) {
      return <code {...props} className={className}>{children}</code>
    },
    img({ alt, node: _node, src, title }) {
      if (typeof src !== 'string' || !allowedLink(src)) return alt ? <span className={styles.imageFallback}>{alt}</span> : null
      return <img alt={alt ?? ''} decoding="async" loading="lazy" src={src} title={title} />
    },
    pre({ children }) {
      return <CodeBlock copy={copy}>{children}</CodeBlock>
    },
    table({ children, node: _node, ...props }) {
      return <div aria-label={copy.table} className={styles.tableFrame} role="region" tabIndex={0}>
        <table {...props}>{children}</table>
      </div>
    },
  }
}

export type MarkdownProps = Readonly<{
  copy?: Partial<MarkdownCopy>
  density?: MarkdownDensity
  source: string
}>

export function RichContent({ copy, density = 'document', source }: MarkdownProps) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const text = useMemo(() => ({ ...defaultCopy, ...copy }), [copy])
  const components = useMemo(() => markdownComponents(text), [text])
  const normalized = source.replace(/\r\n?/g, '\n')
  const shouldCollapse = density === 'compact'
    && (normalized.split('\n').length > COMPACT_MARKDOWN_LINE_LIMIT || normalized.length > COMPACT_MARKDOWN_CHARACTER_LIMIT)

  return <div
    className={`rich-markdown ${styles.root} ${styles[density]}`}
    data-density={density}
    data-testid="rich-markdown"
  >
    <div className={`${styles.content}${shouldCollapse && !expanded ? ` ${styles.collapsed}` : ''}`} id={contentId}>
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeMarkdownUrl}>
        {normalized}
      </ReactMarkdown>
    </div>
    {shouldCollapse && <button
      aria-controls={contentId}
      aria-expanded={expanded}
      className={styles.overflowToggle}
      onClick={() => setExpanded(value => !value)}
      type="button"
    >{expanded ? text.hideOverflow : text.showAll}</button>}
  </div>
}

/** Compatibility alias for existing call sites while they adopt RichContent. */
export const Markdown = RichContent
