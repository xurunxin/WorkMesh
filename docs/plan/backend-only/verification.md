# 本轮文档准备检查与资源回执

## 已交付范围

本轮新增完整新旧方案、当前规格、两项问答、来源清单、路径影响、测试影响和逐卡去向。
原产品源码、WebUI、CI、依赖、部署与通知行为均未改动。
没有数据库迁移，没有 API／event 合同改动。产品实施等待方案独审和后续单独放行。

## 前置交付检查（独审修订前）

下表保留审查提交 `69fa7f4f196c6cef74a792054400530420c705dc` 的交付记录。
其中方案摘要和 50 个测试源文件计数属于该提交；本轮修订后的结果另列，不覆盖历史检查。

| 检查 | 实际执行或读取 | 结果 |
|---|---|---|
| 当前规格 | `tds.todos` 读取 #61，以 `Spec:` 至 `Saved plan:` 之间的完整文本保全 | 规格完整；附带方案截断，原返回已保存 |
| 原问题答复 | `tds.conversation` 的原用户答复 | 两项准确问答保全，不再询问 |
| 完整方案 | 平台注入的完整 Saved plan 保存副本 | 原文保存，最新与历史来源分开；没有猜版本字段 |
| 后续卡 | 逐卡调用 `tds.todos` | 29 个待开始卡、#7 和 #62 的规格完整；#7 附带方案截断 |
| 主线读取 | `tds.git` 请求 `ls-remote origin refs/heads/main` | 工具准备共享缓存时被现存 index.lock 阻塞；未删锁，未声称取得最新主线 |
| 写作规范 | 固定提交的三个 raw 文件读取并计算 SHA-256 | 三份规范读取成功；没有全局安装技能 |
| 中文手检 | 主规范 AI 腔清单、手册文件名、排版标点与段落检查 | 新写说明手检；原文档不改写；autocorrect 未找到 |
| 用例源码索引 | `python docs/plan/backend-only/prepare-inventory.py` | 50 个文件、155 个 test／describe 声明、2,141 个 expect 起始位置；未执行用例 |
| 正文、文件与 Git blob | `python docs/plan/backend-only/verify-documents.py`；提交后加 `--ref HEAD` | 最终暂存复核通过：50 个清单文件、50 个测试源文件、31 份后续规格，产品变化为零；提交后再次复核 |
| 空白检查 | `git diff --cached --check`；提交后 `git diff <源head> HEAD --check` | 首轮失败原件保留；修正后暂存区完整复验通过，未放宽规则；提交后再次复核 |
| 方案文件摘要 | `Get-FileHash -Algorithm SHA256` | 当前方案与最新原文文件均为 `24ea6e17a0f73697bc7842c2186c398b011c5d48698772621c2c43146c8942b0`；历史原文文件为 `5f77567921417246c61bbd826a15bfd703280e0ed42c69ca55a471eb2580fca5` |
| 改动范围 | `git diff --name-only <源head>` | 仅本轮方案材料；检查脚本断言产品变化为零 |

源码搜索曾用 PowerShell 不展开的 `apps/web/e2e/*.spec.ts`，`rg` 返回 `os error 123`。
随后改用 `rg -g '*.spec.ts' apps/web/e2e`，并用 Python 逐文件建立源码索引。
这是读取命令修正，不属于产品测试通过。

空白检查首败保存于 `sources/document-check-first-failure.json`。
原会话文本改用 JSON 的 `text` 字段保全，解码后逐字相同；新写文档清除多余末尾空行。

## 独审反馈修订检查

本轮仅修订文档，补入两份目录外 Lite 脚本的检查索引、后端去向、执行命令及 #61 责任。
活动方案改用兑换响应中的 `redeemed.skill.download_url`；两份 Saved plan 原件、规格和问答未改动。
修订来源与精确替换见 `review-corrections.md` 和 `review-corrections.json`。

| 检查 | 实际执行 | 结果 |
|---|---|---|
| 索引再生成 | `python docs/plan/backend-only/prepare-inventory.py` | 52 个源文件、155 个 test／describe 声明、2,178 个 expect／assert／throw Error 起始位置；仅提取源码，没有执行产品检查 |
| 活动方案与原件 | `python docs/plan/backend-only/verify-documents.py` | 52 个清单文件及实际暂存 blob 一致；原件仍逐字匹配保全正文，活动方案等于原件应用两处精确修订；产品变化为零 |
| 审查原句位置 | 重读 `prepare-inventory.py` 的枚举段和活动方案镜像验收段 | 索引包含两份目录外脚本；下载流程为 discovery 校验、配对兑换、兑换 URL 下载；Saved plan 原句作为来源保留 |
| 范围及空白 | `git diff --cached --check`，比较审查提交的文件路径 | 仅方案材料变化；空白检查通过；产品源码、CI 和部署脚本未变 |
| 中文手检 | 沿用固定写作规范，复核修订段落、标点、链接及状态表述 | 不改原件，不安装全局工具；产品验收均明确待执行 |

提交后执行 `python docs/plan/backend-only/verify-documents.py --ref HEAD`，复核实际提交 blob；准确 head 由推送结果交接。
本轮未创建或清理运行资源，生成器和校验器仅作为方案材料保留。

## 未执行的产品验收

本轮没有运行 pnpm install、build、lint、typecheck、unit、integration、conformance、协议 smoke、镜像或恢复验收。
本轮也没有移除浏览器 job。上述命令和具体预期见测试影响表，状态全部待执行。
本轮文档交付不满足整卡 Done 或产品合入条件。

## 资源归属

本任务只新增当前工作树内的方案材料。网络只读取平台内容和公开固定技能来源。
没有安装依赖，没有修改共享 pnpm store，没有创建测试数据库、容器、builder、守护进程或临时 worktree。
没有删除业务数据、共享配置、共享锁或历史证据。没有需要回收的运行资源。
文档生成器与校验器作为本任务交付文件保留，未运行 Python 编译缓存或全局工具安装。

## 审查关口

提交并推送当前会话分支后，交接准确提交 SHA 和文件路径。
停在 review，交正式方案独审。审查反馈只修改方案材料。
独审通过后由 Chief 单独放行产品实施；最终产品合入仍要求独审 blocking／high 关闭及适用 Required CI 成功。
