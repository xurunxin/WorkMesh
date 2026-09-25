import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { createAgentSession, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { minimaxProbeModels, type ProbeProtocol } from './model-config.js'

if (!process.env.MINIMAX_CN_API_KEY) {
  console.error('MINIMAX_CN_API_KEY is unavailable')
  process.exit(2)
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'workmesh-pi-minimax-'))
const safeRemove = () => {
  const root = realpathSync(temporaryRoot)
  const parent = realpathSync(tmpdir())
  if (!root.startsWith(`${parent}${sep}`) || !root.includes(`${sep}workmesh-pi-minimax-`))
    throw new Error('Refusing to remove unexpected probe directory')
  rmSync(root, { recursive: true, force: true })
}

async function probe(protocol: ProbeProtocol): Promise<void> {
  const agentDir = join(temporaryRoot, protocol, 'agent')
  const stateDir = join(temporaryRoot, protocol, 'state')
  const workDir = join(temporaryRoot, protocol, 'work')
  for (const directory of [agentDir, stateDir, workDir]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(agentDir, 'models.json'), JSON.stringify(minimaxProbeModels(protocol)))
  process.env.PI_CODING_AGENT_DIR = agentDir
  const runtime = await ModelRuntime.create({
    modelsPath: join(agentDir, 'models.json'),
    authPath: join(stateDir, 'auth.json'),
    modelsStorePath: join(stateDir, 'models-store.json'),
    refreshOnCreate: true,
  })
  const model = runtime.getModel('workmesh-minimax-cn', 'MiniMax-M3')
  if (!model) throw new Error(`Pi did not resolve MiniMax-M3 for ${protocol}`)
  let toolCalls = 0
  const marker = randomUUID()
  const tool = {
    name: 'workmesh_probe', label: 'WorkMesh probe',
    description: 'Return the status of the read-only WorkMesh probe marker.',
    parameters: Type.Object({ marker: Type.String() }),
    execute: async (_toolCallId: string, args: { marker: string }) => {
      if (args.marker !== marker) throw new Error('Probe marker mismatch')
      toolCalls += 1
      return { content: [{ type: 'text' as const, text: 'ready' }], details: { status: 'ready' } }
    },
  }
  const { session } = await createAgentSession({
    cwd: workDir, agentDir, model, modelRuntime: runtime,
    sessionManager: SessionManager.inMemory(), noTools: 'builtin', customTools: [tool],
  })
  const eventTypes = new Set<string>()
  const unsubscribe = session.subscribe(event => { eventTypes.add(event.type) })
  const timeout = setTimeout(() => { void session.abort() }, 120_000)
  try {
    await session.prompt(`Call workmesh_probe with marker ${marker}. Use its result to answer with one short sentence.`)
    await session.waitForIdle()
    const hasText = Boolean(session.getLastAssistantText()?.trim())
    const settled = eventTypes.has('agent_settled')
    console.log(JSON.stringify({ protocol, model: model.id, toolCalls, hasText, settled }))
    if (toolCalls !== 1 || !hasText || !settled) throw new Error(`${protocol} Pi tool cycle did not complete`)
  } finally {
    clearTimeout(timeout)
    unsubscribe()
    session.dispose()
  }
}

try {
  for (const protocol of ['openai-completions', 'openai-responses'] as const) await probe(protocol)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Pi probe failed')
  process.exitCode = 1
} finally {
  safeRemove()
}
