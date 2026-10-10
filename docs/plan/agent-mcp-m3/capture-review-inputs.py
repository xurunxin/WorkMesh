"""保存被审候选完整Git字节及修订对照，复用不变ZIP、不改旧审查含义。"""
from pathlib import Path
import hashlib,json,subprocess,zipfile

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
PREVIOUS='7e7805b1a672878a5644a1e139dfa2ec6520a565'

def git(*args,data=None):return subprocess.check_output(['git',*args],cwd=ROOT,input=data)
def fp(data):return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
def main():
    history=OUT/'history';history.mkdir(exist_ok=True)
    paths=git('diff','--name-only',PREVIOUS+'^',PREVIOUS).decode().splitlines()
    entries=[]
    archive_path=history/'reviewed-candidate.zip'
    with zipfile.ZipFile(archive_path,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        raw_commit=git('cat-file','commit',PREVIOUS)
        archive.writestr('commit',raw_commit)
        for path in paths:
            oid=git('rev-parse',PREVIOUS+':'+path).decode().strip()
            data=git('cat-file','blob',oid)
            entry={'path':path,'blobId':oid,**fp(data)}
            if path.endswith('.zip'):
                assert (ROOT/path).read_bytes()==data
                entry['unchangedArchive']=path
            else:
                entry['member']='files/'+path
                archive.writestr(entry['member'],data)
            entries.append(entry)
    manifest={'reviewedCandidate':PREVIOUS,'originalSourceMain':git('rev-parse',PREVIOUS+'^').decode().strip(),
      'preservation':'所有被审候选原Git blob逐项校验；正文原字节在ZIP，既有不变原ZIP按路径/bytes/hash复用，不重复嵌套。',
      'commitObject':{'member':'commit',**fp(raw_commit)},
      'archive':{'path':archive_path.relative_to(ROOT).as_posix(),**fp(archive_path.read_bytes())},'entries':entries}
    (history/'reviewed-candidate-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    matrix=[]
    for kind in ['create_branch','create_commit','open_pull_request','merge_pull_request','retry_ci_check','resolve_repository_context']:
        for provider in ['fake','github','gitea']:
            unsupported=provider=='gitea' and kind=='retry_ci_check'
            matrix.append({'provider':provider,'kind':kind,'initial':'unsupported' if unsupported else 'read_only' if kind=='resolve_repository_context' else 'allowed_if_authorized',
              'withoutCheckpointAfterClaim':'bounded_read_retry' if kind=='resolve_repository_context' else 'stop_dead_unknown',
              'withValidCheckpoint':'unsupported_not_fabricated' if unsupported else 'local_only',
              'extraBoundary':'gitea仅单文件commit' if provider=='gitea' and kind=='create_commit' else None,
              'mutationHttpOnRecovery':0,'productStatus':'未运行'})
    (OUT/'worker-recovery-matrix.json').write_text(json.dumps({'status':'Proposed，不是运行结果','sourceCommit':manifest['originalSourceMain'],
      'attemptCountMonotonic':True,'newPersistentFields':0,'newMigrations':0,'reusedEvent':'provider.action.dead_lettered',
      'recoveryError':'PROVIDER_ACTION_OUTCOME_UNKNOWN','rows':matrix},ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'preservedCandidateFiles':len(entries),'providerKindRows':len(matrix),'exitCode':0}))

if __name__=='__main__':main()
