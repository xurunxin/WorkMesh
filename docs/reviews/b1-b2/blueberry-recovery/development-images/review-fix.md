# PR221 开发镜像独审修正

## 审查结论与最小修正

本轮正式独审针对 `eb67b765bf30639000b2c002cbfeaf78b6ca8bec`，确认 CI451 的13项检查及三系统原件绑定成功，但发现开发镜像安装前缺少连接器 postinstall 脚本，判为 blocking。CI451 的成功不覆盖该路径，也不代替本轮新提交验证。

`infra/docker/api.Dockerfile`、`web.Dockerfile`、`worker.Dockerfile`、`mcp.Dockerfile` 在连接器 manifest 后、正常 `pnpm install` 前均增加：

```dockerfile
COPY --chown=workmesh:workmesh apps/connector/scripts/prepare-native.mjs apps/connector/scripts/prepare-native.mjs
```

连接器 manifest 仍为 `"postinstall": "node scripts/prepare-native.mjs"`；四文件仍使用 `pnpm install --frozen-lockfile --store-dir /pnpm/store`，之后才 `COPY . .`，没有跳过安装钩子。

检查当前安装前 manifest 闭包时，发现这些镜像已有的 API 等 manifest 引用的 workspace 包未全部复制。只补齐其现有依赖输入，不改依赖版本或 lockfile：

| 文件 | 补齐的 manifest |
| --- | --- |
| api.Dockerfile | recovery |
| web.Dockerfile | a2a-adapter、artifact-storage、git-provider、recovery |
| worker.Dockerfile | a2a-adapter、recovery |
| mcp.Dockerfile | a2a-adapter、artifact-storage、git-provider、recovery |

对应原文为以下各行，按上表用于必要文件：

```dockerfile
COPY --chown=workmesh:workmesh packages/a2a-adapter/package.json packages/a2a-adapter/package.json
COPY --chown=workmesh:workmesh packages/artifact-storage/package.json packages/artifact-storage/package.json
COPY --chown=workmesh:workmesh packages/git-provider/package.json packages/git-provider/package.json
COPY --chown=workmesh:workmesh packages/recovery/package.json packages/recovery/package.json
```

这是现行依赖清单核对，不冒本机已运行到 workspace 安装报错。产品协议、秘密存储、Schema、迁移、API、事件及原验收断言未改。

## 本机真实首败与清理

Blueberry 实际执行旧位置 `python docs/reviews/b1-b2/blueberry-recovery/development-images/verify-builds.py`，注册准确 index tree `1c92a58c237b2071fdf21e8e0de4691f7aba3904`（仅四处脚本 COPY 的初轮状态），base HEAD 为上述 eb67。该入口随后移至 `scripts/validate-development-images.py`，不重写历史命令或来源。

Docker Desktop 4.94.0、Engine 29.8.2 Linux amd64、buildx 0.37.2；首次真实 API 构建在下载 `node:22-alpine` 基础镜像时退出1，首个实际错误为：

```text
tls: received record with version e414 when expecting version 303
```

尚未执行 pnpm 或连接器钩子；web/worker/mcp 未运行，不填通过。完整原日志按逻辑路径 `development-images/wm-connector-dev-a8998e998789/api.log` 保存于上级无损原件归档，其长度与 SHA 见同目录 builds.json。日志中的公开 Docker blob 下载地址不含 WorkMesh 凭据；没有改变系统代理、TLS 设置或用户配置来重试。

本任务 builder `wm-connector-dev-a8998e998789` 已通过 `docker buildx rm` 正常移除；准确容器 `buildx_buildkit_wm-connector-dev-a8998e9987890` 和卷 `buildx_buildkit_wm-connector-dev-a8998e9987890_state` 已实核不存在，四个任务镜像标签均不存在。原始 registration/builds/builder-before-cleanup/cleanup/result JSON 保留于该目录。已有12个其他任务镜像、共享基础镜像和共享 build cache 均保留，没有全局 prune。历史保护目录、当前工作树与隔离依赖保持原门禁。

## 实际构建验证接线与当前状态

现有 Source gates 增加 `python3 scripts/validate-development-images.py`。它以准确 Git index tree 的完整已跟踪文件为上下文，串行执行四个完整开发镜像构建，检查实际镜像和正常 postinstall 完成行；独有 builder、镜像 owner/tree 标签、原始日志摘要及定向清理回执随现有 `ci-logs` 上传。后续命令加 `--no-cache`，四个镜像各自真实执行安装及钩子。任何构建、安装钩子或清理失败均返回非零，不使用模拟、skip、ignore-scripts 或 continue-on-error。

新增 CI 接线反例验证删除步骤、条件跳过、吞掉失败和以 help 代替执行必须拒绝。准确 Node22.19.0 下 `scripts/validate-ci.mjs` 成功，`node --test scripts/ci-policy.test.mjs` 19/19 成功、零 skip；Python AST、四 Dockerfile 安装前输入闭包与复制顺序核对成功，`git diff --check HEAD` 成功。这些检查不替代实际四镜像构建。

本修正尚待新提交自身的真实四镜像、三系统及完整 Required CI。只有实际构建成功才能关闭此 blocking；随后仍须正式成果复审、Chief 确认和 actual main 落地，不提前 Done 或推进 #7/#20。最终 run、准确 head 和逐镜像结果由后续证据追加，不在本文件中猜测。

## CI452 的实际结果及验证入口修正

[CI452](https://github.com/xurunxin/WorkMesh/actions/runs/38152839623) 精确 head `d553fcf22a2118758d3eb17cfbd409daa4b76487`：其余11项检查成功，Source gates 与 Required CI 失败。Source gates 的 lint/typecheck/build/unit/Compose 均成功；实际 API 和 Web 镜像构建成功，正常 postinstall 均有执行和 Done 原行。Worker 镜像 buildExit/archiveExit 均为0，但安装层在同一新 builder 中复用了缓存，原文为：

```text
#22 [base 24/25] RUN --mount=type=cache,id=workmesh-worker-pnpm-store,target=/pnpm/store,sharing=locked   pnpm install --frozen-lockfile --store-dir /pnpm/store
#22 CACHED
```

Worker 没有本次钩子原行，验证器按原要求返回1；MCP 未运行。不能说 Docker 安装失败，也不能说四镜像完整通过。下一轮仅为验证命令增加 `--no-cache`，不改 Dockerfile、钩子、原 pnpm 安装命令或成功条件。

失败原件位于 `ci452-development-artifacts/`，receipt 绑定 artifact11707104833、完整下载ZIP摘要和所选原字节，verified=false。三个成功产出的任务镜像 `wm-connector-dev-4fffcfed8d6c:{api,web,worker}` 已逐个按 owner/image ID 校验后删除，MCP 标签未产生；builder、准确容器及 `_state` 卷已移除且实核不存在，详见 cleanup.json。没有全局 prune。

`ci452-artifacts/`、`ci452-native/` 和 `ci452-source-equivalence.json` 保留实际三系统成功及各1104文件前后原字节、Git blob、checkout `8ff05878b8bf72f5d3391097eedba33ea3ab69c0` 的 tree/parents 绑定；Windows 临时账户 `wmctd7b165d72f9c` 与 `C:/Users/Public/workmesh-connector-3e82bcb6437643e8b715e1357bded267` 实际移除、errors为空。不以这些成功替代失败的汇总门禁。后续源改变后仍须新完整CI。

本机五份 JSON 首次普通暂存被 Git 换行转换；已为准确开发镜像原件路径增加 -text 与限定 CR 行尾属性，并用 `git add --renormalize` 强制重暂存，逐文件比较 index blob 与原始工作树字节全部一致。没有改原日志、下载 receipt 或全仓空白规则。后续工件同样按准确原字节核 index，首败阻断提交。
