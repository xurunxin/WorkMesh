# 部署验证夹具

`deployment-probe.mjs` 复制到生产 deploy 产物根目录后运行，读取该产物的 `dist/model-presets.js`。使用非 root 用户，将产物挂到 `/app:ro`、完整目录挂到 `/etc/workmesh:ro`，设置 `C3_EXPECTED_VERSION` 对应文件的目录标识。它断言内置九条、部署整体替换、禁用优先、关闭时不读缺失文件、坏路径失败、拒绝写入、冻结目录和并发读取前后文件原字节一致。

实际启动命令为 `docker run --rm --user 10001:10001 -v c3test-deploy-01a11890:/app:ro -v c3test-presets-01a11890:/etc/workmesh:ro -w /app -e C3_EXPECTED_VERSION=deployment-first --entrypoint node workmesh-api:latest c3-deploy-probe.mjs`。替换专用卷中的部署文件后，新进程使用 `deployment-next`，验证下次启动读取新目录。实际结果、完整文件 SHA-256 和编译模块字节比较见执行日志归档。

`convert-test-junctions.mjs` 只用于本轮 Windows deploy 的 Linux 测试副本：设置 `C3_WINDOWS_DEPLOY_ROOT` 与 `C3_WINDOWS_WORKSPACE_ROOT` 后，将副本内 Windows 绝对 Junction 换成 `/app` 包内相对链接。它不修改编译模块、不用于发布镜像。新验证优先使用正式 Linux 镜像构建；Windows 本地执行 deploy 准备脚本前必须复制成独立字节副本，不能修改与工作区共享硬链接的包声明。

本轮没有构建或发布新 Docker 镜像；使用已有 `workmesh-api:latest` 作为 Linux Node 运行环境。所有目录和服务均为本任务专用测试资源，结果保全后已清理，复验应重新创建专用资源。
