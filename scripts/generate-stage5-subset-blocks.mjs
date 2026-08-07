#!/usr/bin/env node
// Generator for the per-capability if/then/else blocks in OPENAPI.yaml.
//
// Why this exists: the v4 fix wrote out 18 + 51 = 69 capability
// blocks by hand (1 for grant_agent_delegate + 17 per-capability
// subset in AgentConnectionResponse, then 17 + 17 + 17 = 51
// subset/equality blocks in AgentConnectionIdentity). The v5 review
// flagged this as Duplicated Code: every new capability requires
// touching 69 places. This script keeps the source-of-truth in one
// file (the canonical capability list) and emits the blocks as a
// single string the OPENAPI author pastes back into the schema.
//
// Usage:
//   node scripts/generate-stage5-subset-blocks.mjs
//
// The script prints three sections to stdout, in order:
//   (1) the 18-entry allOf for AgentConnectionResponse
//   (2) the 51-entry allOf for AgentConnectionIdentity
//   (3) the SemVer 2.0.0 pattern (the same byte-for-byte as the Zod
//       regex in packages/contracts/src/index.ts)
//
// The script is intentionally NOT wired into the build: the OPENAPI
// file is hand-edited and the blocks are committed verbatim, with
// this script serving as the canonical reference and a regeneration
// shortcut. If the capability list changes, re-run this script and
// paste the new blocks back into the YAML.
//
// DO NOT delete the script: it is the single source of truth for
// "how many blocks are there and which capabilities they cover".
// The number 69 is derivable from CAPABILITIES.length (17) * 4 + 1.

const CAPABILITIES = [
  'work:read', 'work:write', 'comment:write', 'plan:write', 'message:write',
  'artifact:write', 'repo:read', 'repo:write_branch', 'repo:open_pr', 'repo:merge',
  'ci:run', 'deploy:staging', 'deploy:production', 'secrets:use',
  'automation:manage', 'admin:*', 'agent:delegate',
]

// SemVer 2.0.0 official pattern. Keep in lock-step with the Zod
// regex in packages/contracts/src/index.ts. To paste this into a
// YAML double-quoted string, every backslash below must be doubled.
const SEMVER_2_0_0 = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

// Encode a JS string into the YAML double-quoted form (every
// backslash doubled, every " escaped). Used so the printed blocks
// can be pasted straight into a YAML double-quoted pattern.
const yamlDoubleQuote = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

// (1) AgentConnectionResponse allOf: 1 grant_agent_delegate + 17 subset blocks.
const responseBlocks = []
responseBlocks.push({
  if: { properties: { grant_agent_delegate: { const: false } }, required: ['grant_agent_delegate'] },
  then: { properties: { granted_capabilities: { not: { contains: { const: 'agent:delegate' } } } } },
  description: 'If grant_agent_delegate is false, granted_capabilities must not contain agent:delegate. (1 of 18)',
})
for (const cap of CAPABILITIES) {
  responseBlocks.push({
    description: `granted \u2286 requested: ${cap}. (${CAPABILITIES.indexOf(cap) + 2} of 18)`,
    if: { properties: { requested_capabilities: { not: { contains: { const: cap } } } }, required: ['requested_capabilities'] },
    then: { properties: { granted_capabilities: { not: { contains: { const: cap } } } }, required: ['granted_capabilities'] },
  })
}

// (2) AgentConnectionIdentity allOf: 17+17+17 = 51 blocks.
const identityBlocks = []
for (const cap of CAPABILITIES) {
  identityBlocks.push({
    description: `Coordination Session grants are bounded by the parent Connection. If the Connection did not grant ${cap}, the Coordination Session cannot grant it either. (subset connection\u2192session ${CAPABILITIES.indexOf(cap) + 1}/17)`,
    if: { properties: { connection: { properties: { granted_capabilities: { not: { contains: { const: cap } } } }, required: ['granted_capabilities'] } }, required: ['connection'] },
    then: { properties: { coordination_session: { properties: { granted_capabilities: { not: { contains: { const: cap } } } }, required: ['granted_capabilities'] } }, required: ['coordination_session'] },
  })
}
for (const cap of CAPABILITIES) {
  identityBlocks.push({
    description: `Per-request identity grants are bounded by the Coordination Session. If the Session did not grant ${cap}, the identity cannot grant it either. (subset session\u2192identity ${CAPABILITIES.indexOf(cap) + 1}/17)`,
    if: { properties: { coordination_session: { properties: { granted_capabilities: { not: { contains: { const: cap } } } }, required: ['granted_capabilities'] } }, required: ['coordination_session'] },
    then: { properties: { granted_capabilities: { not: { contains: { const: cap } } } }, required: ['granted_capabilities'] },
  })
}
for (const cap of CAPABILITIES) {
  identityBlocks.push({
    description: `Per-request identity grants equal Coordination Session grants. If the identity does not grant ${cap}, the Session cannot either. (equality identity\u2192session ${CAPABILITIES.indexOf(cap) + 1}/17)`,
    if: { properties: { granted_capabilities: { not: { contains: { const: cap } } } }, required: ['granted_capabilities'] },
    then: { properties: { coordination_session: { properties: { granted_capabilities: { not: { contains: { const: cap } } } }, required: ['granted_capabilities'] } }, required: ['coordination_session'] },
  })
}

const render = (blocks) => {
  const sep = ', '
  return '[' + sep + blocks.map((b) => JSON.stringify(b)).join(sep) + ']'
}

console.log('// === AgentConnectionResponse allOf (18 entries) ===')
console.log(render(responseBlocks))
console.log()
console.log('// === AgentConnectionIdentity allOf (51 entries) ===')
console.log(render(identityBlocks))
console.log()
console.log('// === SemVer 2.0.0 pattern (YAML-encoded, paste into a pattern field) ===')
console.log(yamlDoubleQuote(SEMVER_2_0_0.source))
console.log()
console.log('// Summary: ' + CAPABILITIES.length + ' capabilities, ' + responseBlocks.length + ' + ' + identityBlocks.length + ' = ' + (responseBlocks.length + identityBlocks.length) + ' blocks total.')
