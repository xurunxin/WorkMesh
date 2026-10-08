import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import Fastify from 'fastify'
import { loadModelPresets, registerModelPresetRoutes } from './dist/model-presets.js'
const before = readFileSync('/etc/workmesh/model-presets.json')
const builtin = loadModelPresets(true)
assert.equal(builtin.entries.length, 9)
const replacement = loadModelPresets(true, '/etc/workmesh/model-presets.json')
assert.equal(replacement.version, process.env.C3_EXPECTED_VERSION)
assert.equal(replacement.entries.length, 1)
assert.equal(replacement.entries[0].id, 'gateway')
assert.equal(replacement.entries[0].baseUrl, 'https://gateway.example/v1')
assert.equal(loadModelPresets(false, '/does-not-exist'), null)
assert.throws(() => loadModelPresets(true, '/does-not-exist'))
assert.throws(() => writeFileSync('/etc/workmesh/model-presets.json', '{}'))
assert.equal(Object.isFrozen(replacement.entries[0]), true)
const app = Fastify()
registerModelPresetRoutes(app, replacement)
const responses = await Promise.all(Array.from({ length: 5 }, () => app.inject('/api/v1/workbench/model-presets')))
assert.equal(responses.every(response => response.statusCode === 200 && response.json().version === replacement.version), true)
await app.close()
const after = readFileSync('/etc/workmesh/model-presets.json')
assert.deepEqual(after, before)
const fileSha256 = createHash('sha256').update(after).digest('hex')
console.log(JSON.stringify({ builtinCount: builtin.entries.length, fileSha256, deploymentVersion: replacement.version, visibleIds: replacement.entries.map(entry => entry.id), disabledIds: replacement.disabledIds, readonlyFile: true, requests: responses.length, fileUnchanged: JSON.parse(readFileSync('/etc/workmesh/model-presets.json')).version === replacement.version }))
