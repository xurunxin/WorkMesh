# 配置恢复独审修补

## 输入与边界

本轮依据用户注入的实施独审三项 blocking 修补。开始时分支为 `b492a35b11445c157a825b5e747ac0e15506e491`，工作树无未提交改动；通过远端 `refs/heads/main` 读回 `74f247f9240eaf21e74ef248f71a445c1d4276d7`，没有新增主线产品增量。批准计划、规格快照及历史失败记录不改写。本轮仅修项目仓库配置 UI 的重放确认、分页选择与等待恢复，补测试和实际结果；API、Worker 授权锁、HMAC、分页服务端规则及 Lite 代理合同不改。

## 三项修补

1. `project-repository-configuration.tsx` 的结果确认删除基线排除条件，逐项核 `provider_action_id`、`repository_id`、准确的 Project/WorkItem/Session 目标及正文。基线只用于新提交前发现并发更新，不用于否决原动作已完成的结果。浏览器用例先让原动作完成、丢弃 POST 响应，再真正 `page.reload()`、显式填入同文重放，断言原幂等键、原 action ID 和成功确认。
2. 刷新从首屏重新读取已展开页数；如果排序变化使当前选择后移，继续读到选择或授权列表结束。仅完整读取确认已不可用时清空选择，不切到首项，也不把暂时读取失败当不可用。焦点、实时与手动刷新共用此路径，保留有效非首屏选择及其待确认动作。游标失配只允许一次从首屏重读，仍由服务端执行授权及筛选。
3. `waiting` 与待确认动作记录分开：一分钟超时或暂时读取失败停止等待，但保留原动作、正文与后续确认能力；提供“重试确认”和“修改配置”。期限检查位于 `reading` 排他判断之前，每两秒独立检查，即使前次 GET 一直挂起也释放表单并中止旧读取。确认重试只读取原动作结果，不创建新命令或请求身份。未收到 POST 响应的同文重提继续复用 `apiMutation` 的既有存储身份；修改正文后显式提交采用既有新身份语义。迟到原结果在当前草稿已修改时说明“上次提交的上下文已配置；当前修改尚未提交。”，不冒称新草稿已保存。

## 验证与证据

组件测试新增重新挂载、九类结果字段不匹配、第 23 个仓库的焦点/实时刷新与解析完成、超时后原动作确认重试、超时后修改 SHA 新提交、暂时读取失败后修改与迟到确认。`configuration-readiness.spec.ts` 中的丢响应场景升级为真实页面重载；关闭 Gitea 的混合分页场景用真实 workspace 事件和解析完成验证非首屏选择。

初次定向运行工具块 `161703`：原组件及新增场景共 11 项通过。补充精确字段反例和超时修改后工具块 `417814`：组件 21 项、文案 3 项，共 24 项通过；随后 Web typecheck 退出 0（完成块 `c4e5b0`）。这两次没有伪造运行前快照，后续完整运行保存真实前后源码、首败、命令与资源回执。完整单元/浏览器、构建和新精确提交 Lite 安装结果待运行结束后绑定；不以旧 UI 通过冒新 UI 通过。

原六项、九类适用性、五项视觉差异待人工确认及最终独审/CI/main 门禁保持。旧成功与旧 Lite 两轮失败仍保留历史含义；只清本任务登记资源，不清 C3 或历史拒绝目标。

`a2-99deca8f` 已结束退出 0：加强断言后的组件/i18n 25 项、关闭 Gitea 浏览器 11 项/1 Lite 跳过、lint/typecheck 和 CI 校验通过；运行前后源码不变。四轮登记的十二个专用容器都逐 ID 核归属后清理退出 0，认证状态移除和 trace 脱敏均结束。实际回执不被汇总替代。接下来的新 Lite 镜像将绑定提交后真实 SHA，安装结果不预填。

## 实际重验顺序

`a2-5e2b151d` 的静态与根单元退出 0，Web 818 项通过；关闭 Gitea 浏览器 10 项通过、1 项原 Back/Forward 焦点失败、1 项 Lite 跳过。首败原件和脱敏 trace 保留。没有修改焦点代码；相同源码的 `a2-7e910b69` 独立原用例 2 项通过（含安装夹具），关闭 Gitea 11 项通过/1 项 Lite 跳过，完整浏览器 78 项通过/2 项跳过，CI 校验和 Web 构建退出 0，前后源码无变化。

随后补齐挂起读取期限边界，工具块 `89234d` 的组件 22 项通过；该命令传入的 `app/lib/i18n.test.tsx` 不存在，实际只运行组件文件，不冒称执行文案检查。后续根单元会运行真实 `app/lib/i18n.test.ts`。这三轮直接工具检查没有运行前源码快照，不伪补。

最终源码重验运行 `a2-e9a97c5f`，结束后以实际 `receipts.json`、前后源码原件与当前 Git blob 分列绑定。新精确提交的 Lite 安装需重新构建执行，旧 `a2-lite-333f7614` 仅为旧输入通过，不能覆盖本轮 UI。旧交付的映射、源绑定与 CI 读回原字节保存在 `configuration-recovery/history/`。

`a2-e9a97c5f` 已结束退出 0：静态、根单元 29 task（Web 819 项）、关闭 Gitea 11 项/1 跳过、完整浏览器 78 项/2 跳过、CI 校验和 Web 构建均成功，运行期间源码不变。随后仅加强重载组件/E2E 的可见基线断言：页面先显示原动作已经落地的 SHA，才提交同文。`a2-99deca8f` 的组件 22 项和真实 i18n 3 项通过；其浏览器及新 Lite 结果结束后绑定。生产 UI 与 `a2-e9a97c5f` 完全一致，两处测试文件差异独列，不冒称原测试文件字节不变。

## 原被审位置的直接读回

已直接重读 `apps/web/features/projects/project-repository-configuration.tsx` 原三段所在函数与渲染块，不靠关键词未命中证明删除。

第一个被审确认函数现为：

```ts
value.provider_action_id === pending.id && value.repository_id === pending.repositoryId
&& value.project_id === (pending.body.projectId ?? null)
&& value.work_item_id === (pending.body.workItemId ?? null)
&& value.session_id === (pending.body.sessionId ?? null)
&& value.base_sha === pending.body.baseSha && value.base_branch === pending.body.baseBranch
&& value.branch_pattern === pending.body.branchPattern
&& JSON.stringify(value.allowed_paths) === JSON.stringify(pending.body.allowedPaths)
&& JSON.stringify(value.permissions) === JSON.stringify(pending.body.permissions)
```

第二个被审选择更新之前先重读已展开页及后移选择：

```ts
} while (!next && after && (pages < expanded || Boolean(selected && !items.some(item => item.id === selected))))
// 所有页读取成功后才一次更新列表和选择。
if (!next) setRepositoryId(selected ? (items.some(item => item.id === selected) ? selected : '') : initialized ? '' : items[0]?.id ?? '')
```

第三个被审等待逻辑在排他检查前处理期限；表单禁用只取决于实际提交和等待：

```ts
if (pendingRef.current?.id === pending.id && Date.now() >= pending.deadline) { setNotice(text.notConfirmed); setWaiting(false); return }
if (reading) return
```

```tsx
<fieldset disabled={busy || waiting} className={styles.fields}>
```

原动作确认重试沿用记录，仅延长期限，不调用 `apiMutation`：

```ts
const original = pendingRef.current
if (!original) return
replacePending({ ...original, deadline: Date.now() + 60_000 })
setWaiting(true); setNotice(text.pending); void load()
```

分页节选中的中文说明是本记录的省略标注，实际源码中的注释和完整读取门禁见受测原件。
