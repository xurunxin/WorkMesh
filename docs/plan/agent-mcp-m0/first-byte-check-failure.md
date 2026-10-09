# 暂存字节核验首败现场

本轮真实命令：`git add -- docs/plan/agent-mcp-m0; node docs/plan/agent-mcp-m0/archive-byte-check.mjs`。

工具结果：exit_code=1，chunk_id=`ea2281`，wall_time_seconds=1.6528515000000001。工具未返回可另存的原stdout文件或callID；callID记录为null，chunk_id不冒充callID。以下完整复制工具可见输出，未虚构原进程输出字节或哈希。

```text
warning: in the working copy of 'docs/plan/agent-mcp-m0/archive-byte-check.mjs', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'docs/plan/agent-mcp-m0/check-receipt.json', LF will be replaced by CRLF the next time Git touches it
node:internal/child_process:1160
    result.error = new ErrnoException(result.error, 'spawnSync ' + options.file);
                   ^

<ref *1> Error: spawnSync git ENOBUFS
    at Object.spawnSync (node:internal/child_process:1160:20)
    at spawnSync (node:child_process:928:24)
    at execFileSync (node:child_process:971:15)
    at git (file:///C:/Users/xurx/.tds/workspaces/01a11ed4-1e73-7802-8bf8-4899c5405f61/docs/plan/agent-mcp-m0/archive-byte-check.mjs:11:21)
    at file:///C:/Users/xurx/.tds/workspaces/01a11ed4-1e73-7802-8bf8-4899c5405f61/docs/plan/agent-mcp-m0/archive-byte-check.mjs:16:16
    at Array.map (<anonymous>)
    at file:///C:/Users/xurx/.tds/workspaces/01a11ed4-1e73-7802-8bf8-4899c5405f61/docs/plan/agent-mcp-m0/archive-byte-check.mjs:15:61
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    at async node:internal/modules/esm/loader:647:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
  errno: -4060,
  code: 'ENOBUFS',
  syscall: 'spawnSync git',
  path: 'git',
  spawnargs: [ 'show', ':docs/plan/agent-mcp-m0/operation-decisions.json' ],
  error: [Circular *1],
  status: null,
  signal: 'SIGTERM',
  output: [
    null,
    Buffer(1064960) [Uint8Array] [
      123,  10,  32,  32,  34, 115, 111, 117, 114,  99, 101,  72,
      101,  97, 100,  34,  58,  32,  34,  99,  55,  54,  56, 101,
       49, 101,  51, 100,  98,  50,  57,  55, 100,  56,  98,  57,
       49,  98,  53,  51, 100, 100,  54,  56,  98,  54,  48, 101,
       55,  50,  51,  97,  56,  97,  52,  48, 101,  55, 100,  34,
       44,  10,  32,  32,  34, 103, 101, 110, 101, 114,  97, 116,
      101, 100,  65, 116,  34,  58,  32,  34,  50,  48,  50,  54,
       45,  49,  48,  45,  48,  57,  84,  48,  52,  58,  52,  54,
       58,  52,  56,  46,
      ... 1064860 more items
    ],
    Buffer(0) [Uint8Array] []
  ],
  pid: 63284,
  stdout: Buffer(1064960) [Uint8Array] [
    123,  10,  32,  32,  34, 115, 111, 117, 114,  99, 101,  72,
    101,  97, 100,  34,  58,  32,  34,  99,  55,  54,  56, 101,
     49, 101,  51, 100,  98,  50,  57,  55, 100,  56,  98,  57,
     49,  98,  53,  51, 100, 100,  54,  56,  98,  54,  48, 101,
     55,  50,  51,  97,  56,  97,  52,  48, 101,  55, 100,  34,
     44,  10,  32,  32,  34, 103, 101, 110, 101, 114,  97, 116,
    101, 100,  65, 116,  34,  58,  32,  34,  50,  48,  50,  54,
     45,  49,  48,  45,  48,  57,  84,  48,  52,  58,  52,  54,
     58,  52,  56,  46,
    ... 1064860 more items
  ],
  stderr: Buffer(0) [Uint8Array] []
}

Node.js v24.20.0
```

原因：operation-decisions.json完整合同数据超过Node execFileSync默认maxBuffer；子进程未返回完整blob，不能据部分Buffer计通过。修复只把文档核验脚本缓冲设为32MiB，不截断清单、不改产品或CI。首败输出自身包含Node省略的Buffer数据，因此它只是完整工具可见输出，不是完整Git blob字节；真正blob随后独立重核。
