# 当前归档实施与失败复核说明

执行基础提交：`002c1d61a7fc5d529b2d480f4c48716971c4236d`，保留原`37857eef`与精确main `70199df743da754068831d709a1ae8c428bd2bb0`历史。方案A按用户本轮明确授权实施，B未采用。最终ZIP/index的准确数量与hash由最终JSON的`archiveClosure.archive`固定，不能用旧17/842或38/44数量表示后来新日志。

## 根级集成

旧`d0806bc`首败现场已不可恢复，具体mode/age未记录，仍不认定时钟或基础设施根因。用户明确允许带现场采集的标准根命令作为进一步诊断；本轮`integration-scene-root.1.log`记录标准根命令、临时仅worker观测配置及实际字段，原guard结果/错误不改。initialProof现场：workerMode=archive_only，workerSeenAt=2026-10-07T18:27:09.946Z，observedAt=2026-10-07T18:27:09.951Z，ageMs=5；四个freshness拒绝条件均false。此根命令退出0，没有复现旧错误，不能据此给旧首败补造分类。

随后临时`vitest.integration.config.ts`按原字节恢复，与执行提交无diff。未改配置的标准`pnpm test:integration`在`integration.5.log`退出0：DB77、API154、worker78、recovery1，总310通过、2既有skip；既有skip不称作通过。它才是本轮标准根命令成功，前轮worker/recovery补验和带setup诊断不代替该结果。原始首败及全部复核均通过当前归档映射读取。

## 单测启动hook超时

`test.5.log`根单测首次退出1，`apps/api/src/auth-rate-limit/server-rate-limit.test.ts:45`的beforeAll超过原10秒hook上限；四个用例未运行。该hook仅导入server并调用app.ready，注入OfflineStore，未进入产品断言；测试和server源码在本轮没有变更。失败时同机正在执行冷构建、typecheck与集成；只记录共时，不断言资源争用是根因。

分类为本机测试启动基础设施阶段的超时；具体模块导入与ready耗时未分别采集，底层原因仍未定位。依据是失败栈在初始化hook、没有产品断言失败、相同源码在布局CI373 source gate通过，以及构建完成后定向`unit-rate-limit.1.log`四项通过（原timeout未改）。随后必要的标准根单测复验`test.6.log`29/29任务通过，API33文件174项、Web113文件776项通过。没有提高timeout、修改selector、删测试或丢首败。

## 验证版本与额外完整性检查

诊断配置恢复后重新执行lint/typecheck，是为取得未改配置的准确版本记录；早先在诊断配置存在时的成功日志也保留，不能混称全部工作树输入未变。当前reader补加Git blob ID与提交字节的对应检查；`ci-validate.3.log`及根单测复验记录了两个验证脚本的精确`sourceOverrides` blob/bytes/SHA，避免把新增脚本字节冒称已经在002c1d61中。15项归档安全/完整性负例与现有3项输入验证器自测分开记录。

CI373/run37666213669的002c1d61布局提交10/10成功，含两个浏览器分片和Required CI。后续证据提交与新增reader检查须以自身最新head的正式CI为准，不复用布局CI关闭最终门禁。当前仍须定向独审及实际main合入证明；本轮不merge，G1/R1继续关闭。

## PR201 新版浏览器覆盖

正式`pnpm test:e2e`在`e2e.7.log`退出0，65/65通过；本轮先结束根集成再单独运行完整浏览器验收。`e2e-shards.1.log`证明两个分片34与32项的并集为65个唯一用例，仅bootstrap重复。旧67/74结果保持历史，不代替PR201配置。全部新日志按结束时原始字节归档并提供执行版本别名。

## 本轮现场采集器正文

临时`.tmp/g1-worker-diagnostic.setup.ts`为1300字节，原始SHA-256为`adce8e7ee6221b42e5b9a630973ec7e28023b31ba466a2614cada5445e68435b`。以下正文只供复核；配置通过`G1_WORKER_DIAGNOSTIC=1`对worker启用此setup，不改变超时、guard或断言。根命令的临时配置准确字节另在该记录的sourceOverrides中：

```json
undefined
```

```ts
import {vi} from 'vitest';
import * as provenance from '../apps/worker/src/retention-soak-provenance';
const original=provenance.retentionSoakWorkerFreshnessProof;
vi.spyOn(provenance,'retentionSoakWorkerFreshnessProof').mockImplementation((identity,evidence,observedAt,maximumAgeMs,expectedConflictCount)=>{
  const describe=()=>{const ageMs=evidence.workerSeenAt?observedAt.getTime()-evidence.workerSeenAt.getTime():null;return {workerMode:evidence.workerMode,workerSeenAt:evidence.workerSeenAt?.toISOString()??null,observedAt:observedAt.toISOString(),ageMs,maximumAgeMs:maximumAgeMs??120000,wrongMode:evidence.workerMode!=='archive_only',missingSeenAt:!evidence.workerSeenAt,negativeAge:ageMs!==null&&ageMs<0,staleAge:ageMs!==null&&ageMs>(maximumAgeMs??120000),identityMatches:evidence.workerInstanceId===identity.instanceId&&evidence.workerBuildSha===identity.buildSha,conflictCount:evidence.workerIdentityConflictCount,expectedConflictCount};};
  try {const result=original(identity,evidence,observedAt,maximumAgeMs,expectedConflictCount);console.log('G1_FRESHNESS_SCENE',JSON.stringify({...describe(),result:'通过'}));return result;}
  catch(error){console.log('G1_FRESHNESS_SCENE',JSON.stringify({...describe(),result:error instanceof Error?error.message:'未知错误'}));throw error;}
});
```

代码先调用原函数，再记录传入现场并原样返回或抛出；下文代码展示的换行不作为原始SHA列。正式根集成复验未启用此setup，配置已按原字节恢复。
