import { describe, expect, it } from 'vitest'
import { completionEvidenceMissingSql, recoveryProjectionSql } from './projection.js'

describe('completion evidence recovery projection', () => {
  it('guards every jsonb array-length operation by the value shape', () => {
    expect(completionEvidenceMissingSql).toContain("CASE jsonb_typeof(session.artifacts)")
    expect(completionEvidenceMissingSql).toContain("WHEN 'array' THEN jsonb_array_length(session.result_evidence)=0")
    expect(completionEvidenceMissingSql).toContain("WHEN 'object' THEN")
    expect(completionEvidenceMissingSql).toContain("jsonb_typeof(session.result_evidence->'artifactIds')='array'")
    expect(completionEvidenceMissingSql).toContain("jsonb_typeof(session.result_evidence->'checks')='array'")
    expect(completionEvidenceMissingSql).toContain('session.no_artifact_reason IS NULL')
    expect(recoveryProjectionSql).toContain(completionEvidenceMissingSql)
  })
})
