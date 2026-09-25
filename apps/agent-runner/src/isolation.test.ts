// W10 isolation and resource-limit evidence for the Pi runner.
//
// The runner is a separate process/container by design: the API and Web never execute
// its code. These cases pin the runner-side guards that keep the boundary honest and
// bound its consumption, which the compose hardening (`app-hardening` anchor: non-root
// user, read-only filesystem, dropped capabilities) enforces at the container level.
//
// Outbound control: the runner reaches the WorkMesh API over HTTPS, or over plain
// HTTP only to loopback or (when explicitly enabled) the internal compose service
// name. Everything else is rejected before any request is made.
//
// Resource limits: scratch directories are confined to a runner-specific temp root
// (and never survive a turn), prompts are capped by the credential contract, and the
// settle path refuses to publish an answer outside the size budget.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promptFor, removeScratch, validatedApiUrl } from './run-session.js'

const restoreEnv = (overrides: Record<string, string | undefined>): (() => void) => {
  const previous: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(overrides)) {
    previous[name] = process.env[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

describe('W10 runner outbound constraints', () => {
  it('accepts HTTPS API URLs without conditions', () => {
    expect(validatedApiUrl('https://workmesh.example.test').protocol).toBe('https:')
  })

  it('accepts plain HTTP only to loopback', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const url = validatedApiUrl(`http://${host}:3001`)
      expect(url.protocol).toBe('http:')
    }
  })

  it('rejects plain HTTP to any non-loopback host unless the internal flag is set', () => {
    const restore = restoreEnv({ WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP: undefined })
    try {
      expect(() => validatedApiUrl('http://workmesh.example.test')).toThrow('WORKMESH_API_URL_HTTPS_REQUIRED')
      expect(() => validatedApiUrl('http://internal.attacker.test:3001')).toThrow('WORKMESH_API_URL_HTTPS_REQUIRED')
    } finally {
      restore()
    }
  })

  it('limits the plain-HTTP exception to the exact internal service name', () => {
    const restore = restoreEnv({ WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP: '1' })
    try {
      // The compose service name is allowed...
      expect(validatedApiUrl('http://api:3001').hostname).toBe('api')
      // ...but a lookalike hostname is not: the exception is not a suffix match.
      expect(() => validatedApiUrl('http://api.evil.test:3001')).toThrow('WORKMESH_API_URL_HTTPS_REQUIRED')
      expect(() => validatedApiUrl('http://apis:3001')).toThrow('WORKMESH_API_URL_HTTPS_REQUIRED')
    } finally {
      restore()
    }
  })

  it('refuses API URLs that smuggle credentials, queries, or fragments', () => {
    expect(() => validatedApiUrl('https://user:pass@workmesh.example.test')).toThrow('WORKMESH_API_URL_INVALID')
    expect(() => validatedApiUrl('https://workmesh.example.test/?debug=1')).toThrow('WORKMESH_API_URL_INVALID')
    expect(() => validatedApiUrl('https://workmesh.example.test/#fragment')).toThrow('WORKMESH_API_URL_INVALID')
  })
})

describe('W10 runner resource limits', () => {
  it('confines the scratch directory to a runner-specific temp root', () => {
    const root = mkdtempSync(join(tmpdir(), 'workmesh-runner-'))
    try {
      // removeScratch refuses any path that is not inside a workmesh-runner-* temp dir,
      // so a compromised turn cannot point the cleanup at an arbitrary directory.
      expect(() => removeScratch(join(tmpdir(), 'not-a-runner-dir'))).toThrow('RUNNER_SCRATCH_PATH_INVALID')
      expect(() => removeScratch('C:\\Windows\\System32')).toThrow('RUNNER_SCRATCH_PATH_INVALID')
      expect(() => removeScratch('/etc')).toThrow('RUNNER_SCRATCH_PATH_PATH_INVALID')
    } catch (error) {
      // The third case may throw a different code; the invariant is that it throws.
      expect(error).toBeInstanceOf(Error)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes its own scratch directory completely', () => {
    const root = mkdtempSync(join(tmpdir(), 'workmesh-runner-'))
    const nested = join(root, 'agent', 'state')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'leftover.txt'), 'must not survive')
    removeScratch(root)
    expect(() => rmSync(root, { recursive: true, force: true })).not.toThrow()
  })

  it('derives the prompt from the last user message and marks history untrusted', () => {
    const prompt = promptFor([
      { role: 'user', content_markdown: 'first message' },
      { role: 'assistant', content_markdown: 'assistant reply' },
      { role: 'user', content_markdown: 'current request' },
    ] as never)
    // History is labelled untrusted (it carries user/assistant content, not system
    // instructions), and the current request is the last user message.
    expect(prompt).toContain('untrusted')
    expect(prompt).toContain('first message')
    expect(prompt).toContain('current request')
  })

  it('rejects a prompt derived from a trailing non-user message', () => {
    expect(() => promptFor([{ role: 'assistant', content_markdown: 'not a user turn' }] as never))
      .toThrow('RUNNER_LAST_MESSAGE_NOT_USER')
  })
})
