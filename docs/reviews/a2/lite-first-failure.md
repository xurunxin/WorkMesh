# Lite 首败及环境修正

运行 `a2-lite-c4424791` 精确输入为 `3a30e30985b2de92d4dde90d566833297da94cde`。Linux 镜像构建、四个角色入口加载、Web readiness 和 save/load 镜像身份检查均完成；入口探针使用不可连接的数据库，不代表角色功能安装通过。

compose `up --wait` 实际退出 1，日志 `16.log` 报测试 CA 临时文件未在 Docker Desktop File Sharing 中共享。尚未启动安装服务，也未执行 A2 Lite 浏览器用例；本次不能推断 RustFS 凭证映射已被验证。原件、资源归属与逐路径收尾均在该 run 下保留。

测试入口修正为创建独有、带任务归属标签的外部 CA 卷，经 `docker cp` 仅复制公开 CA，Worker 只读挂载并继续使用 `NODE_EXTRA_CA_CERTS`。证书私钥仍只在本任务 HTTPS 夹具内存与独有临时目录；不修改 Docker Desktop 全局共享配置、原 Lite compose、RustFS 凭证映射或 TLS 验证。卷不存在与归属先核验，清理前确认没有容器引用。

角色探针原来的 `WORKMESH_*` 前缀名单会包含继承的无关环境变量名称，已改为明确的测试变量名单。原运行保留此输入边界，不声称只注入了测试变量；所有探针容器已清理，日志不包含变量值。新实际运行须绑定修正后精确提交，不将原镜像或入口检查冒作新安装通过。
