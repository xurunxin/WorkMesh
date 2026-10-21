# 原始检查回执

## 记录边界

执行日期：2026-10-21。源码基线为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`。以下按命令分别保存真实输出，JSON 行数组按 LF 拼接。环境和退出码见 [verification.md](verification.md)；这里没有产品测试结果。

## main-ref.log

命令：git ls-remote origin refs/heads/main；gh api repos/xurunxin/WorkMesh/git/ref/heads/main；gh pr view 225/226/229（JSON 字段仅含状态、提交和 URL）。

```json
[
  "c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8\trefs/heads/main",
  "c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8",
  "{\"mergeCommit\":{\"oid\":\"104f7afb8e89859549aa16af7a3114e90dea7f9b\"},\"mergedAt\":\"2026-10-13T09:40:23Z\",\"number\":225,\"state\":\"MERGED\",\"url\":\"https://github.com/xurunxin/WorkMesh/pull/225\"}",
  "{\"mergeCommit\":{\"oid\":\"c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8\"},\"mergedAt\":\"2026-10-13T12:47:34Z\",\"number\":226,\"state\":\"MERGED\",\"url\":\"https://github.com/xurunxin/WorkMesh/pull/226\"}",
  "{\"baseRefOid\":\"c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8\",\"headRefOid\":\"3bccd2f67d9fb83e382e2ffff802dda89b19028f\",\"isDraft\":true,\"mergedAt\":null,\"number\":229,\"state\":\"OPEN\",\"url\":\"https://github.com/xurunxin/WorkMesh/pull/229\"}",
  ""
]
```

## integration-docs.log

命令：锁定 Node/pnpm：pnpm check:integration-docs。

```json
[
  "",
  "> workmesh@ check:integration-docs I:\\tds_workspace\\workspaces\\01a15cd3-1e81-7581-9e17-ebb6e0b679d0",
  "> node scripts/check-integration-docs.mjs",
  "",
  "{\"skillFiles\":4,\"localLinks\":80,\"restEndpoints\":35,\"mcpTools\":11,\"humanSyntax\":\"passed\",\"scope\":\"静态检查；真实请求与中文语义须另验\"}",
  ""
]
```

## ci-policy.log

命令：锁定 Node：node --test scripts/ci-policy.test.mjs。

```json
[
  "TAP version 13",
  "# Subtest: 自包含双架构完整安装不可丢 leg、跳过或吞失败",
  "ok 1 - 自包含双架构完整安装不可丢 leg、跳过或吞失败",
  "  ---",
  "  duration_ms: 66.5876",
  "  type: 'test'",
  "  ...",
  "# Subtest: 纯后端 Lite 部署验收不能删除、条件跳过或吞掉失败",
  "ok 2 - 纯后端 Lite 部署验收不能删除、条件跳过或吞掉失败",
  "  ---",
  "  duration_ms: 43.2669",
  "  type: 'test'",
  "  ...",
  "# Subtest: 开发镜像构建接线不能被删除、跳过或吞掉失败",
  "ok 3 - 开发镜像构建接线不能被删除、跳过或吞掉失败",
  "  ---",
  "  duration_ms: 35.0197",
  "  type: 'test'",
  "  ...",
  "# Subtest: classification bootstrap locks only YAML and cannot bypass policy or evidence",
  "ok 4 - classification bootstrap locks only YAML and cannot bypass policy or evidence",
  "  ---",
  "  duration_ms: 249.6747",
  "  type: 'test'",
  "  ...",
  "# Subtest: YAML semantics preserve flow maps, aliases and literal command bodies",
  "ok 5 - YAML semantics preserve flow maps, aliases and literal command bodies",
  "  ---",
  "  duration_ms: 4.1228",
  "  type: 'test'",
  "  ...",
  "# Subtest: 连接器改动必须实际运行平台矩阵，失败/跳过不能放行",
  "ok 6 - 连接器改动必须实际运行平台矩阵，失败/跳过不能放行",
  "  ---",
  "  duration_ms: 0.357",
  "  type: 'test'",
  "  ...",
  "# Subtest: known prose on PR and main avoids every install/service/test job",
  "ok 7 - known prose on PR and main avoids every install/service/test job",
  "  ---",
  "  duration_ms: 0.4948",
  "  type: 'test'",
  "  ...",
  "# Subtest: retired workspace paths fail closed to full without a browser check",
  "ok 8 - retired workspace paths fail closed to full without a browser check",
  "  ---",
  "  duration_ms: 0.4468",
  "  type: 'test'",
  "  ...",
  "# Subtest: backend assets and fake-agent changes require API checks",
  "ok 9 - backend assets and fake-agent changes require API checks",
  "  ---",
  "  duration_ms: 1.0603",
  "  type: 'test'",
  "  ...",
  "# Subtest: API and worker changes retain destructive recovery and real backend integration",
  "ok 10 - API and worker changes retain destructive recovery and real backend integration",
  "  ---",
  "  duration_ms: 0.9974",
  "  type: 'test'",
  "  ...",
  "# Subtest: cross-workspace lock audits are selected without inventing runtime dependency cycles",
  "ok 11 - cross-workspace lock audits are selected without inventing runtime dependency cycles",
  "  ---",
  "  duration_ms: 0.8742",
  "  type: 'test'",
  "  ...",
  "# Subtest: upstream contracts/domain/db/config changes include transitive consumers",
  "ok 12 - upstream contracts/domain/db/config changes include transitive consumers",
  "  ---",
  "  duration_ms: 0.4218",
  "  type: 'test'",
  "  ...",
  "# Subtest: protocol changes retain SDK consumers, conformance and direct backend imports",
  "ok 13 - protocol changes retain SDK consumers, conformance and direct backend imports",
  "  ---",
  "  duration_ms: 0.1955",
  "  type: 'test'",
  "  ...",
  "# Subtest: root config, unknown/deleted workspaces and executable-looking docs fail closed to full",
  "ok 14 - root config, unknown/deleted workspaces and executable-looking docs fail closed to full",
  "  ---",
  "  duration_ms: 0.456",
  "  type: 'test'",
  "  ...",
  "# Subtest: main code changes, empty diff, manual/scheduled/reusable CI and merge queues always run full",
  "ok 15 - main code changes, empty diff, manual/scheduled/reusable CI and merge queues always run full",
  "  ---",
  "  duration_ms: 0.4468",
  "  type: 'test'",
  "  ...",
  "# Subtest: PR uses merge-base, main push uses before/after, renames include both paths, missing history runs full",
  "ok 16 - PR uses merge-base, main push uses before/after, renames include both paths, missing history runs full",
  "  ---",
  "  duration_ms: 0.9365",
  "  type: 'test'",
  "  ...",
  "# Subtest: aggregate rejects failure, cancellation and accidental skips for every required job",
  "ok 17 - aggregate rejects failure, cancellation and accidental skips for every required job",
  "  ---",
  "  duration_ms: 0.5211",
  "  type: 'test'",
  "  ...",
  "# Subtest: aggregate only accepts planned skips and rejects incomplete/malformed decisions",
  "ok 18 - aggregate only accepts planned skips and rejects incomplete/malformed decisions",
  "  ---",
  "  duration_ms: 0.3601",
  "  type: 'test'",
  "  ...",
  "# Subtest: MCP discovery consumers require real conformance and propagate failed or skipped job",
  "ok 19 - MCP discovery consumers require real conformance and propagate failed or skipped job",
  "  ---",
  "  duration_ms: 0.4315",
  "  type: 'test'",
  "  ...",
  "# Subtest: real workflow semantic mutations cannot silently omit MCP conformance",
  "ok 20 - real workflow semantic mutations cannot silently omit MCP conformance",
  "  ---",
  "  duration_ms: 30.4819",
  "  type: 'test'",
  "  ...",
  "# Subtest: controlled CRLF evidence preserves bytes and all other whitespace gates",
  "ok 21 - controlled CRLF evidence preserves bytes and all other whitespace gates",
  "  ---",
  "  duration_ms: 1579.8218",
  "  type: 'test'",
  "  ...",
  "1..21",
  "# tests 21",
  "# suites 0",
  "# pass 21",
  "# fail 0",
  "# cancelled 0",
  "# skipped 0",
  "# todo 0",
  "# duration_ms 2384.4407",
  ""
]
```

## document-checks.log

命令：python .tmp/ta02-docs-tools/document-checks.py。

```json
[
  "{\"base\": \"c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8\", \"boundFiles\": 57, \"archives\": 5, \"authoredLinks\": 42, \"nineCategories\": 9, \"specialResponsibilities\": 6, \"changedFiles\": 16, \"scope\": \"documentation only\"}",
  ""
]
```

## classify.log

命令：锁定 Node：node .tmp/ta02-docs-tools/classify.mjs。

```json
[
  "{",
  "  \"paths\": [",
  "    \"docs/plan/ta02-machine-daemon/README.md\",",
  "    \"docs/plan/ta02-machine-daemon/acceptance.md\",",
  "    \"docs/plan/ta02-machine-daemon/checks-raw.md\",",
  "    \"docs/plan/ta02-machine-daemon/current-spec.md\",",
  "    \"docs/plan/ta02-machine-daemon/design.md\",",
  "    \"docs/plan/ta02-machine-daemon/document-checks.md\",",
  "    \"docs/plan/ta02-machine-daemon/implementation-plan.md\",",
  "    \"docs/plan/ta02-machine-daemon/proposed-decisions.md\",",
  "    \"docs/plan/ta02-machine-daemon/source-binding.md\",",
  "    \"docs/plan/ta02-machine-daemon/sources.md\",",
  "    \"docs/plan/ta02-machine-daemon/sources/git-cache-refusal.md\",",
  "    \"docs/plan/ta02-machine-daemon/sources/ta01-latest-excerpt.md\",",
  "    \"docs/plan/ta02-machine-daemon/sources/todo-20.md\",",
  "    \"docs/plan/ta02-machine-daemon/sources/todo-32.md\",",
  "    \"docs/plan/ta02-machine-daemon/sources/todo-34.md\",",
  "    \"docs/plan/ta02-machine-daemon/verification.md\"",
  "  ],",
  "  \"plan\": {",
  "    \"mode\": \"docs\",",
  "    \"packages\": [],",
  "    \"testPackages\": [],",
  "    \"checks\": {",
  "      \"source-gates\": false,",
  "      \"connector-platform\": false,",
  "      \"connector-install\": false,",
  "      \"db-integration\": false,",
  "      \"api-integration\": false,",
  "      \"worker-integration\": false,",
  "      \"recovery-integration\": false,",
  "      \"agent-smoke\": false",
  "    }",
  "  }",
  "}",
  ""
]
```
