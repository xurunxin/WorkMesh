# Lite 纯后端部署

Lite 镜像包含 API、worker 和 migrate 三个角色。PostgreSQL、Redis 和对象存储在设备运行；MCP 与外部 Runner 在独立机器运行，使用设备直接发布的 API。当前没有 Web 角色、Next 构建、页面、代理或 Service Worker。

## 构建与无源码安装

在源码工作站构建准确提交，将镜像与 Compose、私有环境文件搬到设备；设备不需要源码、Node 或 pnpm。

```powershell
$sha = git rev-parse HEAD
docker build --build-arg WORKMESH_BUILD_SHA=$sha -f infra/docker/lite.Dockerfile -t "workmesh-lite:$sha" .
docker save -o workmesh-lite.tar "workmesh-lite:$sha"
```

Linux Docker 环境用 `sh infra/lite/verify-image-roles.sh "workmesh-lite:<准确SHA>"` 验证角色、硬化、秘密预检和入口加载。源工作站可运行 `node scripts/verify-a2-backend-lite.mjs` 做完整无源码安装、save/load、TLS、真实部署 worker 及签名 Skill 验收，结果保存在本轮独有验收目录。真实低功耗硬件与真实厂商不由该本机测试代验。

设备目录只放 `docker-compose.lite.yml` 与 `.env.lite`。参考 `.env.lite.example`，替换全部秘密与准确镜像引用，配置 `WEB_ORIGIN=http://<设备地址>:3001` 和独立 MCP 的 `PUBLIC_MCP_ORIGIN`。

```sh
docker load -i workmesh-lite.tar
docker compose --env-file .env.lite -f docker-compose.lite.yml config --quiet
docker compose --env-file .env.lite -f docker-compose.lite.yml up -d --wait api worker
```

API 端口为 `API_HOST_PORT`，默认 3001。首次安装、登录与 Cookie/CSRF 管理见 [API/MCP 启动与安装](../../docs/backend-only-deployment.md)。S3 端口默认 9000，PostgreSQL 和 Redis 不对外发布。公开对象入口须按现有签名传输合同配置；不要公开管理入口。

## TLS、MCP 与 Runner

持续部署在 API 前终止 TLS，设置 `WEB_ORIGIN` 为对外 HTTPS API origin，启用 `SESSION_COOKIE_SECURE=true`。反向代理直接转发 API、SSE、发现和固定 Skill 下载；没有 Web 上游。MCP 的 `/mcp` 使用独立 HTTPS origin。

Runner 使用 `WORKMESH_API_URL=https://<API origin>`，沿用安装凭据与服务凭据合同。私网 HTTP 仅在原有显式允许开关下使用；不把该开关用于公开部署，也不让 API 进程执行不可信代码。

## 升级和恢复

导入通过验收的新镜像，更新 `WORKMESH_LITE_IMAGE` 和准确 `WORKMESH_BUILD_SHA`。首次从含 Web 的旧栈升级时，先按 [旧 Web 容器退役](../../docs/backend-only-deployment.md#旧-web-容器退役)核对 project、service、配置路径和完整容器 ID，再定向停止、移除旧 Web。普通 `up` 会保留旧 Web 孤儿容器，不能用于这一步。

保留原 Compose project 与业务卷，再运行同一安装命令。migrate 完成后才启动 API/worker。API 承接旧端口前须完成 Web 退役，并同步 `API_HOST_PORT` 和 `WEB_ORIGIN`。更改 schema 的回退必须依据 [完整备份与恢复](../../docs/operations/disaster-recovery.md)；本次退役没有新增数据库迁移，不删除业务数据或重建业务卷。

```sh
docker compose --project-name <原project> --env-file .env.lite -f docker-compose.lite.yml up -d --wait api worker
```

三角色保留非 root、只读文件系统、capability drop、秘密预检、健康检查和退出约束。模型预置、领域 feature 和通知能力保持原默认值。`pnpm validate:lite:self-test` 校验 Compose 变量与硬化合同，不能代替真实安装验收。资源仅在归属、活动引用和清理范围确认后收尾，不清共享 store、配置或其他任务资源。
