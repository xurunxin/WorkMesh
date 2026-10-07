# 原始证据与范围空白门禁兼容方案（待总管审查）

本轮只提出具体交付方案。原始文件保持当前字节，未执行归档替换、格式化、删除、修改属性或CI规则。当前测试提交为 `d0806bc257fce1fba7ca7b320b79d6698ec6be45`，精确main为 `f4e5915ea4dbc5e3f3c66a80a2dba518eeb1b9c9`；PR200的CI368/run37659092959在changes的Select required jobs失败，Required CI失败、七个执行job因没有plan而skip。旧CI366的成功不覆盖当前版本。

## 已核实冲突与受影响字节

新策略先对真实PR merge-base/head执行 `git diff --check`，成功后才分类和输出plan；格式错误不会回退full。当前范围29条路径，空白诊断842项，集中于下表17份原始日志/失败上下文。诊断模式full及七job只是独立分类结果，正式入口退出1、内部git退出2、outputs为空。截图PNG没有被该空白检查报错；38份来源原件也不在兼容调整范围。

下表路径均相对 `docs/evidence/build-input-reachability.current/`。提交列严格对应d0806bc的blob；工作树列是本轮原始读取字节。完整blob ID与行号见 [字节清单](raw-evidence-compatibility.json)。CRLF与LF可使两列不同，不能用归一化后摘要替代原件哈希。

| 文件 | 诊断数 | 提交字节 / SHA-256 | 工作树字节 / SHA-256 |
|---|---:|---|---|
| `e2e-documents.1.log` | 1 | 1489395 / `31b272e38ca7c8816fc6e1cf0e8e604ad0a05d4e14b738454db10ff69975ab50` | 1489395 / `31b272e38ca7c8816fc6e1cf0e8e604ad0a05d4e14b738454db10ff69975ab50` |
| `e2e.1.log` | 65 | 1549617 / `5bdb3942045a196a82847d4b97d7168e511eb7963783ab20848aa01c1e9526b8` | 1549617 / `5bdb3942045a196a82847d4b97d7168e511eb7963783ab20848aa01c1e9526b8` |
| `e2e.2.log` | 29 | 1714081 / `a80036de9bc3cfe6f2407071f90d8e1ca78a27d8561a81c6ea16ab8c3ed17445` | 1714081 / `a80036de9bc3cfe6f2407071f90d8e1ca78a27d8561a81c6ea16ab8c3ed17445` |
| `e2e.3.log` | 43 | 1707824 / `5e1b2e143fdbf0a6d6c44927f69f678e4304b5369f985d67656a72bce8224d1a` | 1707824 / `5e1b2e143fdbf0a6d6c44927f69f678e4304b5369f985d67656a72bce8224d1a` |
| `e2e.4.log` | 29 | 1656654 / `ef82d9daa4f6ead3abbf5fc92248f06ac067776452632866ff3c9d04193166e7` | 1656654 / `ef82d9daa4f6ead3abbf5fc92248f06ac067776452632866ff3c9d04193166e7` |
| `e2e.5.log` | 29 | 1756824 / `723071de55c3a2a9245b04d69e42859033bac5c2c0b87b9b1a9a1e79ffbc2f46` | 1756824 / `723071de55c3a2a9245b04d69e42859033bac5c2c0b87b9b1a9a1e79ffbc2f46` |
| `failed-e2e-1/error-context.md` | 5 | 18058 / `1a37524331d2d37d80929811a12bd29d55e1c8587912328bcfc9ed645a9adcd8` | 18118 / `c3aa9a800cfe7055760991ecf3483415f24a1a1a5a9c5d43700aab64be782751` |
| `failed-e2e-3/error-context.md` | 5 | 17892 / `2662bc847e5536546b8b64772a6b1881a3e71b0f9ca10ef6bef7948bf9e9cb29` | 17952 / `234d7565719138dfed73f4878285ce4344b0eb27250f54e731b909f9eac79024` |
| `lint.1.log` | 37 | 6129 / `53eb2839a22045d9c63b6cd84eebb1924303328cd183f7957730d9d9f117c14f` | 6129 / `53eb2839a22045d9c63b6cd84eebb1924303328cd183f7957730d9d9f117c14f` |
| `lint.2.log` | 36 | 6145 / `a9672a94db75c48a9694610df14fbe186fe5d37ab62480d2214f47caadafc63e` | 6145 / `a9672a94db75c48a9694610df14fbe186fe5d37ab62480d2214f47caadafc63e` |
| `lint.3.log` | 36 | 6146 / `39b13223f4aba565f50e97c3874a1dadbe597d7b41407e52ca8250f4a35527ac` | 6146 / `39b13223f4aba565f50e97c3874a1dadbe597d7b41407e52ca8250f4a35527ac` |
| `test.1.log` | 140 | 49929 / `6c0b0ba39b877f74d607c5047d788388674394ddd3a37fc7c8efb54076be4d5f` | 49929 / `6c0b0ba39b877f74d607c5047d788388674394ddd3a37fc7c8efb54076be4d5f` |
| `test.2.log` | 139 | 49834 / `d66e5626e7889dcb6529d391d0fb13befae127913800c5e51d860f751727800d` | 49834 / `d66e5626e7889dcb6529d391d0fb13befae127913800c5e51d860f751727800d` |
| `test.3.log` | 139 | 49835 / `6202449d91eb3ea79131fd61fe037cc359a567d3700e3d437af33d8dd0a7149c` | 49835 / `6202449d91eb3ea79131fd61fe037cc359a567d3700e3d437af33d8dd0a7149c` |
| `typecheck.1.log` | 37 | 6688 / `4e50857aa3d03ae20182f08ec39716475b467cf46d153e29dac38ce45e35acc5` | 6688 / `4e50857aa3d03ae20182f08ec39716475b467cf46d153e29dac38ce45e35acc5` |
| `typecheck.2.log` | 36 | 6705 / `67b05fe1b73c8ff10487360a7d6a8f6497227c40f629eddfb31cc5ddeaa90fe0` | 6705 / `67b05fe1b73c8ff10487360a7d6a8f6497227c40f629eddfb31cc5ddeaa90fe0` |
| `typecheck.3.log` | 36 | 6706 / `efd9b08c9c7f071a4e9b0b3178a91b9a39faa3e755dba739bd91995f4e54df39` | 6706 / `efd9b08c9c7f071a4e9b0b3178a91b9a39faa3e755dba739bd91995f4e54df39` |

## 方案A：受控无损包装，不改CI规则（建议先评审）

把本次PR引入的原始日志和失败上下文按原始字节保存到 `docs/evidence/build-input-reachability.current/raw-evidence.zip`，同时新增 `raw-evidence-index.json` 和中文读取说明；新产生的日志采用同一方式。以仓库当前保存的工作树字节为解包后原件，另固定每项原始提交、blob ID和提交字节SHA-256。原截图可继续保留独立PNG。压缩包必须被Git实际判作二进制，不依靠 `.gitattributes` 强行关闭diff；若不是，方案验证失败而非补加豁免。

获批准后才把同一PR的新原始文本传输形态改为归档，并移除其独立文本副本；字节必须完整留在归档及既有历史提交。保留所有历史JSON字段、checkpoint和日志SHA；新增当前 `ciAlignment.rawEvidenceTransport` 映射逻辑旧路径到archive/member。路径变化影响最终Markdown/JSON的当前读取说明、当前原始日志索引及完整性验证器；root MANIFEST只更新实际受影响项，不重写来源38项、P1或D0历史。不能保留仍含尾随空白的新增文本副本后宣称归档已经解决门禁。

读取规范：仅在本地临时目录解包，拒绝绝对路径、`..`、重复member和清单外member；逐项核对文件数、bytes和SHA-256。历史提交通过 `git cat-file blob <blobId>` 读取并验证另一列。对原始工作树SHA与提交SHA分开验证，不能因为解包成功省略哈希。文本摘要只作导航，不能作为ADR/计划/日志原文替代。

验收：独立解包后与本轮原始文件逐字节比较；清单覆盖所有members；历史JSON深比较不变；F5/P1/38项原件不变；更新后的真实PR范围 `git diff --check <merge-base> <head>` 退出0；原正式CI入口输出合法plan；zip/index未知路径仍分类full，七job须成功，Required CI须成功。不能把包装后的内容误判为纯Markdown，更不能用本机包装试验冒称线上新headCI通过。

这属于交付包装变更，不改变产品或CI规则；但会改变当前原始证据访问路径，与本轮“先不删除原件”的限制有明确边界，因此此轮不执行。必须经总管定向评审确认路径/兼容契约，并在需要时向用户给出此具体方案裁决后再做；不能悄悄移除原件。

## 方案B：保留独立原始路径，修改CI证据校验边界（需规范裁决）

继续原样保存原始日志/上下文；在 `scripts/ci-policy.mjs` 增加精确、受控且有来源清单的原始证据路径识别。普通源码/Markdown继续按真实范围执行空白检查；只有逐字节完整性验证成功的原始证据可走单独校验。需新增证据清单校验器、CI策略回归测试并更新 `docs/CI.md` /CI计划；workflow仅在接线必需时变更。不能对所有 `docs/**` 或 `*.log` 使用泛化排除，更不能忽略语法/源码空白。

必须覆盖：清单缺项/多项、哈希或bytes不匹配、路径穿越、重名、伪装源码、普通文档尾随空白、新原始证据缺来源均失败；实际范围仍包含这些证据路径用于full分类；不得伪造plan或允许Required CI接受执行job意外skip。原始证据路径改动不能修改受信清单后自证，应由独立复核确认原件来源与新增条目。

这改变PR199的“全范围空白硬门禁”规范，不是G1可自行采用的包装修复。本轮不改分类器、workflow、属性或分支保护；应由总管把此具体边界与测试契约提交用户裁决，不能作为纯交付小改直接执行。

## 本轮交接边界

两方案尚未落地，G1/R1门禁继续关闭。本轮只交付精确main整合、读取checkpoint、本机实际检查、保留首败与复核日志以及上述方案；下一次独审应检查当前精确远端head，而非复用6dbcf33或d0806bc的旧CI。对首轮worker失败，首败没有age快照，后续单用例诊断通过且50份时钟采样没有负age，根因仍未定位；不得据此把根级集成首败改记为通过。
