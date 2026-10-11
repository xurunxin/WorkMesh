# B1/B2 换机接续：正式成果独审入口

本轮已恢复旧产品、正常整合主线并取得三系统原生及完整 Required CI 的真实成功结果。**没有合入、Done 或推进 #7/#20；本轮新增产品修正仍须正式成果独审和 Chief 确认。**

## 准确来源与授权

- 当前分支：`tds/conv-01a12a8e-cadc-7c05-a07a-1d6a77c8f64c`；[PR221](https://github.com/xurunxin/WorkMesh/pull/221)。
- 主线独立读回并整合：`20fb7358f6c6818a452e78c1fd3da096cdc31286`；旧产品来源：`5a11c2a2e4da0d00f79e40d59a280bc3eb7a0d19`。恢复提交 `718350f83d4a74edca33051e939204e90bf89e4c` 同时包含两者。
- 本报告的通过源提交：`c29c22efca9929c0dc3390a86dca83439b172337`；[CI448](https://github.com/xurunxin/WorkMesh/actions/runs/38144556735) 的13项job全部成功。实际三个runner checkout为 `f311e03a5c6a22208c44db9c2be2046c6f0bc5e8`，不是把 API 的 head_sha 当 checkout。
- 用户18:37恢复接续及19:05长路径反馈适用；原实施确认、三个选择和Chief放行不重复确认。本卡按已批准例外使用 Todos＋仓库，不创建真实 WorkMesh 双轨记录。
- 完整中文计划：[connector-recovery.md](../../../plan/connector-recovery.md)。saved plan 来源 `doc:m7WeSHWZt1Bv3FZwYlnlv`；原正文 SHA-256 `72e6fcb9d46a3f433291db4b1db3e351c243bc38202fdc884d463f5d50341230`，可读文件 SHA-256 `71a0e7845b205f60ecc29b91e66bea2f2086004c16212c03034a51fcbb5b6352`，本轮两份字节摘要实核一致。平台版本/计划时间未知，保留null；当前工具没有独立完整计划读回，不重建或新增同源计划。来源与冻结测试映射见上级 `plan-source.json`、`source-snapshot.json`、`test-coverage.json`。

## 实现与本轮修正

旧已审实现完整保留：网络发送前原子持久化敏感pending的key/完整body/origin/user-agent；两进程独占收敛同一身份；完整discovery/指纹/Skill原字节及签名/MCP当前身份和能力验证；全部通过才写系统秘密存储与只含引用的正式配置；journal补偿与旧配置/旧引用保全；一个连接命令和无秘密客户端片段。重放不承诺重新验证服务端撤权，当前身份验证仍拒绝已撤销/过期/旧overlap凭据。

本轮生产增量集中在 `apps/connector/src/path-policy.ts`、`platform-security.ts` 与安装钩子：

1. Windows按真实二进制owner、保护DACL及唯一无继承FullControl ACE验证，不因SDDL别名/AUTO_INHERITED表示差异误拒。
2. macOS按Apple实际NULL/ENOENT识别无扩展ACL；对象类型/dev/inode/owner/mode必须一致。ctime因子项创建变化时重新读取真实ACL并再次核对象；ACL读取失败或安全属性变化仍拒绝。私有目录/文件拒绝任何allow（含继承读取），普通祖先保持修改型allow拒绝。不修改用户/系统ACL。
3. 锁定node-pty Darwin helper缺执行位时只复制独立inode、保原SHA再替换安装目录内文件，不chmod公共CAS。安装钩子失败不冒可运行安装。

验证接线包括16轮原双进程强断言、真实Mac读取ACL/ctime交错、Windows短命令/5.1模块/真实临时SID准备及两项跨用户夹具；Windows攻击正对照移动整个不安全祖先、建立替代目录，再核原私有子项DACL与字节。DC-only仍单独证明产品拒绝，不冒其已成功移动私有叶。夹具权限只影响本次UUID目录；30秒超时、原安全拒绝/正对照保持，无skip或自动重试断言。

CI Windows检出前设置/读回longpaths；Docker全workspace安装的build/dev阶段补原生编译工具与connector manifest，独立runtime阶段不加编译工具。原ANSI控制串所有位置/chunk断言拆成独立测试，不提高原5000ms超时。原生job前后保存1103文件运行原字节摘要及Git三方绑定。

相对准确主线：**零Schema/迁移，API与contracts产品源码零变化，零新端点/DTO/事件，不改变服务端生命周期、重放窗口或限流。** `AGENT_PROTOCOL.md`/`OPENAPI.yaml`说明及[ADR0079](../../../adr/0079-connector-local-security-and-commit.md)同步本地合同，0043/0046要求保持。恢复的Web审批卸载取消刷新修正属于旧5a11已审成果，来源见上级implementation-report，不是本轮新范围。

## 实际检查与原件

所有下面结果仅属于准确CI448源，不冒最终证据提交自身已通过。各OS原件：`ci448-native/`完整job日志、`ci448-artifacts/`选定源码/清理JSON、`ci448-source-equivalence.json`逐Git原blob等价证明；全部job状态与其余10份完整日志见 `ci448-complete/`。

| 实际系统/架构 | 实际入口 | 结果 |
| --- | --- | --- |
| Linux x64，Node22.19.0 | `dbus-run-session -- bash scripts/test-connector-linux.sh` | 6平台＋73单元通过；Secret Service跨进程及daemon重启持久性、不可用拒绝、0700/0600、nobody与CLI通过 |
| Windows x64，Node22.19.0 | `./scripts/test-connector-windows.ps1` | 5平台＋73单元通过；Credential Manager、真实第二用户读取/路径替换、原私有DACL/字节、CLI通过 |
| macOS arm64，Node22.19.0 | `pnpm --filter @workmesh/connector test:platform` 后 `test` | 9平台＋73单元通过；Keychain、真实nobody读取ACL/拒绝、ctime交错、安全属性变化拒绝及CLI通过 |

全仓适用门禁实际入口：Source gates执行 `pnpm ci:source lint/typecheck/build/test`，API/DB/Worker集成、两E2E分片、灾难恢复及Agent smoke全部成功，Required CI成功。不声称未执行的本机全仓根命令已执行。已有stage5重放及新完整API/MCP连接合同由本轮API集成消费，不拿旧日志代当前组合。

Blueberry本机 `local-06/` 的lint/typecheck/build及73单元成功、源码前后稳定；平台三通过两缺本机第二用户失败如实保留。该设备未提权；跨用户缺口由上面真实Windows runner关闭。`local-source-binding/`准确Node22实跑1103文件三方绑定、真实源码变更exit1及原字节恢复exit0；Node25的最初脚本试跑单列，不冒产品runtime。

原始日志存 `raw-evidence.zip`＋`raw-evidence-index.json`，逐字节验证后才从普通日志路径收尾，首次失败/取消/截断/未运行均保历史。复核：`node docs/reviews/b1-b2/blueberry-recovery/archive-logs.mjs`；工件复核：`python docs/reviews/b1-b2/blueberry-recovery/verify-native-sources.py ci448-artifacts c29c22efca9929c0dc3390a86dca83439b172337`。

曾发生ci447 Windows cleanup JSON的index换行归一化首败后仍推送的顺序错误，详见native-followup；最终证据提交仅对原件重新应用-text属性并核实际Git blob，与下载来源SHA一致。不改原件或receipt，不放宽全仓格式门禁。

## 清理与保留

- 本机未创建Docker容器、镜像、卷或网络。初轮39目录＋2诊断探针已定向移除；local-02/03/04各39、local-05/06各54目录全部收尾，专用空根非递归移除。声明的HTTP/普通子进程/PTY关闭、测试秘密删除回执见 `resource-summary.json`，不推算物理净释放。
- CI448 Windows账户 `wmct52e0c97c2732` 与 `C:/Users/Public/workmesh-connector-265b405b417e40c4bb4000172e178d58`实际移除，errors为空；准确SID及原字节回执在工件中。不冒已测系统profile收尾。
- 保留本任务Node22 runtime、copy导入的隔离virtual store/node_modules与当前worktree，供正式独审及必要继续验收；登记/原锁SHA/store来源见 `retained-environment.json`。共享CAS、主仓库、用户配置和历史拒目标未改。
- 两个非秘密诊断根保全：`.tmp/rename-probe-1bc20940-3d2c-482c-9aeb-dfcee8fca580`（收尾rmdir首败EPERM）及 `.tmp/rename-probe-7dd37e1f-8a33-457b-a2bb-7c8bb58c764b`（native1005后未派发删除，含4096字节DLL）。准确绝对路径/ACL/对象清单见 `native-experiment-retained.json`。不重试、改ACL/属性、拆批或通过删除父目录/worktree绕首败；不冒临时资源已全清。合后worktree清理仍受这些保护及原活动/保全条件约束。

## 剩余门禁、演示与限制

最终证据提交不改变已通过的产品/平台断言，仍须**该提交自身**的最新Required CI成功。由于在文件内写入自身提交SHA/结果会再生成另一提交，最终head/run与实际结果由本次最终回复和PR最新head检查给出，不能用CI448代替。

正式独审请以本报告、完整中文计划、ADR0079、当前PR差异、原件及所有历史首败为对象；本轮没有新正式审查回执，PR查询未见review。独审blocking/high与Chief确认闭合后才按既有授权合入，actual main落地才能Done。平台消息框发送按钮左侧“AI审核”可发起独审：[使用说明](https://todos.dev/docs/ai-review)。

手工演示与失败重试/无秘密输出验收已列入本todo核验清单，具体源码命令见[连接器README](../../../../apps/connector/README.md)。需要真实系统秘密后端及管理员提供的无秘密预期清单/完整配对码；配对码、安装令牌不发到聊天。版本化无源码设备分发与未定设备矩阵仍由#20承担，不把仓库pnpm命令或这三台runner当发布完成。

历史平台准备exit128完整尾部仍不可得；18:56 Filename too long来源为用户反馈，完整本轮CI长路径首败另有原件，不混为一份日志。共享只读Git cache的index.lock未改。原始记录及可操作诊断见[恢复报告](README.md)，逐轮修正/真实结果见[原生接续](native-followup.md)。除此处如实披露的证据/清理限制，未新增产品方案分歧或削弱原DoD。
