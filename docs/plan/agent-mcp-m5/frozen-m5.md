## M5：选定客户端与部署画像的联合验收及交付说明

**范围**：用同一已验收后端候选验证外部MCP客户端（首批建议仓库支持的Codex/OpenCode/pi式客户端协议行为）及内置Pi Runner。实际客户端/OS/版本与是否真实厂商客户端必须记录，公开行为fixture只证明协议、不能冒真实厂商认证。个人Lite/小团队/企业配置尽量同核心后端；支持等级逐一声明，不给未测画像打勾。

不借M5发布公共签名Skill：ADR0069的Runner内嵌pin和公共1.1.0不可变release分别处理，新公共版本需要实际签名/发行授权及#20/既有W12衔接。管理员通过团队Secrets注入凭据，不通过聊天；没有设备/OS/服务时记未测，沿原门禁暂停相应宣称。

**文件**：conformance drivers/fixtures/reporters、SDK/MCP smoke、Runner集成、docs Agent guide/operation matrix及发布说明；若改代码必须运行其消费者checks。无新业务功能，不修改UI设计；Human前提通过已有经授权REST/客户端演示。

**真实客户端链**：从新建授权Connection到规划→接单→执行→协作→批准→Git/证据→停止/重试与完成的两条演示；含无Git项目链（不判repository unmet），和有Git交付链；两人两Agent交接及撤权；企业受限出网/内网Git只有实际部署支持时验，不能用fixture等同实机。

**测试落点**：`packages/conformance/src/drivers.ts/runner.ts`、新增前述conformance文件、SDK测试、MCP smoke、Runner permission/isolation；不会为纯方案再次运行这些未来测试。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 两类真实客户端用完整工具序列完成同一事务语义，返回资源/证据可由Human读；至少无Git核心、有Gitfake交付两路径；OS/客户端实测矩阵明确 |
| 越权/撤权 | 跨两Human/两Team/两Agent的读取正对照与拒绝、live撤权、Connection轮换overlap身份；无Human cookie/secret输出/活动泄露 |
| 非法状态 | 已停/失败Session不得普通写；unsupported/feature-disabled/protocol mismatch可恢复核心查询；重试是新Session不复活旧事实 |
| 幂等 | 网络断开/MCP重连/API重启仍同操作身份；重复计划/消息/外部intent不双事实；logical新intent不被旧key吞掉 |
| 旧revision | 两客户端同时改Plan/Document/Issue，旧版本得到同错误；读当前值后明确合并，不能默默覆盖 |
| 事务失败 | 演示下游实际rollback及结果证据，整体不标完成；ADR0068 settle＋Session completion一起失败回滚，明确拒绝后仅Turn settle要给可见warning |
| 重放 | 回放webhook/outbox/inbox/event，作用域/受众与统计不重复；协议fixture结果和真实客户端记录分列 |
| 并发 | 多Connection/Session与Runner attempt不串token/bridge、独立审查不混producer；Stop/撤权与动作提交次序明确 |
| 重启/恢复/Stop | MCP/API/Worker/Runner分别重启、durable cursor resync、lease丢失/过期、准确外部unknown对账、清理资源归属和Stop_ACK；不借模型回答宣称领域完成 |

**任务DoD**：推荐选定画像/客户端矩阵按实际结果全链成功，未测或依赖H/凭据步骤明确。交付内容包括实现范围/文件/迁移/API/events/实际检查/演示/限制/规格偏差、精确head及证据；Required CI与旧门禁不被协议报告替代。
