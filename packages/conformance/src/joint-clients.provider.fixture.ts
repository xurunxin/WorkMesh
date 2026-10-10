import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { GitProvider } from '@workmesh/git-provider'
import { saveJointEvidence } from './joint-clients.reporter.js'

// The fake remote state outlives each actual Worker process. No provider account
// or network address can be supplied by a model or by the Worker.
export async function startFakeProviderBackend(provider: GitProvider) {
  const token = randomUUID(), calls: Array<{ method: string; input: unknown }> = []
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/fake-git' || request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(403); response.end(); return
      }
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const { method, input } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { method: keyof GitProvider; input: { provider?: string } }
      if (input.provider !== 'fake') throw new Error('M5_ONLY_FAKE_PROVIDER_ALLOWED')
      let result: unknown
      switch (method) {
        case 'createBranch': result = await provider.createBranch(input as Parameters<GitProvider['createBranch']>[0]); break
        case 'createCommit': result = await provider.createCommit(input as Parameters<GitProvider['createCommit']>[0]); break
        case 'openPullRequest': result = await provider.openPullRequest(input as Parameters<GitProvider['openPullRequest']>[0]); break
        case 'getPullRequest': result = await provider.getPullRequest(input as Parameters<GitProvider['getPullRequest']>[0]); break
        case 'mergePullRequest': result = await provider.mergePullRequest(input as Parameters<GitProvider['mergePullRequest']>[0]); break
        case 'resolveRepositoryGuidance': result = await provider.resolveRepositoryGuidance(input as Parameters<GitProvider['resolveRepositoryGuidance']>[0]); break
        case 'retryCheck': result = await provider.retryCheck(input as Parameters<GitProvider['retryCheck']>[0]); break
        default: throw new Error('M5_FAKE_PROVIDER_METHOD_NOT_ALLOWED')
      }
      calls.push({ method, input })
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(result))
    } catch (error) { response.writeHead(500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: String(error) })) }
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const id = randomUUID()
  saveJointEvidence(`fake-provider-owner-${id}.json`, { pid: process.pid, url, fakeOnly: true, owned: true })
  return { token, url, calls, close: async () => {
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()))
    saveJointEvidence(`fake-provider-exit-${id}.json`, { url, listenerClosed: !server.listening, calls })
  } }
}

export function createFakeProviderRpc(url: string, token: string): GitProvider {
  if (new URL(url).hostname !== '127.0.0.1') throw new Error('M5_FAKE_PROVIDER_MUST_BE_LOOPBACK')
  const request = async <T>(method: keyof GitProvider, input: unknown): Promise<T> => {
    // Exactly one request; transport uncertainty is never retried here.
    const response = await fetch(url + '/fake-git', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ method, input }), redirect: 'error', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`M5_FAKE_PROVIDER_RPC:${response.status}:${await response.text()}`)
    return await response.json() as T
  }
  return {
    createBranch: input => request('createBranch', input), createCommit: input => request('createCommit', input),
    openPullRequest: input => request('openPullRequest', input), getPullRequest: input => request('getPullRequest', input),
    mergePullRequest: input => request('mergePullRequest', input), resolveRepositoryGuidance: input => request('resolveRepositoryGuidance', input),
    retryCheck: input => request('retryCheck', input),
  }
}
