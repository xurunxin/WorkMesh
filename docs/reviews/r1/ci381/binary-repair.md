# CI381 二进制工件损坏处置

本轮只修复归档提交字节、清单与校验器。生产者起点为 `24a63f347202cdb2f116d2a8f885752b66a50577`，本轮平台 `git fetch main` 后实际读取仍为 `5743f027ec86e8726d2cfdd38e0e038bdebeae49`。原 Attention、验收阶段依赖、F 实现授权关口的已审修订未改；本文件不是另一 agent 的最终独审结论。

## finding 与最小处置

本项为独审指出的 blocking，owner 为 R1 生产者。原因已由字节对照建立：上层 `docs/reviews/r1/.gitattributes` 的 `* text eol=lf` 对 CI381 PNG/ZIP 执行了 CRLF 转换；旧清单按扩展名推测提交字节，却将实际损坏对象 ID 与完整工作树 SHA-256 混存。因此旧 `verify-specs.mjs` 通过不能证明归档可读。

五件的工作树原字节均与旧索引的完整派生哈希相符，先在仓库外完整备份，再逐字节恢复；没有从损坏 ZIP 猜补字节，没有重新下载或提交含测试鉴权的原 artifact。两张 PNG 同时与临时截图来源核对并实际打开，显示 fake acceptance 项目，不含凭证。

本目录新增 `.gitattributes`：

```gitattributes
*.png -text
*.zip -text
```

它覆盖上层文本规则，并递归保护 `control2/failure.png`。历史上层规则、原规划与诊断结果保持原样。

| 路径（相对本目录） | 旧提交字节 | 恢复字节 | 恢复 Git blob |
| --- | ---: | ---: | --- |
| ci-failure.png | 108595 | 108598 | ea6ef90d0a254107c0af5615d45709d629fe3db4 |
| control2/failure.png | 128287 | 128289 | c7a875eadfc76fc54e3c87a4eb1b7d9fe11541eb |
| raw.redacted.zip | 115458 | 115459 | afaa81b36d5cbca00761d6580b5b16cfc6d5d4f8 |
| readable-source.redacted.zip | 447867 | 447871 | cb7b392be92b67da5b2f607fa803853e47c3ea07 |
| trace.redacted.zip | 3860101 | 3860132 | ec1ae355d3fa0dea0779bc8c9d4bb54b37bf85e1 |

恢复字节均保留原完整派生 SHA-256，见 `evidence-index.json`。旧提交中的三个 ZIP 无法读取，两张 PNG 的签名无效；损坏对象 ID、SHA-256 和失败信息保存在 `binary-validation.json`，旧提交也可直接重读。GitHub 原 artifact 哈希仍是原哈希，不能拿脱敏归档替代。

## 校验与精确版本边界

`verify-binary-evidence.py` 默认用 `git hash-object -w --path` 运行 Git 过滤器，再以 `git cat-file blob` 读回真实候选对象；不暂存、不提交、不改索引。它逐项验证本目录清单与实际对象字节，校验三个 ZIP 的全部成员 CRC、原/可读派生成员哈希、两张 PNG 的全部块 CRC 与完整像素解码，以及 trace 的 storageState、Cookie、Set-Cookie、Authorization 脱敏。原测试秘密只在仓库外临时源中读入内存做比对，输出不含原值。

`verify-specs.mjs` 新增实际对象字节与属性检查，缺少 `-text`、对象 ID/长度/SHA 不符都会失败。`execution-manifest.json` 重新读取实际 Git 对象生成，不再依扩展名猜测 LF 转换；自身不列入文件清单，并保留旧提交清单的精确引用。

本轮定向命令与实际结果记录在 `binary-validation.json`：29 项目录工件和 176 项执行清单均从候选 Git 对象读回核验；三个 ZIP 全成员 CRC 通过，两张 PNG 均完成 1280×720 像素解码。trace 的 1 处 storageState、136 项 Cookie、68 项敏感请求头均脱敏，仓库外已知原秘密比对通过。原 `24a63f3` 的 `--ref` 反例退出 1，准确报出提交字节/哈希不符，证明校验不只验证工作树。

`node --check`、`verify-specs.mjs`、`verify-handoff.mjs`、`pnpm ci:validate`、`git diff --check` 均退出 0。记录写入后重新生成目录索引和执行清单，再读回最终候选对象；这些是生产者当前工件验证，不冒作平台尚未产生的新 HEAD。没有产品、测试断言、超时、CI 策略或已审规格改动；不重复既已成功且无影响的产品全量检查。

提交产生后，复核者在该准确新 HEAD 执行：

```text
python -B docs/reviews/r1/ci381/verify-binary-evidence.py --ref <准确新提交>
node docs/reviews/r1/verify-specs.mjs
node docs/reviews/r1/verify-handoff.mjs
git diff --check 24a63f347202cdb2f116d2a8f885752b66a50577 <准确新提交>
```

## CI 与交付门禁

平台实读 [CI382/run 37691965265](https://github.com/xurunxin/WorkMesh/actions/runs/37691965265)：`24a63f3` 对应十项 job 全部 completed/success，Required CI job `113036434129` 成功。此结果只证明该旧版本 CI，不证明修复后的新 HEAD。

本项状态为「生产者已修订，待新提交字节独审」，不代独审者宣告 blocking 闭合。新 HEAD 须取得 Required CI 成功并由另一 agent 定向核验上述对象、可读性与脱敏后，Chief 才可确认合入。原 CI381 保持失败；快速点击竞态仍为中等优先级产品跟进，#6 原文缺口和待裁决项仍按原记录保留。本轮不合并、不同步 Todos、不放行产品实现。
