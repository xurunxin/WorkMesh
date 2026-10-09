# 实施独审输入

来源：本轮用户完整注入的独审反馈；没有声称从后端读取 reviewer 文档全文。旧交付和原三项后端 blocking 的历史结论不改写。

1. `project-repository-configuration.tsx:20`：`value.provider_action_id === pending.id && !pending.baseline.includes(value.id)`。POST 丢响应后 Worker 完成解析，重新加载并同文重试，已完成结果进入新基线而无法确认。要求使用精确 action ID、目标与正文，补真正页面重载后的重放测试。（blocking）
2. `project-repository-configuration.tsx:82`：`setRepositoryId(current => (!next && !page.items.some(item => item.id === current)) ? page.items[0]?.id ?? '' : current || page.items[0]?.id || '')`。加载更多后选择第 23 个仓库，焦点与实时刷新静默切回首项并丢待确认状态，保留输入可能提交到错误仓库。要求刷新已展开分页并核当前选择，仅确认不可用或失权时清空，补焦点、实时与解析完成场景。（blocking）
3. `project-repository-configuration.tsx:166`：`else if (Date.now() >= pending.deadline) { setNotice(text.notConfirmed); clearInterval(timer) }` 和 `disabled={busy || Boolean(pending)}`。超时/读取失败只停轮询仍永久禁用表单。要求分开等待与动作记录，保留原请求身份的确认重试、显式修改及迟到结果确认，补超时和临时读取失败恢复。（blocking）

上述三项是完整问题和验收要求的中文转录，保留被引用的原代码文字；不冒作包含审查过程旁白的原始消息字节快照。实际原文来源为本轮用户消息，原消息版本和独审文档 ID 未提供，记为 null。
