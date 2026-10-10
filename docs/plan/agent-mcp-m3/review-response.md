# 独审 blocking 的方案修订与复核入口

状态：三条均已写入修订提案，待_oY重新审查；不由实施Agent自行宣布blocking闭合，不开始编码。

被审原候选为7e7805b1a672878a5644a1e139dfa2ec6520a565。原74文件的Git blob、完整正文和既有ZIP保全于history/reviewed-candidate-manifest.json及相应原件；input/reviewer-feedback.md保存本轮注入独审全文，工具可见源码定位与读取限制另存input。主线产品源码仍来自ef4cb5e1458d911d98433c443dba46e6c224caa0，未借静态审查当产品运行。

| finding | 本轮确定的修订 | 编码后必需实证 |
| --- | --- | --- |
| B1 无checkpoint重领会重复外发 | [恢复合同](worker-recovery.md)、[十八行provider/kind机器矩阵](worker-recovery-matrix.json)：五类写已有领取历史且无合法checkpoint一律停发dead/unknown；attempt单调；不重调adapter、不借merged观察合成结果；合法checkpoint仅本地完成；context纯读有界重试 | GitHub真实本机HTTP rerequest已成功、checkpoint前崩溃、跨60秒租期双Worker重领，仓库写计数不增；其他写kind及commit各HTTP边界同验 |
| B2 普通Git未持authority锁 | [完整发送事务](worker-authority.md)：workspace→既有完整authority rank→provider/资源→PR/check→approval/binding→action；锁后重读，merge/CI及clock_timestamp在同tx；各仓库写HTTP action-scoped guard，provider I/O在提交后 | pg_locks/pg_blocking_pids证明Stop/revoke先提交与发送授权先提交两序；各gate/实际租期/同workerId新attempt/adapter多步写分别验 |
| B3 createReview旧回执绕过新增校验 | [锁内replay](review-replay.md)：beforeReserve先锁完整父/目标/准确回执子authority；handler与authorizeReplay复用三方repo:read/父当前scope/context/父子binding校验；合法回执不再admission/创建/交付 | 成功显式创建后scope收窄、definition/grant撤读权、context失效，原key/body重放均拒；合法重放child/reservation/Lease/outbox/HMAC交付仍一份，省略M2回归 |

当前同步savedplan/implementation、Proposed ADR、安全合同、policy/DTO/OpenAPI、操作矩阵和S2/S4/S7/S8/S9。零迁移下的保守停发可能降低崩溃后自动恢复可用性，明确交Human对账；不扩大provider连接、真实外发或reviewer权限。future tests全标未运行。本轮只重验改动规划的DTO/来源/链接/指纹和CI分类；既有CI16测试及validator原回执保持原源码/运行时意义，不冒新产品测试。
