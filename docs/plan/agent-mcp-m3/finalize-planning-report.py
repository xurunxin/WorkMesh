"""据真实静态回执生成中文报告与工件指纹，不覆盖首败，不写产品通过。"""
from pathlib import Path
import hashlib,json

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
ADR=ROOT/'docs/adr/0083-exact-provider-action-query-and-review-repository-scope.md'

def load(path):return json.loads(path.read_text(encoding='utf-8'))
def write(name,data):
    text=data if isinstance(data,str) else json.dumps(data,ensure_ascii=False,indent=2)+'\n'
    (OUT/name).write_text(text.rstrip('\r\n')+'\n',encoding='utf-8',newline='\n')
def fp(data):return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

def main():
    receipts=[]
    for path in sorted((OUT/'checks').glob('*.json')) if (OUT/'checks').exists() else []:
        r=load(path)
        receipts.append({'name':r['name'],'receipt':path.relative_to(OUT).as_posix(),
          'exitCode':r['exitCode'],'argv':r['argv'],'rawArchive':r['rawArchive'],
          'runtime':r['runtime'],'productTestsExecuted':False})
    write('static-checks.json',{'status':'仅规划静态回执，不是产品测试或候选Required CI',
      'firstFailure':'input/static-first-failure.json','explorationFirstFailure':'input/exploration-first-failure.json',
      'earlyContractVisibleReturn':{'chunkId':'ba51d6','exitCode':0,'acceptedSamples':54,'rejectedSamples':92,
        'provenance':'先前会话可见输出；后续checks/contract有独立完整stdout/stderr与受测字节'},
      'receipts':receipts,'M3ProductChecks':'未运行','M3RequiredCi':'未取得','formalIndependentReview':'未进行，停confirm'})
    resources_path=OUT/'resources.json'
    if not resources_path.exists():
        write('resources.json',{'owner':'本次M3规划会话','workspace':str(ROOT),
          'created':[{'path':str(OUT/'.runtime'),'purpose':'隔离安装三项既有锁定依赖，仅规划DTO/CI静态核验',
            'state':'核验中，未清理','preservation':'input/planning-tools-bootstrap.json、planning-tools锁文件与checks原输出'}],
          'containers':[],'images':[],'volumes':[],'networks':[],'services':[],
          'temporaryProcesses':'静态子进程全部前台运行，由subprocess等待退出，无后台服务',
          'sharedResources':'npm全局cache/store与既有worktree未删除；恢复目录/G1D0C3保护目标未触碰',
          'cleanupRequirement':'核绝对workspace内目标/链接/活动引用后，只清本任务闲置.runtime；拒绝即停目标'})
    lines=['# 本轮规划核验与交付','',
      '状态：本轮只保存规划工件，Proposed安全合同待独审；停confirm供_oY审查。产品未实现，M3产品测试、Required CI、actual Done/main均未发生。','',
      '## 来源与首败','',
      '真实main为ef4cb5e1458d911d98433c443dba46e6c224caa0，收尾平台ls-remote原返回见input/main-final-readback.json；来源归档370项、743个ZIP成员，冻结七份全文和原M3九类/DoD完整承接。','',
      '原平台doc独立全文未取得；原用户注入saved copy完整保全，工具读回仅前缀，四次edit_plan替换可精确重建savedplan/implementation。限制见sources.md，未伪造后端原件hash。','',
      '只读探索首败exit1来自读取不存在的M2 capture-sources.py，见input/exploration-first-failure.json。整包静态首败exit1因README链接planning-report.md尚未生成，见input/static-first-failure.json；首败不改写为通过。早期通用Node依赖探针返回MODULE_NOT_FOUND，聚合shell最终exit0，未捕获该子进程独立exit；随后用隔离三依赖安装复核，不编造原子退出码。','',
      '首败脚本旧字节按精确已知变更反向重建，标明不是首败时实读；首败其余工作树未逐项保全的缺口保留。后续每条静态回执保stdout/stderr原字节ZIP、准确argv/runtime与受测前后指纹，失败同样归档。','',
      '记录器另有真实exit1：打印ci-policy摘要遇GBK无法编码符号；contract与ci-policy原输出/回执此前已落盘且子进程exit0。修正记录器stdout/stderr为UTF-8后仅继续未运行三命令，完整进度与缺口见input/check-recorder-first-failure.json；不将聚合首败记成通过。','',
      '## 实际静态核验','',
      '| 核验 | 实际退出 | 原回执 |','| --- | --- | --- |']
    for r in receipts:lines.append('| '+r['name']+' | '+str(r['exitCode'])+' | ['+r['receipt']+']('+r['receipt']+') |')
    if not receipts:lines.append('| 后续复验 | 未执行 | 尚无回执 |')
    lines+=['',
      'contract核验仅测试提案Zod六kind/五status、合法及非法样本和OpenAPI结构一致；CI policy/validate仅测试既有分类门禁。ci-selection核实际规划文件触发full，未放宽CI。static核Git/blob/工作树原字节、原九类/DoD、平台来源、精确计划替换、UTF-8/空白/本地链接及产品零修改。完整数量/skip从回执原输出读取，exit0不代数量。','',
      '实际contract为54个合法样本、92个拒绝样本，六kind/五status及schemaParity通过；既有CI policy为16 tests/pass16/fail0/skipped0。实际静态Node为v24.20.0；CI validator输出的Node22.19.0是校验配置目标，不是本进程运行时。产品检查执行前必须按仓库锁定版本核验。','',
      '全部pnpm lint/typecheck/test/test:integration/test:e2e、route-policy/skill gates以及Native/MCP/Pi产品链均未运行，具体执行与N/A见verification.md。真实provider、artifact store、三OS与新组合未测，不借旧UI或M2绿色代M3通过。','',
      '辅助输出探针另一次exit1也是GBK打印TAP失败，未进入ZIP检查；见input/output-probe-failure.json。后续static实际核原输出ZIP及逐受测输入，不能把该探针当通过。','',
      '## 工件与收尾','',
      'artifact-manifest.json逐文件绑定最终正文与证据原字节；checks ZIP另保存该次实际受测字节。报告/回执/资源/manifest为收尾元数据，不为自身head循环改正文。候选commit的准确head在提交后会话交付，commit blob与暂存字节另核，不把主线来源SHA冒候选head。','',
      '资源归属、准备/恢复/清理实际回执见resources.json；无容器、服务、真实外发。通过该工件README预览审阅，独审blocking/high闭合并Chief confirm之后再实现产品。']
    write('planning-report.md','\n'.join(lines))
    excluded={'artifact-manifest.json'}
    entries=[]
    for path in sorted(OUT.rglob('*'))+[ADR]:
        if not path.is_file() or any(k in path.parts for k in ('.runtime','__pycache__')) or path.name in excluded:continue
        data=path.read_bytes()
        entries.append({'path':path.relative_to(ROOT).as_posix(),**fp(data)})
    write('artifact-manifest.json',{'role':'收尾候选原字节指纹，非历史Git原件hash；Git原件另见source-manifest',
      'selfExcluded':'本manifest不自hash，不循环绑定candidatehead；准确head提交后单独交付',
      'entries':entries,'productFilesChanged':0})
    print(json.dumps({'receiptCount':len(receipts),'artifactCount':len(entries),'productTestsExecuted':False,'exitCode':0}))

if __name__=='__main__':main()
