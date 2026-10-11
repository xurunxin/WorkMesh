以下为用户消息注入的正式审查反馈全文，不冒平台审查 API 全文读回。

我会先核对候选与基线的不可变 Git 对象，再读取完整规划、安全合同和相关源码，重点检查四项读取投影及 Runner/A2A 边界。全程只读，不启动部署或测试。
候选确实只新增规划文档和辅助脚本，基线也与指定 SHA 一致。完整方案已明确 origin/target 凭据分离和 A2A 派生写；我正在对照现行授权查询，检查这些设计是否覆盖了所有必要的 scope 和并发约束。
177 个来源记录的完整 Git blob 长度和 SHA-256 均与清单一致。接下来核查四项投影对应的发现规则，以及真实客户端链的准入条件，确认后端修复后不会仍被旧规则阻断。
请在编码前解决以下问题。

1. **High：补齐发现规则的生成来源和验证步骤。**
   > 执行现行生成器，不手写派生表。

   `scripts/generate-agent-discovery.py` 当前只合成 M0–M3，注册集合也仅来自 M2/M3；重新生成会移除新增 M4 bindings。`pnpm generate:route-policy` 则只生成 OpenAPI 扩展和策略表，不能更新 discovery。四项读取的现有规则仍含 `humanAuthorityMatches`、`legacyMembershipQueryVisible`，不能只删除 `queryDifferences` 阻断。

   请将 M4 受控发现增量及该生成脚本明确纳入实施范围，定义四项投影修复后的资格谓词和实际 bindings，保留历史输入；补充“重新生成后零差异”、旧 bindings 保留，以及新操作 feature 关闭、非法状态和合法目标待核的回归检查。(blocking)

   核查候选：`4e144f35759525a8a377acc73ba2f2dbfe02ab67`；基线：`c2b3d363c037157df13beb82799d99d07a9b7db8`。
