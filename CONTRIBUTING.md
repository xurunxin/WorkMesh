# 贡献与交付

## 接口与功能变更

先读 AGENTS.md 指定的现行合同。接口或功能改动同次更新 [API/MCP 手册](docs/integration/README.md)、配置、参考与可运行示例；具体步骤见[同步规则](docs/documentation-maintenance.md)。中文文档使用[固定写作技能](docs/skills/zh-tech-writing/README.md)。

## 交付检查

提交说明写明实现范围、文档路径、迁移/API/事件变化和实际验证。执行仓库规定的 lint、typecheck、unit、integration 和 conformance；记录准确源码、命令、环境、失败、未测与资源归属收尾。独立审查闭合 blocking/high，最新适用 Required CI 成功后，沿项目正常 review/merge 流程交付。

后续任务的用户验收项核变动后的操作和说明，自动检查结果另记。秘密使用受保护存储；不提交真实凭据，不擅自调用第三方或清理共享数据。文档测试使用独有 test 数据库，不能对业务库执行 reset。
