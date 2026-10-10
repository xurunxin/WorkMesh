# M5 原生 OpenCode 启动、隔离与模型实收修复

本记录补充受控 M5 验收，不重写旧失败证据，不代表四条联合主链已通过。实际执行器为本机已有的原生 OpenCode 2.0.26，212,567,080 bytes，SHA-256 `e13e57a7f6b7abddec887e0b2d912d22484077c50dff5bed4f3199bcf63b6088`。未安装、登录或修改用户 HOME 配置。

## 实施

`joint-clients.drivers.ts` 使用私有 config/data/state/cache/project 和拒绝代理。禁用更新、模型目录外部拉取、项目配置，以及独立扫描 HOME 技能的 compatibility 插件。工具权限先全拒绝，再准确允许受测 MCP 工具；签名对象存储工具仍拒绝进入外部消费者。

原生 `serve --stdio --hostname 127.0.0.1 --port 0` 的 stdin 保持打开，以服务自行输出的回环 URL 驱动 `run --server`。随机服务密码仅在进程环境中传递，不进入 argv 或公开回执。非交互 `run` 必须结束 stdin，原生 CLI 会先读至 EOF 再发送用户消息；旧不结束 stdin 的运行没有模型 HTTP。关闭时结束原归属 server stdin，观察归属进程和监听口退出；`debug config` 启动的服务仅以同一私有环境 `service stop` 关闭。

`debug config` 和原生 server 的 location bootstrap 不保证插件已完成异步 hydration。现在先读取相同 `location[directory]` 的 `/api/config`，再在 15 秒上限内读取技能／插件清单。逐次空观察保留；最终仍要求非空清单、内置插件来源、compatibility 插件缺席，以及技能位于内置或私有路径。不能以空清单证明隔离。

原生默认 `tool_output` 为 51,200 bytes、2,000 lines。真实 `verify_connection` 为超过该字节上限的单行 JSON，原生截断成零行占位，模型未实收正文。私有配置使用原生支持的 `tool_output: { max_lines: 2000, max_bytes: 2000000 }`，保留有界输出并覆盖既有 200k 文档正文的 JSON 转义尺寸。不会让外部消费者读取落盘文件来替代模型实收。

`joint-clients.model.ts` 将没有工具注册表或工具结果的原生辅助请求单独记为 `no-tool-request`。这些请求不推进受测工具序列，不能计作工具调用或验收结果；实际 HTTPS 请求仍逐个保留。外部消费者仍必须在模型的工具结果中解析实际 JSON。

模型接收器先拼接请求 Buffer 再进行 UTF-8 解码，避免大中文 JSON 的网络分片落在多字节字符中间。每次真实 HTTP 请求保存原始 byte length 与 SHA-256，不保存隐藏模型思维链或敏感请求正文。

## 保留的实际结果

证据目录为 `.tmp/m5-runtime/review-opencode/`，其中命令 wrapper 保存真实 PID、argv、UTC 时间、exit、输出指纹，以及受测源码前后 SHA-256。目录保留而未删除；公开证据与原始敏感恢复目录须区分。

- `native-roundtrip-v7`：首次在初始 debug 服务发现空插件清单，`M5_OPENCODE_PRIVATE_INVENTORY_EMPTY` 拒绝，未执行模型。
- `native-roundtrip-v8`：首次真正原生 server/run/MCP/模型往返，exit 0，模拟只读 MCP 一次调用，两个受测模型请求，后续模型实收 marker。辅助标题请求曾 HTTP 500，保留此事实。
- `native-roundtrip-v9`：exit 0，模拟只读 MCP 一次调用，两个受测模型请求和一个单独辅助请求，三次 HTTPS 均 200。两个服务均观察到 2 个内置技能、85 个内置插件。拒绝代理零请求，归属进程全部退出，原生监听口关闭，用户受保护文件元数据保持不变。
- `hydration-typecheck-v9`：`pnpm --filter @workmesh/conformance typecheck` exit 0。
- `actual-identity-v9`：真实 API／DB／MCP 的 `verify_connection` 被原生调用，原生 run exit 0；模型仅收到零行截断占位，外部消费者 JSON 解析失败，验收入口 exit 1。不得宣称身份验收通过。受测源码前后相同。
- `native-large-roundtrip-v10`：私有输出限额生效，288,107 bytes 模拟只读 JSON 到达模型；逐值检查发现接收器逐网络分片 UTF-8 解码损坏中文，exit 1。失败原件保留。
- `native-large-roundtrip-v11`：修复接收器解码后，288,107 bytes 模拟只读 JSON 模型逐值全等，exit 0，受测源码前后相同。一次实际 MCP 调用，两个受测模型请求；辅助请求单列，HTTPS 均 200。
- `final-typecheck-v11`：最终 driver/model 源码的 `pnpm --filter @workmesh/conformance typecheck` exit 0。
- `actual-identity-v12`：真实 `verify_connection` 的完整 JSON 到达模型，原生 run exit 0；验证脚本误将 Agent definition ID 与 Agent actor ID 比较，wrapper exit 1。此验证错误和原件保留；后续脚本改为读取准确 `agent_connections.agent_actor_id`，不改业务身份或后端权限。
- `actual-identity-v13`：真实 WorkMesh API／DB／MCP 的身份往返通过，wrapper exit 0，29.71 秒，受测源码前后相同。原生 `run --server` 和归属 `serve --stdio` 均 exit 0；模型实际收到完整 `verify_connection` JSON，准确 connection ID、Agent actor ID、principal Human ID、client type 与 bootstrap verified 均通过。两份清单都是 2 个内置技能、85 个 active 内置插件；HTTPS 三请求均 200，TLSv1.3，一次辅助请求单列。归属进程全部退出、原生监听口与代理关闭、受保护用户文件元数据不变，拒绝代理零请求。

v13 transport 还保留两条 `clientError/ECONNRESET`，时间在三个 HTTP 200 和完整模型工具结果之后的原生关闭阶段；不将其删除，也不声称传输错误列表为空。原生退出及最终验收 wrapper 均为 0。

模拟只读 MCP 的 marker 不是 WorkMesh 身份证明。v13 只证明准确 backend 身份往返；完整验收仍需要四条联合链的逐事实记录。本记录不将模型文字声称的“verified”作为成功依据，也不代替全仓 Required checks。
