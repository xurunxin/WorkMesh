import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createWorkbenchSkillLoader, workbenchSkillPath } from './workbench-skill.js'
import { workbenchSkillManifest } from './workbench-skill-manifest.js'

const temporary: string[] = []
afterEach(async () => {
  for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true })
})

it('loads exactly the pinned WorkMesh Skill with no ambient resources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workmesh-skill-test-'))
  temporary.push(root)
  const loader = await createWorkbenchSkillLoader(root, join(root, 'agent'))
  const loaded = loader.getSkills()
  expect(loaded.skills.map(skill => skill.name)).toEqual([workbenchSkillManifest.name])
  expect(loaded.diagnostics).toEqual([])
  expect(loader.getExtensions().extensions).toEqual([])
  expect(loader.getAgentsFiles().agentsFiles).toEqual([])
  expect(loader.getAppendSystemPrompt()).toEqual([await readFile(workbenchSkillPath, 'utf8')])
})

it('rejects a modified Skill before Pi starts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workmesh-skill-test-'))
  temporary.push(root)
  const altered = join(root, 'SKILL.md')
  await writeFile(altered, `${await readFile(workbenchSkillPath, 'utf8')}\nchanged\n`)
  await expect(createWorkbenchSkillLoader(root, join(root, 'agent'), altered))
    .rejects.toThrow('RUNNER_SKILL_PIN_MISMATCH')
})
