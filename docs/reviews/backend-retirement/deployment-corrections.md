# 成果独审部署修订

审查输入为 `9a61621863fe7f95d247c097709727bb247d8fff`。本轮修复三项部署阻断；已审方案、Saved plan、用户答复和历史证据保持原字节。远端 main 独立读取仍为 `f2591a3bebeca9640b0d828ac3ad07fb5daf8e3c`，为本分支祖先。

## 准确生产镜像与冷缓存

`scripts/verify-a2-backend-lite.mjs` 对传入的镜像先执行 `await must('docker', ['pull', supplied])`，再核指定 digest、镜像 ID 和准确 OCI revision。既有 save/load、真实 API/worker/MCP、TLS 和签名 Skill 验收继续执行。

私有构建模式在 Linux 必须执行 `scripts/verify-production-cold-cache.mjs`。它创建只绑定 `127.0.0.1` 的 registry，将本轮三个同源镜像放入独有命名空间。删除本轮 registry tag 后，逐镜像证明准确 digest 引用在本地不存在。共享层缓存保留，测试针对缺失的镜像引用，不宣称磁盘层缓存为空。

测试用 Docker 包装器只将独有 GHCR 命名空间映射到回环 registry。它不修改生产镜像规则或 Docker 设置。实际 `--env-file` 入口仍执行 Docker pull、digest/ID/SHA 检查、save/load、真实服务安装和协议调用；映射命令单独记录，不当作真实 GHCR 发布或厂商验收。脚本按完整容器 ID 和任务 label 收尾 registry、私有卷、镜像别名及临时文件，借用的源镜像和 registry 基础镜像保留。

## Lite 默认外部地址

`.env.lite.example` 的 `API_HOST_PORT=3001` 与 `WEB_ORIGIN=http://CHANGE_ME_lan_address:3001` 一致。`scripts/validate-lite-compose.mjs` 同时校验 origin、样例端口和 Compose 默认值。自检新增旧 origin 端口和旧发布端口两种拒绝例。

## 原栈 Web 容器与业务卷

`scripts/retire-legacy-web.mjs` 接受原 project、全部准确 Web ID、旧配置和工作目录标签。它拒绝未列出的 Web、身份变化或非零停止结果。仅执行 `docker stop --time 35` 和无 `-v` 的 `docker rm`；不删其他服务、网络或卷。

Lite 与生产说明都先指向上述步骤，再要求沿用原 project。API 接管原端口前，必须确认 Web 已停止且准确 ID 已不存在，保留原业务卷。原数据库升级屏障继续适用。

两类真实部署脚本先启动自己的数据服务，写入 PostgreSQL 持久标记，再启动占用未来 API 端口的旧 Web 拓扑夹具。夹具只是旧 HTTP 进程，不冒作历史 Next 功能验收。定向退役后，新 API 使用同一端口；数据库卷名称和 SQL 标记保持，并继续完成安装、真实 worker、Skill 和生产 MCP 验收。

## 实际验证与关口

本机 `node --test scripts/retire-legacy-web.test.mjs` 的 9 项安全正反例通过，含回执遮蔽旧环境、启动参数、任意标签和卷驱动选项。既有 CI policy 20 项通过；Lite 自检 18 种违反合同的变体全部拒绝。JavaScript 语法、CI workflow 与发布 workflow 校验通过，`git diff --check` 通过。

本机最终 `pnpm ci:test` 的 29 项通过，`pnpm ci:validate` 通过。`legacy-web-local.json` 保存真实 Docker 的定向退役、同端口重新绑定和卷内标记保留；本轮替代进程及私有卷均已核归属并清理，后置不存在成立。`legacy-web-projection-local.json` 复验最后的回执遮蔽，绑定脚本规范 LF 哈希，并证明 Web 已移除、卷在退役后保留及测试卷的定向收尾。这两份回执使用 BusyBox 夹具，不代替真实 API/worker/MCP 部署验收。

被审提交的 CI `38185745002` 已完成成功。它不包含本轮修订，不作为冷缓存或升级验收结果。修订后的完整镜像、冷缓存 `--env-file` 与两类原栈升级测试交最新适用 Required CI 执行，实际结果另行追加，未执行不标通过。

提交 `969d0df1f2877f892212cc429bafd914536cce78` 的运行 `38186988150` 因随后保留非 Linux 命令兼容的修订而取消，不计通过。取消时源码 job 尚未执行开发镜像和部署步骤，没有创建这些步骤的 Docker 测试资源。Linux 必需源码 job 继续完整执行冷 registry 夹具；其他宿主明确记录未在本机执行该夹具，不冒冷缓存通过。

提交 `f05651b7b6483fe113e1b999bbe9c8d47223e0c8` 的运行 `38187274436` 在冷缓存子流程失败，Required CI 正确拒绝。原 ZIP `11720670386.zip` 与 `deployment-failure-471.json` 保留首败：Lite 和私有生产安装均完成旧 Web 退役、同端口 API 接管、SQL 标记保留及真实接口验证；冷缓存子流程尚未进入安装，不标通过。

失败原因为固定静态模式负例继承了父进程的 Coordination 开关。修订将该固定 Compose 夹具明确设为 `WORKMESH_BETA_COORDINATION_MCP: 'false'`；既有 Coordination 正例和真实部署模式保持。未拉取的测试别名按“已不存在”记录，不发起无效删除；创建和清理的不存在证明均核对 Docker 明确错误，不以任意非零退出冒不存在。后续完整运行继续要求冷缓存三镜像拉取和真实部署成功。

## 完整复验结果

产品提交 `d0d78d408f2395f2dfebe8972710a6b635982ddf` 的 CI `38188956194` 全部 11 个 job 成功，含 Required CI。实际 PR 合成检出为 `241abaae6a7f3cdcac94b3709ad59dd16a92bd76`，父提交为原 main 和该产品提交；tree `099f4e6a72a6b47adcd862efe3e6e03b61b0fa27` 与产品提交一致。三平台各 651 个源码文件前后稳定，原件与核验见 `ci-artifacts/verified-deployment-472.json`。

源码 job 实际执行 `node scripts/verify-a2-backend-lite.mjs` 和 `pnpm validate:production-images`。后者再由冷 registry 子流程执行 `node scripts/validate-production-images.mjs --env-file=<本轮私有镜像引用文件>`。准确命令、参数及退出码均在原 ZIP `11721436996.zip`。

| 实际运行 | 结果 |
| --- | --- |
| Lite `backend-lite-72a9a0f1` | 旧 Web ID 已不存在，同端口 API 启动；原数据库卷和 SQL 标记保留。安装、Cookie/CSRF、幂等、真实 worker 上下文、save/load、TLS 及 Skill 通过。 |
| 私有生产 `backend-production-7990e138` | 同样完成 Web 退役与数据保留；三个同源镜像、真实服务及 MCP 验证通过。 |
| 冷缓存生产 `backend-production-6d10adb9` | 三个准确 digest 引用先证明本地不存在，再经实际 pull 取得与源镜像相同 ID。`--env-file` 完成 save/load、旧栈退役、SQL 标记、真实安装、worker、Skill 及 MCP 验证。 |

三类安装都经兑换响应的 `redeemed.skill.download_url` 真实下载。响应、镜像文件和 Git blob 均为 12,114 字节，原 SHA-256 与 Ed25519 签名一致。两个生产运行的 MCP 验证均为 `true`；Lite 仍使用外部 MCP 拓扑。

三类部署的受控清理命令成功，Compose 与 builder 后置不存在检查成立。冷 registry 的三个测试镜像别名移除成功，registry 容器和私有卷后置不存在，临时目录已移除；借用基础镜像保留。历史拒绝目录和旧 CI 清理缺口不以本轮成功覆盖。

实际 GHCR 发布/认证、正式公网代理、真实低功耗设备和厂商通知仍未测，没有发布或真实外发。本轮最后的回执遮蔽及现行通知文档修订另有本机验证；最终交付 head 仍须取得最新 Required CI 并回成果复审，不把上述产品提交通过冒作最终提交通过。

中文修订按固定 `ffda9353768dece8aabd26ccb3a4978025e9437c` 的 zh-tech-writing、manual-structure 和 typography 手检。来源与哈希沿用已审 `sources/writing-skill.json`；没有全局安装。成果须再次独审，最终 head 的最新 Required CI 成功及实际主线合入之前不 Done。
