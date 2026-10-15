import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runPostgresTool } from './postgres.js'

const directories: string[] = []
const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'workmesh-postgres-tool-'))
  directories.push(directory)
  return directory
}

beforeEach(() => vi.stubEnv('WORKMESH_POSTGRES_TOOL_CONTAINER', ''))
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true })))
})

describe('PostgreSQL tool input and stdio lifecycle', () => {
  it('allows a successful TOC reader to exit before consuming a large file', async () => {
    const directory = await temporaryDirectory()
    const input = join(directory, 'dump')
    const bytes = Buffer.alloc(4 * 1024 * 1024, 7)
    await writeFile(input, bytes)
    await expect(runPostgresTool(process.execPath, ['-e',
      "const fs=require('node:fs');const b=Buffer.alloc(64);if(fs.readSync(0,b,0,64,null)!==64||b[0]!==7)process.exit(9);process.exit(0)",
    ], { stdinPath: input })).resolves.toBeUndefined()
    expect((await readFile(input)).equals(bytes)).toBe(true)
  })

  it('still rejects a tool that exits unsuccessfully after an early input close', async () => {
    const directory = await temporaryDirectory()
    const input = join(directory, 'dump')
    await writeFile(input, Buffer.alloc(4 * 1024 * 1024, 7))
    await expect(runPostgresTool(process.execPath, ['-e',
      "require('node:fs').readSync(0,Buffer.alloc(1),0,1,null);process.stderr.write('tool rejected input');process.exit(7)",
    ], { stdinPath: input })).rejects.toThrow('RECOVERY_POSTGRES_TOOL_FAILED:')
  })

  it('waits for the complete stdout file and refuses an existing destination', async () => {
    const directory = await temporaryDirectory()
    const output = join(directory, 'dump')
    await runPostgresTool(process.execPath, ['-e',
      "process.stdout.write(Buffer.alloc(512*1024,11),()=>process.exit(0))",
    ], { stdoutPath: output })
    expect((await readFile(output)).equals(Buffer.alloc(512 * 1024, 11))).toBe(true)
    await expect(runPostgresTool(process.execPath, ['-e',
      'setTimeout(()=>process.exit(0),1000)',
    ], { stdoutPath: output })).rejects.toThrow('RECOVERY_POSTGRES_TOOL_OUTPUT_FAILED:')
    expect((await readFile(output)).equals(Buffer.alloc(512 * 1024, 11))).toBe(true)
  })

  it('rejects unreadable input before attempting to start the tool', async () => {
    const directory = await temporaryDirectory()
    await expect(runPostgresTool(join(directory, 'missing-tool'), [], {
      stdinPath: join(directory, 'missing-dump'),
    })).rejects.toThrow('RECOVERY_POSTGRES_TOOL_INPUT_FAILED:')
  })
})
