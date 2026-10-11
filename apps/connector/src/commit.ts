import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { configurationSchema, journalSchema, parseJson, serialize, sha256, type Configuration, type Expectation, type Pending } from './config.js'
import { ConnectorError, requireThat } from './errors.js'
import { atomicWrite, readPrivate, removePrivate } from './platform-security.js'
import type { SecretStore } from './secret-store.js'

export type CommitCheckpoint = 'journal' | 'secret' | 'secret_verified' | 'skill' | 'config' | 'pending_removed'
export type CommitDependencies = { store: SecretStore; write: typeof atomicWrite; checkpoint: (stage: CommitCheckpoint) => Promise<void> }
export async function recoverCommit(directory: string, store: SecretStore): Promise<boolean> {
  const journalPath = join(directory, 'commit.json')
  const raw = await readPrivate(journalPath)
  if (!raw) return false
  const journal = parseJson(journalSchema, raw.toString('utf8'))
  if (journal.oldConfiguration !== null) parseJson(configurationSchema, journal.oldConfiguration)
  requireThat(journal.secretReference === journal.nextConfiguration.secretReference
    && sha256(serialize(journal.nextConfiguration)) === journal.nextHash, 'CONNECTOR_JOURNAL_INVALID')
  const current = await readPrivate(join(directory, 'config.json'))
  const committed = current !== null && sha256(current) === journal.nextHash
  if (committed) {
    const token = await store.get(journal.secretReference)
    requireThat(token && sha256(token).slice(0, 12) === journal.nextConfiguration.fingerprint, 'CONNECTOR_COMMITTED_SECRET_MISSING')
    const skill = await readPrivate(join(directory, journal.nextConfiguration.skillFile))
    requireThat(skill && `sha256:${sha256(skill)}` === journal.nextConfiguration.expectation.skill.sha256, 'CONNECTOR_COMMITTED_SKILL_MISSING')
    await removePrivate(join(directory, 'pending.json'))
  } else {
    requireThat((current?.toString('utf8') ?? null) === journal.oldConfiguration, 'CONNECTOR_CONFIG_CHANGED_DURING_RECOVERY')
    // 唯一的新引用；旧配置和旧秘密从不覆盖或删除。
    await store.delete(journal.secretReference)
    if (!journal.skillExisted) await removePrivate(join(directory, journal.nextConfiguration.skillFile))
  }
  await removePrivate(journalPath)
  return committed
}
export async function commitConnection(directory: string, expectation: Expectation, pending: Pending,
  verified: { token: string; fingerprint: string; skill: Buffer; replayableUntil: string }, deps: CommitDependencies): Promise<Configuration> {
  const configPath = join(directory, 'config.json')
  const previous = await readPrivate(configPath)
  if (previous) parseJson(configurationSchema, previous.toString('utf8'))
  const secretReference = randomUUID()
  const next: Configuration = {
    expectation, secretReference, fingerprint: verified.fingerprint,
    completion: { pairingDigest: sha256(JSON.parse(pending.body).pairingCode as string), expectationHash: pending.expectationHash, key: pending.key },
    skillFile: `skill-${sha256(verified.skill)}.md`, replayableUntil: verified.replayableUntil,
  }
  const configBytes = serialize(next)
  const skillPath = join(directory, next.skillFile)
  const oldSkill = await readPrivate(skillPath)
  requireThat(!oldSkill || oldSkill.equals(verified.skill), 'CONNECTOR_EXISTING_SKILL_MISMATCH')
  const journal = { oldConfiguration: previous?.toString('utf8') ?? null, nextConfiguration: next,
    nextHash: sha256(configBytes), secretReference, skillExisted: oldSkill !== null }
  // 不让补偿记录取得既有条目的所有权，即使随机引用碰撞也不能删除它。
  requireThat(await deps.store.get(secretReference) === null, 'CONNECTOR_SECRET_REFERENCE_CONFLICT')
  try {
    await deps.write(join(directory, 'commit.json'), serialize(journal))
    await deps.checkpoint('journal')
    await deps.store.put(secretReference, verified.token)
    await deps.checkpoint('secret')
    requireThat(await deps.store.get(secretReference) === verified.token, 'CONNECTOR_SECRET_READBACK_FAILED')
    await deps.checkpoint('secret_verified')
    if (!oldSkill) await deps.write(skillPath, verified.skill)
    await deps.checkpoint('skill')
    await deps.write(configPath, configBytes)
    await deps.checkpoint('config')
    await removePrivate(join(directory, 'pending.json'))
    await deps.checkpoint('pending_removed')
    await removePrivate(join(directory, 'commit.json'))
    return next
  } catch {
    if (await recoverCommit(directory, deps.store)) return next
    throw new ConnectorError('CONNECTOR_COMMIT_FAILED')
  }
}
