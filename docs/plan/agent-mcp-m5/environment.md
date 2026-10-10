# 实际环境盘点与客户端选择

## 实读状态

OpenCode选型来自本轮环境发现及生产者建议，不是用户新增厂商认证／连接授权。命令和精确读取时间保存在 [environment.json](environment.json)，实际原生runtime、包元数据和二进制指纹见 [client-runtime.json](client-runtime.json)。所有探测均版本／help／只读元数据，未启动模型、MCP接入或登录。

本机为 Windows 11 专业工作站版，Node与pnpm／Docker可用。PATH上的 `C:\Users\xurx\.bun\bin\opencode.exe` 是小型Bun launcher；后续固定使用已安装包 `C:\Users\xurx\.bun\install\global\node_modules\@opencode\cli\bin\opencode.exe`，不能将launcher哈希冒原生runtime。二者version输出及包version由实际只读探测取得；这不证明tool round-trip成功。Pi依赖pin来自仓库package.json，当前本工作树未安装node_modules，真实Runner在本轮未启动。

读取 `opencode run --help` 证实可用 `--standalone`、`--format json`、`--model`、`--session`、`--agent`；不使用 `--auto`／`--thinking`，不连接当前后台service。MCP help只证明list/add/auth/logout入口存在，本轮未执行其mutations/auth。

## 当前配置／登录与授权

只检查标准全局／项目／祖先配置及候选auth文件存在、大小、mtime、link属性，不读内容；存在的用户 `service.json` 受保护。列表见environment.json，不声称候选路径覆盖所有厂商内部账号存储。现有登录状态未验证，也不能因为某候选auth文件不存在认定未登录。

选定本机受控OpenAI-compatible模型路径不需要新外部账号授权；本任务不消费已有team secret模型keys或用户账号。正式执行前必须证明该runtime消费本任务私有配置/data/state目录、standalone没有复用用户service、无真实provider／自更新／插件／出网请求。此隔离及tool能力尚未运行，不能记已可用；具体准备方案见implementation.md。无法证明时在本原卡提出能力问题，停外部子流程，不修改用户配置、不安装／登录或申请聊天秘密。

## 官方文档来源

| 官方页面 | 本轮消费的公开合同 | 来源记录 |
| --- | --- | --- |
| [MCP配置](https://opencode.ai/v2/docs/mcp-servers) | 当前嵌套mcp.servers、remote headers、关闭OAuth、direct tools／classic handshake、server前缀tool名 | 请求／最终URL、读取日期、Last-Modified可得值及完整HTML hash在environment.json；原bytes在environment-originals.zip |
| [模型提供方](https://opencode.ai/v2/docs/providers) | providers、已支持的compatible runtime package、settings.baseURL、显式model | 不连接所举账号，不以文档证明已安装runtime实际模型可达 |
| [配置位置](https://opencode.ai/v2/docs/config) | 全局与祖先项目配置合并；非冲突配置仍保留，project config不证明隔离；update为全局控制 | 不用旧CLI环境变量名称猜当前消费行为，不改用户global config |
| [权限规则](https://opencode.ai/v2/docs/permissions) | permissions/action/resource/effect、后匹配规则优先、MCP准确工具action名 | 本任务固定whitelist、其余拒绝；禁止shell/子Agent/网络工具 |

这是官方公开文档读取记录，不是厂商客户端认证。原始HTML是读取当时的字节，后续网站变化另捕获，不倒写本轮来源。

## 服务盘点与缺口

当前可见Docker容器全部为别的任务或既有服务：没有本任务PostgreSQL／Redis／RustFS／API／Worker／MCP。不探测其凭据／挂载内容，不借用、不停止、不清理。后续为独有test库及网络／端口登记owner，按已审方案部署，不连接既有WorkMesh远端。

关键待证能力：已安装OpenCode的配置/data隔离、classic MCP发现与错误实收、compatible模型streaming工具回合；本机Node运行消费者兼容；未恢复的仓库依赖、独有DB／store服务。它们属于明确实施准备和真实测试，当前状态未测；不是已观察到的产品错误，也不提前创建新业务卡或要求新账号。
