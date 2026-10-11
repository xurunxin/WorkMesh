# 正式成果审查输入

本轮输入针对准确候选 `603f5001513872d4e973566d6a4c07ec4e7b179b`，主线为 `c2b3d363c037157df13beb82799d99d07a9b7db8`。三项均为 High(blocking)，须解决后重新交 Chief 正式审查及核最新 Required CI；原局部静态审查不代正式审查。

1. 原始证据 CRLF 导致分类门禁失败。`execution/.gitattributes` 的 `** -text` 保留了 CRLF，但未配置 whitespace 属性，完整 `git diff --check origin/main...HEAD` 将行尾 CR 判为尾随空白。仅对受控证据路径配置 `whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol`，保留原件字节及其他空白检查，补门禁回归。新 HEAD Required CI 全绿之前不得合入。
2. 注册生成器在正常 LF checkout 中拒绝有效源码。生成器直接将 `read_bytes()` 与 Windows 捕获的 bytes/SHA-256 对照；MCP 原运行源码 82,111 字节而提交对象为 81,666 字节，其他两个源码也存在换行差异。分别保留运行原件指纹和可复现 Git 源码绑定，明确换行转换；补 LF/CRLF 等价通过、真实源码变化拒绝，不改写原捕获。
3. 新增必跑套件依赖 CI 未提供的 native 客户端。原 `optional-domains.conformance.test.ts` 中 native 用例强制要求 `M5_CLIENT_EXECUTABLE`，Required API integration 未准备该客户端。沿 M5 边界把 native 场景放入显式必需的本机验收入口，保留 Required CI 的真实 REST/SDK/MCP/Pi，同步入口合同与测试；不得静默 skip 或以 Windows 本机结果声称 Ubuntu CI native 已通过。

原 CI run `38114467378` 的准确失败日志和退出保存在 `checks/review-original-ci-log/`。GitHub 原错误输出自身包含 Node inspect 截断提示；本文件不称其为全部 diff 字节。不可变原候选和受控源码完整 Git 对象继续保留。
