# 换机接手：远端成果、环境部署与暂停边界

用户17:06要求本轮结束后暂停后续任务，随后补充要求实际提交成果以便新环境部署。**本轮清理及独审/准确最新 RequiredCI 后的条件合入完成后，停止推进，等待用户换机接入并明确恢复。** 本轮没有配置新机器、迁移秘密或启动后续业务任务。

## 从远端取得成果

仓库为 `https://github.com/xurunxin/WorkMesh.git`，交付分支为 `tds/conv-01a129ad-6e0b-7f8f-bf12-5bbdf4b192b5`。最终准确提交及合入状态以本轮回复/PR为准，不用旧 `origin/main` 或旧1266审查判断。用户在新机器使用自己的 GitHub 访问，切勿在聊天、命令行URL或仓库内放访问密钥。以下命令由用户选定新目录后执行，本轮没有代为克隆：

```powershell
git ls-remote https://github.com/xurunxin/WorkMesh.git refs/heads/main refs/heads/tds/conv-01a129ad-6e0b-7f8f-bf12-5bbdf4b192b5
git clone --branch tds/conv-01a129ad-6e0b-7f8f-bf12-5bbdf4b192b5 https://github.com/xurunxin/WorkMesh.git WorkMesh
Set-Location WorkMesh
git rev-parse HEAD
git status --short
```

将 HEAD 与本轮交付提交核对。若 PR 已合入且准备从 main 开始，改用 `git clone --branch main ... WorkMesh`，并确认最终交付提交是 main 的祖先；不能以仅抓到旧1266为本轮成果。不要将旧未验收业务分支当 main：历史未合代码只按下述映射恢复到需要审阅的新工作区，不自动接受或运行。

三个删除前不可变保全检查点已实际推送：`b7e9f24554e4b6031c035f66f6db299a725ad7c6`（全14目标预检及必要保全）、`ea03a90785ab95cc1f59f597c0fed60060bd71b4`（精确共享文件身份门）、`81cb45463504234ebdd23414c10e11e8011567b4`（一个未派发删除的活动门暂停后，新预检/源码绑定）。最终交付还包含之后的真实删除回执和后验，不以这些预检提交代替最终提交。

## 保全和清理入口

本目录 [report.md](report.md) 汇总实际回收、剩余精确ID及原因；[preservation-verification.json](preservation-verification.json)、14份 `final-mapping-<UUID>.json.gz` 和 [unique-final-sanitized.zip](unique-final-sanitized.zip) 是必要独有代码及脱敏证据入口。每路径分别绑定准确 Git blob/远端原分支、已有 ZIP member、新脱敏 member 或已验证重建输入。Git LF与Windows运行字节的长度/哈希转换分列；恢复时遵循具体映射，不整体解压覆盖源码。保全未验收代码不代表业务验收完成。旧历史报告和原回执继续保留。

只有本机准确项目根、immutable 账本和受控当前会话能使用 `execute-target.ps1` 等清理执行脚本；**新机器不要执行历史删除命令或搬用旧绝对路径**。永久拒绝父目录、当前构建及剩余容器/业务卷见报告；它们没有被当作全清成功。共享安装、原CAS及镜像留在DarkFlame，没有打包传给新机器。

## 可移植的依赖准备

优先使用新机器已安装的 Git、`.node-version` 锁定的 Node **22.19.0**、`package.json` 锁定的 pnpm **9.15.4** 和可用的 Docker Compose v2。本机测试实际用 Node24.20.0，不冒它就是新机器应装的版本。缺工具时由用户在恢复工作后按当地管理方式准备；本轮无工具安装或新秘密授权。Python3是可选只读计划入口的依赖，不是 WorkMesh 服务运行依赖。

```powershell
node --version
pnpm --version
docker version
docker compose version
git status --short
```

实际 pnpm 版本必须9.15.4；启动器可能切换/下载版本，不能凭 PATH 名称推断。用户选择当地共享 store 基目录，例如 Windows 用户缓存的独立目录，或 Linux 用户缓存目录；不要照搬 DarkFlame 的 `X:\packages\.pnpm-store`。可选的只读计划脚本不依赖平台工作树 UUID，也不安装或读 `.env`：

```powershell
$workmeshStoreBase = Join-Path $env:LOCALAPPDATA 'workmesh-pnpm-store'
python -B docs/reviews/cleanup/2026-10-11-worktrees/post-m4/full-cleanup/new-machine-plan.py --store-base $workmeshStoreBase
```

Linux/macOS 从仓库根执行 `python3 -B <相同仓库相对脚本路径> --store-base "$HOME/.cache/workmesh-pnpm-store"`。输出是命令数组、实际HEAD/锁哈希和未验证限制；只读计划不证明当地依赖或服务就绪。首次安装只用于干净新克隆，不覆盖已有环境。

确认版本后，优先尝试已有缓存离线准备，私有依赖目录使用本克隆的 `.tmp/workmesh-virtual-store`；不同任务不得共用这一目录：

```powershell
pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir $workmeshStoreBase --virtual-store-dir .tmp/workmesh-virtual-store --package-import-method=copy --side-effects-cache=false
```

离线缺包时保留真实失败，不算部署完成。新机器冷缓存需要在用户明确恢复后允许联网，再用同一 store、同一私有目录进行完整安装：

```powershell
pnpm install --frozen-lockfile --store-dir $workmeshStoreBase --virtual-store-dir .tmp/workmesh-virtual-store --package-import-method=copy --side-effects-cache=false
git diff --exit-code -- package.json pnpm-lock.yaml
```

完整安装允许仓库锁定依赖的生命周期脚本；离线 `--ignore-scripts` 只是准备阶段。本轮没有在新机器执行这两个命令，也未验证完整新业务环境。共享CAS/下载缓存减少重复下载；copy隔离可写依赖仍可能占用必要副本，不承诺零重复字节。详见 [rebuild-rules.md](rebuild-rules.md)。后续各任务只共用当地store和公共工具/镜像，自己的 node_modules、构建缓存、配置、测试容器/卷和秘密均隔离。

## 建立和验证开发环境

推荐先采用仓库现有源码容器栈，避免宿主运行的 `localhost` 与容器内 `postgres/redis/minio` 地址混用。以下是用户恢复后在新机器执行的流程，**本轮未部署新栈或迁移旧数据**：

1. 用 `.env.example` 创建本地忽略的 `.env`，按该模板及 [README clean start](../../../../../../README.md) 填新环境的独立随机秘密、首次安装token、游标密钥环和32字节加密key；可用 `pnpm bootstrap:token` 在用户自己的终端生成初装token。秘密只保当地安全配置，不入Git、不在聊天提交，不从旧机复制凭据。本轮不提交任何实际秘密值。
2. 保持开发端口回环绑定。模板涉及镜像发布的 `CHANGE_ME` 字段不是本轮已经发布的镜像；源码栈使用本仓库Dockerfile，生产环境另读 [生产部署](../../../../../../docs/production-deployment.md)。核配置使用 `--quiet`，避免展开秘密。
3. 在全新克隆专用 compose 项目执行下面命令；不在现有业务数据目录上重建或清卷。`minio` 服务实际镜像是 RustFS；`minio-init` 建Object Lock bucket，migrate一次性服务在API/worker之前执行。共享Docker已有镜像和BuildKit下载层；各Dockerfile现有cache ID按服务分开，本轮未改为全服务同一缓存，也未声称容器安装零复制。

Windows 首次建配置可执行 `Copy-Item -LiteralPath .env.example -Destination .env`（先确认没有既有 `.env`），Linux/macOS 为 `cp .env.example .env`；完成当地秘密配置后检查 `git check-ignore .env` 确认忽略。不要运行会打印整个配置/秘密的 `docker compose config` 或把 `.env` 加入提交。

```powershell
docker compose -p workmesh-dev --env-file .env config --quiet
docker compose -p workmesh-dev --env-file .env up --build -d
docker compose -p workmesh-dev --env-file .env ps --all
Invoke-WebRequest http://localhost:3001/readyz
Invoke-WebRequest http://localhost:3000
```

预期 postgres/redis/minio 健康，minio-init与migrate正常exit0，API readiness为200、web可访问；在web使用新初装token建立首个管理员。可以另外显式选择 `pnpm db:seed`，但只能在准确新开发数据库且设独有 `SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD` 时运行；不自动seed，不恢复旧业务DB。MCP/Runner默认额外配置按 [agent integration](../../../../../../docs/agent-integration.md) 处理，不把容器启动等同四客户端验收。

宿主 `pnpm dev` 是另一种开发方式，须分别配置真实宿主可达 DB/Redis/S3 地址并加载环境；现有默认 Compose 的redis没有宿主端口，不能直接把模板 `redis://redis:6379` 用于宿主服务。本轮没有新增端口或更改既有业务容器；需要宿主调试时先制定专用本地服务配置。

代码检查入口是 `pnpm lint`、`pnpm typecheck`、`pnpm test`。集成和E2E只用独立名字含`test`的数据库并按README设置 `RUN_INTEGRATION=1`，再执行 `pnpm test:integration`、`pnpm test:e2e`；这些测试会重置测试数据，不能指向开发/业务数据库。新机器依赖安装、Docker build、服务就绪、初装和产品全套检查都须在新机器实际验证，本轮不宣称已通过。此说明的仓库脚本、锁、Compose和配置来源已只读核对。

## 本机专用路径与结束后暂停

`rebuild-environment.py` 是DarkFlame平台会话专用入口：核 `C:\Users\xurx\.tds\workspaces\<UUID>`、已有pnpm9可执行和真实 `X:\packages\.pnpm-store\v3`，专属virtual store位于 `X:\packages\workmesh-task-virtual-stores\<UUID>-<lockHash>`。它在新机器普通clone上应拒绝，不是迁机部署入口。使用上面的可移植命令/只读计划即可；不要为了跑旧工具重建这些绝对路径。旧清理证据的Python3.13/PYC原件也不用于启动新服务。

本轮受保护的当前构建和3个X卷测试环境只登记，未删除自身。原系统拒绝父目录及39个缺owner/重建账本的r1容器、8个默认compose业务容器逐项列在报告。没有泛称所有环境已清空。

本轮交付、独审和准确最新RequiredCI后的条件合入是这次唯一剩余推进范围。**结束后不启动待办、不追加清理、不自行配置新机器或迁移秘密；等待用户换机接入并明确恢复。** 未来恢复时先重新读取远端main和当地资源，而不是沿用本轮快照。
