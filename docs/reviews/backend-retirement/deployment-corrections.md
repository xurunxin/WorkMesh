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

本机 `node --test scripts/retire-legacy-web.test.mjs` 的 8 项安全正反例通过。既有 CI policy 20 项通过；Lite 自检 18 种违反合同的变体全部拒绝。JavaScript 语法、CI workflow 与发布 workflow 校验通过，`git diff --check` 通过。

被审提交的 CI `38185745002` 已完成成功。它不包含本轮修订，不作为冷缓存或升级验收结果。修订后的完整镜像、冷缓存 `--env-file` 与两类原栈升级测试交最新适用 Required CI 执行，实际结果另行追加，未执行不标通过。

中文修订按固定 `ffda9353768dece8aabd26ccb3a4978025e9437c` 的 zh-tech-writing、manual-structure 和 typography 手检。来源与哈希沿用已审 `sources/writing-skill.json`；没有全局安装。成果须再次独审，最终 head 的最新 Required CI 成功及实际主线合入之前不 Done。
