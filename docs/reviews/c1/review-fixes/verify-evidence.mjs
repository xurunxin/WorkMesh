import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {readRawEvidenceArchive,resolveEvidenceBytes} from '../../../../scripts/verify-raw-evidence-archive.mjs'

const dir=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(dir,'../../../..')
const index=JSON.parse(readFileSync(path.join(dir,'raw-evidence-index.json'),'utf8'))
const archive=readRawEvidenceArchive(index,readFileSync(path.join(dir,'raw-evidence.zip')))
const source=JSON.parse(readFileSync(path.join(dir,'tested-source.json'),'utf8'))
for(const file of source.files){
  const blob=execFileSync('git',['hash-object','--path',file.path,file.path],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()
  if(blob!==file.gitBlobSha1)throw Error(`当前受测源码 Git blob 不符：${file.path}`)
  const original=resolveEvidenceBytes(archive,{logicalPath:file.path,version:'review-fix-final-source',byteKind:'worktree'})
  if(original.length!==file.worktreeBytes||createHash('sha256').update(original).digest('hex')!==file.worktreeSha256)throw Error(`受测工作树原字节不符：${file.path}`)
}
// 原日志与原源码仍按原审核 head 检查，不把它们重绑定为新源码。
const historical=execFileSync(process.execPath,[path.join(dir,'../verify-evidence.mjs'),'--source-ref',source.reviewedHead],{cwd:root,encoding:'utf8'})
const plan=JSON.parse(readFileSync(path.join(root,'docs/plan/c1-channel-delivery/savedplan-Ry2L3-U5lGSRc8EpsaLs6.json'),'utf8'))
if(plan.version!==null||createHash('sha256').update(plan.body,'utf8').digest('hex')!==source.savedPlanBodySha256)throw Error('完整计划正文或 null 版本记录不符')
const runs=JSON.parse(readFileSync(path.join(dir,'runs.json'),'utf8'))
for(const name of ['lint','typecheck','unit','integration','e2e']){
  const run=runs.filter(row=>row.name===name).at(-1)
  if(!run||run.exitCode!==0||!run.sourceBindingSha256)throw Error(`必需检查未成功或未绑定最终源码：${name}`)
  const sourceBytes=readFileSync(path.join(dir,'tested-source.json'))
  if(createHash('sha256').update(sourceBytes).digest('hex')!==run.sourceBindingSha256)throw Error(`检查源码绑定不符：${name}`)
  resolveEvidenceBytes(archive,{logicalPath:run.log,version:'review-fix-check',byteKind:'worktree'})
}
console.log(JSON.stringify({entries:index.entries.length,members:archive.memberCount,currentSourceFiles:source.files.length,historical:JSON.parse(historical),requiredChecks:'全部成功',planBody:'一致',errors:[]}))
