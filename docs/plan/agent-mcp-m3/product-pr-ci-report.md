# M3 PR 与首轮 Required CI 原件

[PR #215](https://github.com/xurunxin/WorkMesh/pull/215) 已使用现有 gh keyring 身份创建，准确中文正文见 [body-file](product-pr-body.md)。gh version/auth、创建 argv/exit/runtime、正文实际换行及原响应见 [准备原件 ZIP](product-pr-preparation.zip)。未登录、安装、索取秘密、切换分支或合入。

正式成果复审由用户转述确认已审候选 `ac0c13e0916a6de232c3cab4bbabd92a95b886e9` 无 blocking/high。本轮新增构建配置修复须增量审查，原复审不冒覆盖此变化。

## CI417 首败

[CI417/run38056914988](https://github.com/xurunxin/WorkMesh/actions/runs/38056914988)，attempt1，pull_request，completed/failure。head `ac0c13e0916a6de232c3cab4bbabd92a95b886e9`，base `ef4cb5e1458d911d98433c443dba46e6c224caa0`。十 job 日志实际合成 checkout `473a2258bcede6d3951a8a3eb00dfe05a2b7fa7c`，parents 正是 base/head，tree `7fd8e2593ba256908f9c0631116be9fcae9f86f7` 与该 head 一致。Actions job/step conclusion 与本机收集命令 native exit 分列；远端未给子进程 exit 时记 null。

| Job | conclusion | runtime 秒 |
| --- | --- | --- |
| Classify changes and validate CI selection／114227174536 | success | 34.0 |
| Database integration／114227289591 | success | 195.0 |
| Source gates／114227289592 | failure | 255.0 |
| API integration／114227289595 | success | 818.0 |
| Browser acceptance (1/2)／114227289597 | success | 278.0 |
| Complete disaster recovery／114227289598 | success | 331.0 |
| Browser acceptance (2/2)／114227289606 | success | 291.0 |
| Agent construction and protocol smoke／114227289620 | success | 54.0 |
| Worker integration／114227289635 | success | 445.0 |
| Required CI／114229805767 | failure | 42.0 |

分类真实选择 full，CI策略16个测试通过，保 M0/M1/M2/M3 四真实套件与逐套件删除负例。DB81、API278/1条件skip、真实conformance61/0skip、Worker146/2条件skip、两E2E分片38+33、灾备1通过，agent smoke成功。不能把Source gates Build后被阻断的unit/Compose/clean-tree step称通过。

Source gates Build实际失败于 conformance tsc 的 TS6059：新增跨包测试夹具未加入生产构建 exclude，拉入API/Worker源并越过 rootDir=src。此次只在 `packages/conformance/tsconfig.build.json` 原三项夹具后增加 `"src/delivery-recovery.fixture.ts"`。不改rootDir、不移除断言、不修改真实套件include、lint/typecheck或Required接线。

直接 `pnpm.cmd --filter @workmesh/conformance build` exit0，elapsed6.041646957397461秒，见 [m3-ec66e895bbaa](product-evidence/m3-ec66e895bbaa.json)；全仓 `pnpm.cmd ci:source build` exit0，18任务/11cache，elapsed122.98718690872192秒，见 [m3-02260d32fd6c](product-evidence/m3-02260d32fd6c.json)。两条原stdout/stderr ZIP、Node22.19.0实际execPath及起止全指纹无变。充分无变旧本机checks不重跑。

相对已审1114文件，仅上述生产构建配置变化，其余1113运行字节一致；Git旧blob、新expected blob、原Git/Windows全文见 [逐文件变更绑定](product-ci-build-fix-binding.json) 及准备ZIP。CI417受测的是旧head，收集时工作树已含这一个修复，不能把当时工作树冒CI417checkout。新head须自己的完整Required CI。

## 完整原件与边界

[十job/十二工件/命令原件 ZIP](product-ci417-originals.zip)、[逐成员摘要](product-ci417-archive-index.json)、[准确run/jobs/head/base/commit及1114绑定](product-ci417-results.json)。GitHub上传digest、实际下载ZIP digest、逐成员脱敏后ZIP digest分别记录，所有成员保留，嵌套ZIP同规则；没有把脱敏bytes称GitHub原digest。服务日志与真实模型实收都保存在工件中。首轮CLI日志捕获因转义保护exit1、读取JSON误用Windows默认GBK及打印Unicode异常单列为收集错误，不冒产品失败或丢失原日志；修正UTF-8与文件捕获后完整保全。

本轮尚待修复后的最新Required CI与构建配置增量正式独审。后续纯证据提交换head必须重核1114产品/测试blob并取得自己的CI；本报告不预称未来通过。健康CI417十job持续等到终态，未取消/盲重跑。真实provider账号/外发、UI/F-TA继续未测/范围外；没有扩产品权限。

本任务缓冲 `.tmp/m3-pr-ci/` 各run目录由本轮collector拥有；原件保全后仅精确注册叶文件可清，不递归删除、不动共享node/cache、恢复目录或G1D0C3。记录完整源与Actions checkout不等于远端逐文件执行前后实读。最终停review交Chief正式merge_builds，不直接合入或Done。
