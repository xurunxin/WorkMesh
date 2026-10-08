# Lite 安装代理根因与修补

第二轮 `a2-lite-9b8957e6` 的真实镜像来源为 `bab2599f42de771800d3d9173c5885166a30f93e`。Compose 启动、四角色、镜像 save/load、测试 CA 命名卷和无源码挂载检查成功，但原安装用例失败。Web 日志显示安装状态和安装 POST 被代理到容器自身的 `localhost:3001`，产生 `ECONNREFUSED` 和浏览器 500；实际 API 在独立 `api` 服务的 3001 端口。该轮不是安装通过。

`apps/web/next.config.ts` 在构建时读取 `NEXT_API_UPSTREAM`，缺失时使用开发默认 `http://localhost:3001`。Next 将 `rewrites()` 的返回值固化到 `routes-manifest.json`；运行时 Compose 虽设置 `NEXT_API_UPSTREAM=http://api:3001`，不会重算此文件。`infra/docker/lite.Dockerfile` 原构建阶段只设置 `NEXT_PUBLIC_API_URL`。运行时配置通过 guard 和 Web `/readyz` 只能证明变量声明和服务存活，不能证明代理目标正确。

修补仅在 Lite Docker 构建阶段设置其现有 Compose 内部上游 `http://api:3001`，保持浏览器相对 API 地址、原五个代理前缀、同源认证、API 端口和服务名、四角色、非 root 与只读 rootfs。修正 Compose 和部署说明对构建与运行时的描述；不修改 Next 通用开发默认、生产发布类镜像、认证或协议，不在启动时改写只读镜像。设备外部地址变化仍无需重建镜像。

`scripts/verify-a2-lite.mjs` 在真实 Web 镜像内读取编译后 manifest，逐项核 `/api`、`/.well-known`、`/auth`、`/mcp`、`/sse` 的精确目标。真实 Compose 启动后，经 Web 请求安装状态，必须得到 200 与 `installed=false`；随后仍由原 `@lite` 浏览器用例完成安装、认证、缺配置、逐项补齐及横幅消失。HTTPS Gitea 原件和生产 Worker 保持 TLS 校验，仅信任本轮测试 CA，不替代代理或安装 API。

两轮首败、CA 卷修订、环境白名单、归档映射和逐资源清理回执保留。新结果绑定新镜像 SHA；旧产品通过仅支持字节未变的输入。原 RustFS 安装风险不先验填通过，真实低功耗设备与真实厂商仍独立未验收；五项视觉差异仍等待人工评审。

## 实际重验

`a2-proxy-a5b51ab5` 的配置测试、脚本语法、Lite Compose 校验与 16 个反例、`ci:validate` 全部退出 0；前后源码原字节不变。

`a2-lite-333f7614` 构建 `bb86b1fe31e9b23f6e91171b526c860a0a0fcb22`，实际镜像 ID 为 `sha256:edb6ceca231ce39067dc940aab92e5da4c19a1fa260f092cfb25d410512d6c7c`。四角色加载与 save/load 同一 ID，镜像内五条代理目标全部正确。无源码 Compose 启动成功，经真实 Web 返回安装状态 200/`installed=false`；原 `Lite 安装后逐项补齐直到横幅消失 @lite` 用例实际 1 项通过（10.7s），退出 0，真实安装与认证、显式配置及生产 Worker HTTPS 解析完成。关键宿主输入的浏览器前后字节一致；结果不扩张为真实设备或厂商兼容承诺。

本轮所有登记的专用 Docker 资源清理成功，HTTPS 夹具关闭，安装目录逐路径回执为退出 0 且不存在。完整命令、原失败、编译规则和收尾在 `runs/a2-lite-333f7614/receipts.json` 及逐项日志/路径清单；不以此覆盖前两轮首败。
