import { writeFile } from 'node:fs/promises'
import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3201'

export const mockIds = {
  activeAgent: 'agent/route',
  inactiveAgent: 'agent-inactive',
  approvalRetry: 'approval-retry',
  approvalDirect: 'approval-direct',
  approvalRejected: 'approval-rejected',
  firstTeam: 'team-foundation',
  targetTeam: 'team-runtime',
} as const

export const largeListId = {
  agent: (ordinal: number): string => `large-agent-${String(ordinal).padStart(3, '0')}`,
  workItem: (ordinal: number): string => `large-work-${String(ordinal).padStart(3, '0')}`,
} as const

export type MockScenario =
  | 'default'
  | 'agents-interactions'
  | 'settings-workspace'
  | 'settings-delete-failure'
  | 'settings-delete-retry'
  | 'command-center'
  | 'large-list'
  | 'approval-journey'

export type SanitizedRequestEvidence = Readonly<{
  method: string
  path: string
  status: number
  outcome: 'pending' | 'completed' | 'client_aborted'
  cursor: string | null
  limit: number | null
  hasIdempotencyKey: boolean
  equivalenceGroup: number | null
}>

export type EquivalenceGroupEvidence = Readonly<{
  group: number
  requestCount: number
  commitCount: number
}>

export type MockRequestLedger = Readonly<{
  scenario: MockScenario
  count: number
  requests: SanitizedRequestEvidence[]
  equivalenceGroups: EquivalenceGroupEvidence[]
}>

type MockEvidenceOptions = Readonly<{
  ledger: MockRequestLedger
  name: string
  page?: Page
  testInfo: TestInfo
}>

type ResetResponse = Readonly<{
  scenario: MockScenario
  requestCount: number
}>

async function responseJson<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  if (!response.ok()) throw new Error(`Mock control request failed (${response.status()}): ${await response.text()}`)
  return response.json() as Promise<T>
}

export async function readMockRequests(request: APIRequestContext): Promise<MockRequestLedger> {
  return responseJson<MockRequestLedger>(await request.get(`${apiUrl}/__test/requests`))
}

export async function resetMock(request: APIRequestContext, scenario: MockScenario): Promise<MockRequestLedger> {
  const response = await request.post(`${apiUrl}/__test/reset`, { data: { scenario } })
  const reset = await responseJson<ResetResponse>(response)
  expect(reset).toEqual({ scenario, requestCount: 0 })
  const ledger = await readMockRequests(request)
  expect(ledger).toEqual({ scenario, count: 0, requests: [], equivalenceGroups: [] })
  return ledger
}

export async function restoreDefaultMock(request: APIRequestContext): Promise<void> {
  await resetMock(request, 'default')
}

export function requestsFor(
  ledger: MockRequestLedger,
  method: string,
  path: string,
): SanitizedRequestEvidence[] {
  return ledger.requests.filter(entry => entry.method === method && entry.path === path)
}

export async function readSettledMockRequests(
  request: APIRequestContext,
  method: string,
  path: string,
  timeoutMs = 5_000,
): Promise<MockRequestLedger> {
  const deadline = Date.now() + timeoutMs
  let ledger = await readMockRequests(request)
  while (Date.now() <= deadline) {
    const relevant = requestsFor(ledger, method, path)
    if (relevant.length > 0 && relevant.every(entry => entry.outcome !== 'pending')) return ledger
    await new Promise(resolve => setTimeout(resolve, 25))
    ledger = await readMockRequests(request)
  }
  const pending = requestsFor(ledger, method, path).filter(entry => entry.outcome === 'pending')
  throw new Error(`Mock request ledger did not settle for ${method} ${path}; pending=${pending.length}`)
}

export function equivalenceGroup(
  ledger: MockRequestLedger,
  group: number,
): EquivalenceGroupEvidence {
  const evidence = ledger.equivalenceGroups.find(entry => entry.group === group)
  expect(evidence, `Missing mock equivalence group ${group}`).toBeDefined()
  return evidence as EquivalenceGroupEvidence
}

export async function writeMockEvidence({ ledger, name, page, testInfo }: MockEvidenceOptions): Promise<void> {
  const focus = page ? await page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return null
    return {
      ariaLabel: active.getAttribute('aria-label'),
      dataTestId: active.getAttribute('data-testid'),
      id: active.id || null,
      tag: active.tagName.toLowerCase(),
    }
  }) : null
  const evidence = {
    focus,
    ledger,
    name,
    url: page?.url() ?? null,
  }
  await writeFile(testInfo.outputPath(`${name}.json`), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  if (page)
    await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath(`${name}.png`) })
}
