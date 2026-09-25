import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createSyntheticSourceInfo, DefaultResourceLoader } from '@earendil-works/pi-coding-agent'
import { workbenchSkillManifest } from './workbench-skill-manifest.js'

export const workbenchSkillPath = fileURLToPath(new URL('../skills/workmesh-workbench/SKILL.md', import.meta.url))

export async function createWorkbenchSkillLoader(cwd: string, agentDir: string,
  path = workbenchSkillPath): Promise<DefaultResourceLoader> {
  const content = await readFile(path, 'utf8')
  const digest = `sha256:${createHash('sha256').update(content).digest('hex')}`
  if (digest !== workbenchSkillManifest.sha256) throw new Error('RUNNER_SKILL_PIN_MISMATCH')
  if (!content.startsWith(`---\nname: ${workbenchSkillManifest.name}\n`))
    throw new Error('RUNNER_SKILL_FRONTMATTER_INVALID')
  const loader = new DefaultResourceLoader({
    cwd, agentDir,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    skillsOverride: () => ({ skills: [{
      name: workbenchSkillManifest.name,
      description: 'Operate the delegated WorkMesh Agent Session through authorized Runner tools.',
      filePath: path, baseDir: fileURLToPath(new URL('../skills/workmesh-workbench/', import.meta.url)),
      sourceInfo: createSyntheticSourceInfo(path, { source: 'workmesh-runner' }),
      disableModelInvocation: false,
    }], diagnostics: [] }),
    appendSystemPrompt: [content],
  })
  await loader.reload()
  const loaded = loader.getSkills()
  if (loaded.diagnostics.length || loaded.skills.length !== 1
    || loaded.skills[0]?.name !== workbenchSkillManifest.name
    || loader.getAppendSystemPrompt().length !== 1)
    throw new Error('RUNNER_SKILL_LOAD_INVALID')
  return loader
}
