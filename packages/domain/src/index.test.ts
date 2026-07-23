import { describe, expect, it } from 'vitest'
import { DomainError, assertResponsibleHumanForStarted, parseRevision } from './index.js'
describe('work item invariants', () => { it('requires a human only for started state', () => { expect(() => assertResponsibleHumanForStarted('started', null)).toThrow(DomainError); expect(() => assertResponsibleHumanForStarted('backlog', null)).not.toThrow() }); it('parses strong revision etags', () => expect(parseRevision('"revision-2"')).toBe(2)) })
