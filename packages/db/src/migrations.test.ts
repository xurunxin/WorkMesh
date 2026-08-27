import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  legacyMigrationManifest,
  legacyUpgradeBundleManifest,
  supportedLegacyUpgradeEndpoints,
  v1MigrationManifest,
} from './migration-manifest.js'
import { migrationTestSupport } from './migrations.js'

const migrationsDirectory = join(import.meta.dirname, '../migrations')

describe('v1 migration manifest', () => {
  it('pins the immutable pre-v1 inventory in deterministic order', async () => {
    expect(legacyMigrationManifest).toHaveLength(38)
    expect(legacyMigrationManifest[0]?.version).toBe('0001_stage0')
    expect(legacyMigrationManifest.at(-1)?.version).toBe('0038_agent_enrollment_and_archive')

    for (const entry of legacyMigrationManifest) {
      const source = await readFile(join(migrationsDirectory, entry.file), 'utf8')
      expect(migrationTestSupport.checksum(source), entry.version).toBe(entry.checksumSha256)
    }
  })

  it('pins the v1 baseline and all five supported atomic upgrade bundles', async () => {
    expect(v1MigrationManifest.at(-1)?.version).toBe('0008_autonomous_control_push_enrollment')
    expect(supportedLegacyUpgradeEndpoints).toEqual([
      '0002_stage0_integrity_delivery',
      '0006_stage1_review_fixes',
      '0007_stage2_work_rooms_leases_handoffs',
      '0014_provider_action_kinds',
      '0021_stage4_a2a_direction_and_prompt_identity',
      '0035_decision_session_provenance',
    ])
    expect(legacyUpgradeBundleManifest.map(bundle => bundle.fromVersion)).toEqual(
      supportedLegacyUpgradeEndpoints,
    )

    for (const entry of [...v1MigrationManifest, ...legacyUpgradeBundleManifest.map(bundle => ({
      version: `upgrade:${bundle.fromVersion}`,
      file: bundle.file,
      checksumSha256: bundle.checksumSha256,
    }))]) {
      const source = await readFile(join(migrationsDirectory, entry.file), 'utf8')
      expect(migrationTestSupport.checksum(source), entry.version).toBe(entry.checksumSha256)
      expect(() => migrationTestSupport.assertRunnerOwnedTransaction(entry.version, source)).not.toThrow()
    }
  })

  it('rejects migration-owned transaction control', () => {
    expect(() => migrationTestSupport.assertRunnerOwnedTransaction('v1/0002', 'BEGIN;\nSELECT 1;\nCOMMIT;'))
      .toThrow('MIGRATION_INTERNAL_TRANSACTION_CONTROL')
  })
})
