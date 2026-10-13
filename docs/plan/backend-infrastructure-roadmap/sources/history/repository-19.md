# M0成果独审后恢复与安装交接修正

后续平台成果独审已批准精确候选 `67c924b3d8837d81e6b3314e9c3cec7693f3ff34`；PR212/CI407随后因早期分类缺yaml失败，未合入。当前CI增量、原失败、空依赖回归与剩余门禁见 [product-ci407-report.md](product-ci407-report.md)。以下旧报告、检查和历史缺口保留当时含义，不倒写为最新CI成功。

## 修正与边界

原平台三 High 完整注入审查及原候选见 [platform-recovery-review-original.md](platform-recovery-review-original.md)。本轮在同分支修正这些产品回归，冻结方案、历史档案和旧运行原件保留。主线重新实读 `refs/heads/main=69085317c88d84b702af727dc0ac7152589626d8`；本轮启动精确 head 为 `6cf8b105a320e9f72eba4aef5d335de8ae344730`，修改前工作树干净。不是新计划，不以文档或内部复核完成整卡。

| 原阻断 | 实现和正反例 |
| --- | --- |
| ACK提交后同key重放被拒 | `operation-decisions.json` 与生成规则将 acknowledged 纳入 ACK 状态入口，另加只在该状态适用的 `ackReceiptReplayOnly` 待核条件。MCP ACK 使用原 E Token 到 REST，不先 qualified；原命令区分回执重放与新 key。真实 HTTP API 提交响应读完后由 SDK 注入传输丢失，真实 MCP 内存 transport 返回失败；原 key/body 恢复只有一条 ACK event，新 key 返回 SESSION_NOT_ACTIVE。常规与状态链仍使用真实 HTTP MCP。 |
| stale ACK/终态心跳被普通manifest拦住 | `apps/mcp/src/discovery.ts` 仅让既有 ACK/heartbeat 使用原 Token/既有明确 SDK 刷新入口；其余工具仍读取普通 manifest。真实 MCP HTTP 下 stale ACK 成功、stopping 和 canceled 诊断心跳成功且状态保持终态；撤 Delegation 后 ACK/心跳均返回原 UNAUTHENTICATED 和 trace。单元测试断言原 E Bearer、零manifest/refresh、403仅一次请求；readonly cached ACK仍零REST早拒。 |
| 安装交接按当前Session投影而不可达 | 共享投影按安装 binding 的实际用途槽选择 null Session/Delegation/manifest 身份；缺安装凭据则 deploymentSupported/discoverable均false。MCP调用直接走安装身份分支，不读C/E manifest。`rejectPendingHandoff`明确安装Bearer，`rejectHandoff`原Session分支保留并测试共享Token不变。真实配对两Agent：准确target可inspect/reject，另一Agent inspect为NOT_FOUND、reject为FORBIDDEN；仅SessionToken E为INSTALLATION_TOKEN_REQUIRED。 |

工具名称和输入 schema 保持。API manifest 状态门禁、领域写授权、Human-only与readonly早拒绝均未放宽，无迁移、领域事件定义、外发或新 M1–M5 功能。新增 helper 是SDK安装用途入口，不增加 REST route。ADR0079保持Proposed，协议和两份客户端指南公告上述兼容路径。

## 实际验证与首败

实际命令/exit/runtime/Node、skip和受测输入 ZIP 在 `product-evidence/review3-*.json`、对应 `.log` 和内容寻址原输出 ZIP。每次使用独立命名，没有覆盖旧运行。

旧文档检查首次退出1是生产者新增谓词漏 `description`，已补说明及逐门禁正反例；再次退出1是旧checker冻结工作树指纹和“只文档阶段”约束与产品阶段不相容。两份首败原件分别为 `review3-static`、`review3-static-recheck`，不删、不改旧checker或旧source-manifest。产品阶段 `scripts/m0-product-rule-check.py` 核当前OpenAPI全集、365允许/1688拒绝文档事实、97真实binding输入/SDK方法（reject使用已修helper），以及生成规则字节不变；不是运行时产品通过率。

初次单元/集成检查运行期间补充了安装 deploymentSupported、SDK兼容测试及更精确撤权断言；启动输入ZIP与该补充区分。最终定向测试、类型检查及完整unit/integration使用补充后输入另跑，不冒中间归档为最终受测源码。最终回执汇总在本文件后续的实际检查表。

真实 conformance 的12项同时保持资源/仅tool/readonly、C/E准确发现、双E并发桥接、幂等/revision/回滚/重放、durable cursor/restart/Stop和Pi实收名单/三次工具调用/四次模型请求/持久Turn与Document事实。并未只凭Pi进程exit0判通过。Required `api-integration` 原接线和失败/always上传保持，由CI validator和policy测试核验。

## 字节、资源和交付门禁

`review3-source-manifest.json`、`product-evidence/review3-final-source.zip` 分别保全本轮源码/受控文件的staged Git blob与工作树字节，另列与旧head源blob的关系；旧product-source-manifest与旧sourceZIP不覆盖。各检查inputs ZIP保留实际启动时输入，原脱敏输出先无损ZIP再规范可读副本空白；不放宽Git whitespace属性。

记录器首次归档重写了两个已有同内容ZIP的时间戳，日志成员相同但容器字节不同；重写字节与纠正前索引完整保存于 `review3-pre-restoration-zip-bytes.zip`，再恢复旧Git容器实物。记录器已改为验证并复用已存在ZIP，重复两遍不得改已有归档。纠正过程见 `review3-evidence-preservation-correction.json`。完整性首败 `review3-evidence-integrity` 进一步揭示旧候选索引本已有10行容器声明与其Git实物不符，涉及2个旧容器指纹；可达Git历史未找到声明的容器原件，不能伪补。原索引行保持不变，明确差异/缺口与旧Git实物绑定在 `review3-historical-archive-bindings.json`，所有日志成员原SHA仍独立核验；不将这些历史容器声明计作通过。最终完整性核验严格校验每个成员、新容器、旧Git实物、原索引与重复归档不变，并单列10条声明未核。新增证据工具修正独立运行验证，不能冒其字节与此前产品检查输入相同；产品运行代码仍与最终检查输入一致。

独有服务由 `m0-run-services.py` 建立带owner标签的Postgres/Redis/RustFS tmpfs容器、随机凭据和独有bucket，ready后执行检查，finally保全脱敏日志后逐ID/name/label核归属并stop/rm。资源回执与客户端JSON ZIP逐run保留。共享镜像/网络、当前/恢复目录和已拒G1/D0/C3目标保持；E2E服务归档中可能包含前次conformance留下的CI输出，不能当作E2E新产生的客户端事实，事实归属以各run输入和专属真实集成归档为准。

完整性首败时刻的中间索引未另存完整字节；首败输出、纠正前ZIP、原Git索引与十条实际变更可追溯，不能冒作当时完整索引原件。声明容器未找回的缺口也不改为通过。

候选精确head由平台提交回执与交付消息给出，受测字节提交后逐blob复核；版本字段不预填、不循环造doc。最新候选RequiredCI和另一Agent平台成果定向独审尚须满足，未merge或宣告M0已done/main。

## 最终检查实际回执

| 检查 | 真实结果 | runtime秒 | 回执 |
| --- | --- | --- | --- |
| `review3-lint-final` | 18包成功 | 125.723 | [JSON](product-evidence/review3-lint-final.json) |
| `review3-typecheck-final` | 18包成功 | 71.015 | [JSON](product-evidence/review3-typecheck-final.json) |
| `review3-unit-final` | 1763通过、2可选skip | 271.451 | [JSON](product-evidence/review3-unit-final.json) |
| `review3-integration-final` | DB80/API234/MCP12/Worker113通过；3可选skip | 425.936 | [JSON](product-evidence/review3-integration-final.json) |
| `review3-e2e` | 70通过 | 267.604 | [JSON](product-evidence/review3-e2e.json) |
| `review3-targeted-final` | contracts203/SDK42/MCP44通过 | 15.046 | [JSON](product-evidence/review3-targeted-final.json) |
| `review3-ci` | 配置校验及15归档用例通过 | 2.377 | [JSON](product-evidence/review3-ci.json) |
| `review3-ci-policy` | 14通过 | 0.450 | [JSON](product-evidence/review3-ci-policy.json) |
| `review3-route-policy` | 退出0 | 3.155 | [JSON](product-evidence/review3-route-policy.json) |
| `review3-product-static-final` | 277操作/97现有binding；365正例/1688反例 | 1.665 | [JSON](product-evidence/review3-product-static-final.json) |
| `review3-memory-conformance` | 6/6内存夹具单列 | 2.174 | [JSON](product-evidence/review3-memory-conformance.json) |
| `review3-evidence-integrity-final` | 日志成员/当前容器/旧Git实物核验通过；10历史容器声明未核单列 | 1.280 | [JSON](product-evidence/review3-evidence-integrity-final.json) |

四次专属服务运行的12个容器均已ready并按归属收尾；共享镜像、网络与工作目录保留。完整命令、skip、首败、产品运行源码字节一致性与后改证据工具的区分见 [本轮回执汇总](product-evidence/review3-checks.json)。本轮没有新领域授权或WebUI修改。
