"""前景环境入口：核真实 pnpm/store；按任务隔离；不自动删除或启动业务。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

WORKSPACES=Path(r'C:\Users\xurx\.tds\workspaces')
REPOSITORY='https://github.com/xurunxin/WorkMesh.git'
VERSION='9.15.4'

def run(args,cwd):
    result=subprocess.run([str(x) for x in args],cwd=cwd,capture_output=True,text=True)
    if result.returncode:raise RuntimeError(json.dumps(dict(input=[str(x) for x in args],exit=result.returncode,stdout=result.stdout,stderr=result.stderr),ensure_ascii=False))
    return result.stdout.strip()

def cached_manager():
    # 不运行 PATH 中可能自动下载管理器的 12.x shim，不安装新工具。
    parent=Path(os.environ['LOCALAPPDATA'])/'pnpm/package-manager-store/v11/links/@pnpm/win-x64'/VERSION
    found=[]
    for meta in parent.glob('*/node_modules/@pnpm/win-x64/package.json'):
        if json.loads(meta.read_text())['version']==VERSION and (meta.parent/'pnpm.exe').is_file():found.append(meta.parent/'pnpm.exe')
    if not found:raise RuntimeError('缺少已安装 pnpm9.15.4；停止，不自动下载或新安装')
    return sorted(found)[0]

def plan(root):
    root=root.absolute()
    if root!=Path.cwd().absolute() or root.parent!=WORKSPACES:raise RuntimeError('只允许本次会话自己的 workspace')
    if root.is_symlink() or not (root/'.git').is_file():raise RuntimeError('需要平台 linked worktree；不得对主仓库/独立 clone 应用')
    if run(['git','remote','get-url','origin'],root)!=REPOSITORY:raise RuntimeError('不是 WorkMesh')
    branch=run(['git','branch','--show-current'],root)
    if branch!='tds/conv-'+root.name:raise RuntimeError('不在本次会话分支')
    manifest=json.loads((root/'package.json').read_text())
    if manifest['packageManager']!='pnpm@'+VERSION:raise RuntimeError('锁定管理器变更，需重新核验')
    manager=cached_manager()
    if run([manager,'--version'],root)!=VERSION:raise RuntimeError('实际 pnpm 版本不匹配')
    store=Path(run([manager,'store','path'],root))
    if not store.is_dir() or store.name!='v3':raise RuntimeError('既有 store 不存在/版本改变，停止；不建立全局替代')
    lock_hash=hashlib.sha256((root/'pnpm-lock.yaml').read_bytes()).hexdigest()
    virtual=store.parent.parent/'workmesh-task-virtual-stores'/(root.name+'-'+lock_hash[:12])
    command=[str(manager),'install','--offline','--frozen-lockfile','--ignore-scripts','--store-dir',str(store.parent),
        '--virtual-store-dir',str(virtual),'--package-import-method=copy','--side-effects-cache=false']
    return dict(workspace=str(root),branch=branch,pnpm=str(manager),pnpmVersion=VERSION,store=str(store),
        lockSha256=lock_hash,privateVirtualStore=str(virtual),sameVolume=store.anchor.lower()==virtual.anchor.lower(),
        importMethod='copy',installCommand=command,
        shared=['既有 pnpm CAS/download store（不 prune）','既有公共 Node/pnpm/OpenCode 安装','已有 Docker 镜像'],
        isolated=['任务专属 virtual store、node_modules 入口','构建缓存/.next/dist/.turbo','测试容器/卷/端口、私有配置/DB/秘密'],
        limitation='本机 clone-or-copy 实测产生 CAS hardlink，不能保证任意写隔离；copy 须再核身份。共享 store 减少下载，任务安装字节仍可能复制；离线缺包即停止，不默认联网或执行安装脚本。')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['plan','install','thin','hydrate','finish-plan'])
    parser.add_argument('--path',action='append',default=[])
    args=parser.parse_args();root=Path.cwd();data=plan(root)
    if args.mode=='install':
        if run(['git','status','--porcelain=v1'],root):raise RuntimeError('新任务首次安装要求干净工作树，避免覆盖既有成果')
        if (root/'node_modules').exists() or Path(data['privateVirtualStore']).exists():raise RuntimeError('已有环境，不盲目重建')
        for parent in [Path(data['privateVirtualStore']),*Path(data['privateVirtualStore']).parents]:
            if parent.exists() and getattr(os.lstat(parent),'st_file_attributes',0)&1024:raise RuntimeError('任务 virtual store 祖先是 reparse point，停止')
        Path(data['privateVirtualStore']).mkdir(parents=True)
        ledger=root/'.tmp/workmesh-environment-owner.json'
        ledger.parent.mkdir(exist_ok=True)
        with ledger.open('x',encoding='utf-8') as stream:stream.write(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
        proc=subprocess.run(data['installCommand'],cwd=root,capture_output=True,text=True,stdin=subprocess.DEVNULL,env={**os.environ,'CI':'true'})
        if proc.returncode:raise RuntimeError(json.dumps(dict(exit=proc.returncode,stdout=proc.stdout,stderr=proc.stderr,ownerLedger=str(ledger)),ensure_ascii=False))
        data['output']=proc.stdout
        data['applied']=True
    elif args.mode=='thin':
        if run(['git','status','--porcelain=v1'],root):raise RuntimeError('稀疏检出要求先保全并提交本地成果')
        setting=subprocess.run(['git','config','--get','extensions.worktreeConfig'],cwd=root,capture_output=True,text=True)
        if setting.stdout.strip()!='true':raise RuntimeError('平台仓库未启用每工作树配置；不修改共享 cache/config，停止 thin；仍可使用隔离的同卷依赖入口')
        # 默认仍有源码、协议、ADR、计划正文及清理入口；仅省大体积历史验收目录。
        patterns=['/*','!/docs/reviews/','!/docs/plan/agent-mcp-m0/','!/docs/plan/agent-mcp-m1/','!/docs/plan/agent-mcp-m2/',
            '!/docs/plan/agent-mcp-m3/','!/docs/plan/agent-mcp-m4/','!/docs/plan/agent-mcp-m5/',
            '/docs/reviews/cleanup/2026-10-11-worktrees/post-m4/full-cleanup/']
        p=subprocess.run(['git','sparse-checkout','set','--no-cone','--stdin'],cwd=root,input='\n'.join(patterns)+'\n',text=True,capture_output=True)
        if p.returncode:raise RuntimeError(p.stderr)
        data.update(applied=True,patterns=patterns,requirement='涉及 M0–M5 或证据归档校验时先 hydrate 所需准确目录；CI 保持完整检出')
    elif args.mode=='hydrate':
        if not args.path:raise RuntimeError('必须给出本任务实际需要的 --path')
        for path in args.path:
            if Path(path).is_absolute() or '..' in Path(path).parts or not path.startswith('docs/'):raise RuntimeError('仅允许仓库内 docs 路径')
        data['output']=run(['git','sparse-checkout','add','--no-cone',*['/'+p.rstrip('/')+'/' for p in args.path]],root)
        data['applied']=True
    elif args.mode=='finish-plan':
        data.update(applied=False,cleanupCandidates=[str(root),data['privateVirtualStore']],
            steps=['逐路径保全独有成果并推送远端，核准确 Git/归档哈希','停止本人进程并核他人挂载/引用、审批拒绝边界',
                '先登记本 workspace 和 task virtual store 两个精确候选；正式 Git remove 与原生链接本体流程需各自预检',
                '结束后只回收本人 task virtual store；共享 CAS/镜像/公共工具保持，不后台自动删'])
    else:data['applied']=False
    print(json.dumps(data,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
