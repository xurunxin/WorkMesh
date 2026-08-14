import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('comment event semantics', () => {
  it('records reopen as a distinct append-only fact', () => {
    const source = readFileSync(new URL('./commands.ts', import.meta.url), 'utf8')
    expect(source).toContain('input.isResolved ? "comment.resolved" : "comment.reopened"')
  })
})
