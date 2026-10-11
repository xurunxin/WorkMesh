"""仅调整本卡私有测试环境；按现行 CI 参数跑根检查，M4 夹具独立启六域。"""
from pathlib import Path
import json,secrets
root=Path(__file__).resolve().parents[4]
private=root/'.tmp/m4-4adc5e39/environment.json'
env=json.loads(private.read_text(encoding='utf-8'))
env['WORKMESH_MASTER_KEY']=secrets.token_hex(32)
for name,value in {'AUTH_RATE_LIMIT_ENDPOINT_BURST':'10000','AUTH_RATE_LIMIT_SOCKET_BURST':'10000','AUTH_RATE_LIMIT_CLIENT_IP_BURST':'10000','AUTH_RATE_LIMIT_SUBJECT_BURST':'1000','AUTH_RATE_LIMIT_INSTALL_BURST':'100'}.items():env[name]=value
disabled=[name for name in env if name.startswith(('WORKMESH_BETA_','WORKMESH_EXPERIMENTAL_'))]
for name in disabled:env.pop(name)
env['WORKMESH_PLAYWRIGHT_RUN_DIR']=str(root/'.tmp/m4-4adc5e39/playwright')
private.write_text(json.dumps(env,indent=2)+'\n',encoding='utf-8')
report={'scope':'仅本卡独立私有环境','masterKeyFormat':'64 hex；原base64准备错误已纠正，值不存入公共工件','authBursts':'逐项沿现行CI env，不改变产品配置默认门禁','globalFeatureNamesRemoved':disabled,'sixDomainActivation':'optional-domains.fixture.ts按部署启用六域；根旧套件保默认关闭负例','objectStoreBucket':env['S3_BUCKET'],'productionChanged':False}
(root/'docs/plan/agent-mcp-m4/execution/required-environment-correction.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=True))
