内置 WebUI 与 Service Worker 退役后，WorkMesh 直接交付 API/MCP。签名 Skill 迁入 API 镜像，通知使用鉴权 API 链接并保持旧摘要及不确定投递边界；部署、镜像、发布、恢复和 Required CI 移除 Web 依赖，迁入必要后端验收。

当前为实施检查点，尚待完成产品验收与正式成果独审。请从 docs/reviews/backend-retirement/README.md 查看准确方案、原件保全、浏览器断言去向、首败和清理证据。

已通过构建、类型、lint、CI 门禁、81 项数据库集成以及定向通知/审批测试；宿主运行时及最终完整结果见 test-results.md。后续集成准备发生实际磁盘同步超时，生产/Lite/开发镜像首轮中止原因保留。未验证项不写通过，不合并或标 Done。

Saved plan 与历史规格原字节保留。无数据库迁移、B3、新领域、真实外发或凭据申请。
