# 原始证据与范围空白门禁兼容方案（待总管审查）

本轮只补契约和精确37857eef审查checkpoint，未执行归档替换、格式化、删除、修改属性或CI规则。以下历史测试提交为 `d0806bc257fce1fba7ca7b320b79d6698ec6be45`，精确main为 `f4e5915ea4dbc5e3f3c66a80a2dba518eeb1b9c9`；其PR200的CI368/run37659092959在changes的Select required jobs失败，Required CI失败、七个执行job因没有plan而skip。最新CI369结论与当前包装集合另列下文，旧CI366的成功不覆盖后续版本。

## 历史d0806bc冲突与受影响字节

新策略先对真实PR merge-base/head执行 `git diff --check`，成功后才分类和输出plan；格式错误不会回退full。历史d0806bc范围29条路径，空白诊断842项，集中于下表17份原始日志/失败上下文。诊断模式full及七job只是独立分类结果，正式入口退出1、内部git退出2、outputs为空。截图PNG没有被该空白检查报错；38份来源原件也不在兼容调整范围。

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

## 当前审查checkpoint：37857eef（另增，不覆盖旧记录）

精确审查head为 `37857eef5a67555564097ace07871ac44ed24195`，main仍为 `f4e5915ea4dbc5e3f3c66a80a2dba518eeb1b9c9`。真实PR比较范围 **51条路径、22份报错文件、1,144条诊断**；正式入口退出1，内部范围空白检查退出2，outputs为空。CI369/run37662532290在changes/Required CI失败，七job因无plan而skip。旧17份/842条只对应d0806bc；详见 [当前完整字节清单](raw-evidence-compatibility.37857eef.json)，包含全部行号、提交blob和工作树bytes/SHA-256。

新增遗漏已纳入：`ci-build.1.log`、`e2e.6.log`、`lint.4.log`、`test.4.log`、`typecheck.4.log`。方案A的当前候选集合是该精确范围内**34份原始日志/失败上下文**，完整列表在JSON的 `packagingCandidates`，包含22份报错文件及12份未报错原件；两个error-context的两种字节不同，合计**39个独立字节member**（另有ci-build、ci-changes、integration首败日志的提交/工作树字节不同）。本轮后续新增诊断日志也须在实施前纳入最新精确head候选集合，不能冒称37857eef已覆盖它们。

| 文件（相对current目录） | 诊断数 | 提交字节 / SHA-256 | 工作树字节 / SHA-256 |
|---|---:|---|---|
| `ci-build.1.log` | 59 | 16457 / `4071dbe9459fe830c580bc77ac49332a0acab50e5fb4179626ece14ffb4555f9` | 16460 / `1b607ab4bb347236a29ab9834f4a05f8ae14eb2038e27c4c59fe4be958213586` |
| `e2e-documents.1.log` | 1 | 1489395 / `31b272e38ca7c8816fc6e1cf0e8e604ad0a05d4e14b738454db10ff69975ab50` | 1489395 / `31b272e38ca7c8816fc6e1cf0e8e604ad0a05d4e14b738454db10ff69975ab50` |
| `e2e.1.log` | 65 | 1549617 / `5bdb3942045a196a82847d4b97d7168e511eb7963783ab20848aa01c1e9526b8` | 1549617 / `5bdb3942045a196a82847d4b97d7168e511eb7963783ab20848aa01c1e9526b8` |
| `e2e.2.log` | 29 | 1714081 / `a80036de9bc3cfe6f2407071f90d8e1ca78a27d8561a81c6ea16ab8c3ed17445` | 1714081 / `a80036de9bc3cfe6f2407071f90d8e1ca78a27d8561a81c6ea16ab8c3ed17445` |
| `e2e.3.log` | 43 | 1707824 / `5e1b2e143fdbf0a6d6c44927f69f678e4304b5369f985d67656a72bce8224d1a` | 1707824 / `5e1b2e143fdbf0a6d6c44927f69f678e4304b5369f985d67656a72bce8224d1a` |
| `e2e.4.log` | 29 | 1656654 / `ef82d9daa4f6ead3abbf5fc92248f06ac067776452632866ff3c9d04193166e7` | 1656654 / `ef82d9daa4f6ead3abbf5fc92248f06ac067776452632866ff3c9d04193166e7` |
| `e2e.5.log` | 29 | 1756824 / `723071de55c3a2a9245b04d69e42859033bac5c2c0b87b9b1a9a1e79ffbc2f46` | 1756824 / `723071de55c3a2a9245b04d69e42859033bac5c2c0b87b9b1a9a1e79ffbc2f46` |
| `e2e.6.log` | 29 | 1822772 / `2ab033d5d0f16599a736ee3f413c827dde652cae8ba480b89dfcaf4e18fd5db5` | 1822772 / `2ab033d5d0f16599a736ee3f413c827dde652cae8ba480b89dfcaf4e18fd5db5` |
| `failed-e2e-1/error-context.md` | 5 | 18058 / `1a37524331d2d37d80929811a12bd29d55e1c8587912328bcfc9ed645a9adcd8` | 18118 / `c3aa9a800cfe7055760991ecf3483415f24a1a1a5a9c5d43700aab64be782751` |
| `failed-e2e-3/error-context.md` | 5 | 17892 / `2662bc847e5536546b8b64772a6b1881a3e71b0f9ca10ef6bef7948bf9e9cb29` | 17952 / `234d7565719138dfed73f4878285ce4344b0eb27250f54e731b909f9eac79024` |
| `lint.1.log` | 37 | 6129 / `53eb2839a22045d9c63b6cd84eebb1924303328cd183f7957730d9d9f117c14f` | 6129 / `53eb2839a22045d9c63b6cd84eebb1924303328cd183f7957730d9d9f117c14f` |
| `lint.2.log` | 36 | 6145 / `a9672a94db75c48a9694610df14fbe186fe5d37ab62480d2214f47caadafc63e` | 6145 / `a9672a94db75c48a9694610df14fbe186fe5d37ab62480d2214f47caadafc63e` |
| `lint.3.log` | 36 | 6146 / `39b13223f4aba565f50e97c3874a1dadbe597d7b41407e52ca8250f4a35527ac` | 6146 / `39b13223f4aba565f50e97c3874a1dadbe597d7b41407e52ca8250f4a35527ac` |
| `lint.4.log` | 37 | 6129 / `92cd7293085b8afba48f5b56c40c91d75a601080bd43ba39b8027dd8202fb746` | 6129 / `92cd7293085b8afba48f5b56c40c91d75a601080bd43ba39b8027dd8202fb746` |
| `test.1.log` | 140 | 49929 / `6c0b0ba39b877f74d607c5047d788388674394ddd3a37fc7c8efb54076be4d5f` | 49929 / `6c0b0ba39b877f74d607c5047d788388674394ddd3a37fc7c8efb54076be4d5f` |
| `test.2.log` | 139 | 49834 / `d66e5626e7889dcb6529d391d0fb13befae127913800c5e51d860f751727800d` | 49834 / `d66e5626e7889dcb6529d391d0fb13befae127913800c5e51d860f751727800d` |
| `test.3.log` | 139 | 49835 / `6202449d91eb3ea79131fd61fe037cc359a567d3700e3d437af33d8dd0a7149c` | 49835 / `6202449d91eb3ea79131fd61fe037cc359a567d3700e3d437af33d8dd0a7149c` |
| `test.4.log` | 140 | 59350 / `3e7b509617c7200bdb917285c5c4d0b977c1d6f11335935f56f886e15daec719` | 59350 / `3e7b509617c7200bdb917285c5c4d0b977c1d6f11335935f56f886e15daec719` |
| `typecheck.1.log` | 37 | 6688 / `4e50857aa3d03ae20182f08ec39716475b467cf46d153e29dac38ce45e35acc5` | 6688 / `4e50857aa3d03ae20182f08ec39716475b467cf46d153e29dac38ce45e35acc5` |
| `typecheck.2.log` | 36 | 6705 / `67b05fe1b73c8ff10487360a7d6a8f6497227c40f629eddfb31cc5ddeaa90fe0` | 6705 / `67b05fe1b73c8ff10487360a7d6a8f6497227c40f629eddfb31cc5ddeaa90fe0` |
| `typecheck.3.log` | 36 | 6706 / `efd9b08c9c7f071a4e9b0b3178a91b9a39faa3e755dba739bd91995f4e54df39` | 6706 / `efd9b08c9c7f071a4e9b0b3178a91b9a39faa3e755dba739bd91995f4e54df39` |
| `typecheck.4.log` | 37 | 6689 / `61493c3443f266c3660c11b2748bc8ac90939672fdc35b5ce9772e77e72254dd` | 6689 / `61493c3443f266c3660c11b2748bc8ac90939672fdc35b5ce9772e77e72254dd` |

## 方案A：受控无损包装，不改CI规则（契约待Chief同步spec）

把本次PR引入的原始日志和失败上下文按原始字节保存到 `docs/evidence/build-input-reachability.current/raw-evidence.zip`，同时新增 `raw-evidence-index.json` 和中文读取说明；新产生的日志采用同一方式。归档自包含保存工作树原字节及对应提交blob原字节；不同字节必须独立member，相同字节可共用member。原始提交与blob ID只用于溯源，不作为浅克隆中的读取前置。原截图可继续保留独立PNG。压缩包必须被Git实际判作二进制，不依靠 `.gitattributes` 强行关闭diff；若不是，方案验证失败而非补加豁免。

待Chief更新完整spec后，在同一G1构建把同一PR的新原始文本传输形态改为归档，并移除其独立文本副本；字节必须完整留在归档及既有历史提交。保留所有历史JSON字段、checkpoint和日志SHA；新增当前 `ciAlignment.rawEvidenceTransport` 映射逻辑旧路径到archive/member。路径变化影响最终Markdown/JSON的当前读取说明、当前原始日志索引及完整性验证器；root MANIFEST只更新实际受影响项，不重写来源38项、P1或D0历史。不能保留仍含尾随空白的新增文本副本后宣称归档已经解决门禁。

读取索引自包含契约：当前 `raw-evidence-index.json` 使用显式 `{logicalPath, version, byteKind, member, bytes, sha256, sourceCommit, sourceBlobId}` 元组。`version` 标明提交版本或有来源的工作树snapshot，`byteKind` 严格为 `worktree` / `git-blob`；按“旧路径＋版本＋字节类型”精确查找，缺失或歧义直接失败。工作树与提交原字节分别验证，不做换行转换。两个error-context必须有两个不同member；其余相同字节可共用 `bytes/<sha256>` member，但逻辑元组不得丢失。隔离浅克隆只读当前ZIP、索引及读取器即可验证两列，**不得依赖历史Git对象、fetch、外部绝对路径或网络**。历史blob ID仅为来源；历史JSON保持原样，通过当前映射解析其旧路径和准确历史版本。

历史读取映射还须覆盖历史JSON每项原始日志的执行版本别名：`logPath`＋该记录的`head`＋字节类型解析到相同保真member。执行版本未必已包含随后生成的日志，`sourceCommit`必须指向确实包含该文件的提交，不能机械设为执行HEAD。归档冻结前逐一读取历史引用的实际blob与工作树snapshot，若内容不同则新增member；禁止把当前路径的最新内容套到旧版本hash。

安全规范：先严格解码UTF-8并做Unicode NFC规范化，统一分隔符后检查规范路径；规范化后以大小写折叠键检测重复，重复member或重复逻辑元组均拒绝。仅允许索引中的相对POSIX普通文件路径；拒绝绝对路径、盘符、UNC、反斜杠原名、空/点/父级组件、控制字符、尾点/尾空格、Windows保留名及任何规范化后越界路径。ZIP中央目录与本地header路径/尺寸须一致；拒绝软/硬链接、reparse标识、目录member及其他非普通文件、加密member。不得跟随目标目录已有链接；解包目标是新临时目录，校验后再写。限制member数量、单项/总解压尺寸为审核清单的准确上界，超额立即失败，CRC不能代替SHA-256。

完整性契约：归档member集合与索引去重member集合严格相等；缺项、多项、重复、错误bytes/hash、无来源或非法映射均失败。独立读取器只使用新归档和索引解包；解包出的每种字节与实施前冻结原始字节逐字节比较，不能以摘要或同一个归一化文本匹配两种SHA。另做真实浅克隆无旧对象的隔离读取测试；不能拿深历史工作树的成功冒称浅克隆可达。

实施文件边界：新增ZIP/当前索引/读取说明，新增 `scripts/verify-raw-evidence-archive.mjs` 及其必要完整性/安全负例测试；现有 `scripts/verify-build-input-reachability.mjs` 按明确当前输入闭包接入读取器，保留原44项结果为历史且新增归档输入单列。最终Markdown/JSON新增当前运输映射和准确读取版本；root MANIFEST只更新确受影响验证器并新增ZIP/索引/读取器的准确字节条目。历史JSON字段、原始38项来源、P1冻结和D0基线不改。当前索引、验证器、root清单与当前证据必须对应同一待审版本，各自避开自包含自身hash。

Git实际判定：标准暂存后以真实PR范围 `git diff --numstat <merge-base> <head> -- <zip>` 验证二进制列为 `-` / `-`，并用 `git diff --check` 验证全范围退出0；不添加diff/whitespace属性强行豁免。若Git没判为二进制或任一原始文本副本仍触发空白，实施验收失败，不能改CI规则补救。

验收：独立解包后与本轮原始文件逐字节比较；清单覆盖所有members；历史JSON深比较不变；F5/P1/38项原件不变；更新后的真实PR范围 `git diff --check <merge-base> <head>` 退出0；原正式CI入口输出合法plan；zip/index未知路径仍分类full，七job须成功，Required CI须成功。不能把包装后的内容误判为纯Markdown，更不能用本机包装试验冒称线上新headCI通过。

方案A属于现有G1的交付包装范围，无需新增用户裁决。本轮按独审补齐契约，待Chief更新完整spec后实施；当前没有ZIP/index，不能作已解决门禁或已验收结论。方案B仍涉及CI规范变更，应单独裁决。

## 方案B：保留独立原始路径，修改CI证据校验边界（需规范裁决）

继续原样保存原始日志/上下文；在 `scripts/ci-policy.mjs` 增加精确、受控且有来源清单的原始证据路径识别。普通源码/Markdown继续按真实范围执行空白检查；只有逐字节完整性验证成功的原始证据可走单独校验。需新增证据清单校验器、CI策略回归测试并更新 `docs/CI.md` /CI计划；workflow仅在接线必需时变更。不能对所有 `docs/**` 或 `*.log` 使用泛化排除，更不能忽略语法/源码空白。

必须覆盖：清单缺项/多项、哈希或bytes不匹配、路径穿越、重名、伪装源码、普通文档尾随空白、新原始证据缺来源均失败；实际范围仍包含这些证据路径用于full分类；不得伪造plan或允许Required CI接受执行job意外skip。原始证据路径改动不能修改受信清单后自证，应由独立复核确认原件来源与新增条目。

这改变PR199的“全范围空白硬门禁”规范，不是G1可自行采用的包装修复。本轮不改分类器、workflow、属性或分支保护；应由总管把此具体边界与测试契约提交用户裁决，不能作为纯交付小改直接执行。

## 本轮交接边界

两方案尚未落地，G1/R1门禁继续关闭。本轮只交付精确main整合、读取checkpoint、本机实际检查、保留首败与复核日志以及上述方案；下一次独审应检查当前精确远端head，而非复用6dbcf33或d0806bc的旧CI。对首轮worker失败，首败没有age快照，后续单用例诊断通过且50份时钟采样没有负age，根因仍未定位；不得据此把根级集成首败改记为通过。
