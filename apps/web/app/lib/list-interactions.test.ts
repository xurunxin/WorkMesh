// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { listIntent, nextFocusedId } from './list-interactions'

afterEach(() => { document.body.replaceChildren() })

const key = (
  value: string,
  target: EventTarget | null = document.body,
  overrides: Partial<KeyboardEvent> = {},
) => ({
  altKey: false,
  ctrlKey: false,
  defaultPrevented: false,
  isComposing: false,
  key: value,
  metaKey: false,
  repeat: false,
  shiftKey: false,
  target,
  ...overrides,
})

describe('nextFocusedId', () => {
  it('wraps in both directions and starts at the first visible id', () => {
    expect(nextFocusedId(['a', 'b', 'c'], 'c', 1)).toBe('a')
    expect(nextFocusedId(['a', 'b', 'c'], 'a', -1)).toBe('c')
    expect(nextFocusedId(['a', 'b', 'c'], 'missing', -1)).toBe('a')
    expect(nextFocusedId([], null, 1)).toBeNull()
  })
})

describe('listIntent', () => {
  it('maps only the declared list keys and leaves Enter native', () => {
    const link = document.createElement('a')
    link.dataset.agentRovingLink = 'true'
    link.href = '/agents/agent-1'
    document.body.append(link)

    expect(listIntent(key('k', link))).toBe('previous')
    expect(listIntent(key('ArrowUp', link))).toBe('previous')
    expect(listIntent(key('j', link))).toBe('next')
    expect(listIntent(key('ArrowDown', link))).toBe('next')
    expect(listIntent(key(' ', link))).toBe('peek')
    expect(listIntent(key('Escape', link))).toBe('escape')
    expect(listIntent(key('Enter', link))).toBeNull()
    expect(listIntent(key('x', link))).toBeNull()
  })

  it('rejects editable, interactive, modified and synthetic-repeat contexts', () => {
    const input = document.body.appendChild(document.createElement('input'))
    const textarea = document.body.appendChild(document.createElement('textarea'))
    const select = document.body.appendChild(document.createElement('select'))
    const button = document.body.appendChild(document.createElement('button'))
    const manageIcon = button.appendChild(document.createElement('span'))
    const editable = document.body.appendChild(document.createElement('div'))
    editable.setAttribute('contenteditable', 'plaintext-only')
    const editableChild = editable.appendChild(document.createElement('span'))

    for (const target of [input, textarea, select, button, manageIcon, editable, editableChild])
      expect(listIntent(key('j', target))).toBeNull()
    expect(listIntent(key(' ', manageIcon))).toBeNull()
    expect(listIntent(key('j', document.body, { altKey: true }))).toBeNull()
    expect(listIntent(key('j', document.body, { ctrlKey: true }))).toBeNull()
    expect(listIntent(key('j', document.body, { defaultPrevented: true }))).toBeNull()
    expect(listIntent(key('j', document.body, { isComposing: true }))).toBeNull()
    expect(listIntent(key('j', document.body, { repeat: true }))).toBeNull()
  })
})
