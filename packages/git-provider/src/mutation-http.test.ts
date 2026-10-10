import {generateKeyPairSync} from 'node:crypto'
import {once} from 'node:events'
import {readFileSync} from 'node:fs'
import {createServer,request} from 'node:https'
import {describe,expect,it} from 'vitest'
import {GiteaProvider,GitHubAppProvider,type GitProvider} from './index.js'

const cert=readFileSync(new URL('../../conformance/src/fixtures/model-test-ca.pem',import.meta.url))
const key=readFileSync(new URL('../../conformance/src/fixtures/model-test-key.pem',import.meta.url))
// Use the real TLS/HTTP stack with only the exact public fixture CA trusted.
const localFetch:typeof fetch=async(input,init={})=>new Promise((resolve,reject)=>{
  const req=request(new URL(String(input)),{ca:cert,method:init.method,headers:Object.fromEntries(new Headers(init.headers))},res=>{
    const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(Buffer.from(chunk)));res.on('error',reject)
    res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode??500,headers:{'content-type':'application/json'}})))
  })
  req.on('error',reject);req.end(init.body)
})
const kinds=['branch','commit','commit_update','open','merge','retry','context'] as const
type Kind=typeof kinds[number]
async function execute(provider:GitProvider,name:'github'|'gitea',kind:Kind) {
  const common={provider:name,connectionId:'local',repositoryId:'9001',repositoryFullName:'acme/workmesh'}
  switch(kind) {
    case 'branch':return provider.createBranch({...common,name:'workmesh/test',baseSha:'base'})
    case 'commit':case 'commit_update':return provider.createCommit({...common,idempotencyKey:'local-exact',branch:'workmesh/test',expectedHeadSha:'base',message:'one',files:[{path:'src/test.ts',content:'one'}]})
    case 'open':return provider.openPullRequest({...common,idempotencyKey:'local-open',baseBranch:'main',headBranch:'workmesh/test',title:'Local',body:'Evidence',draft:false})
    case 'merge':return provider.mergePullRequest({...common,pullRequestId:'71',expectedHeadSha:'head',method:'squash'})
    case 'retry':return provider.retryCheck({...common,checkRunId:'42'})
    case 'context':return provider.resolveRepositoryGuidance({...common,commitSha:'base',scopedPaths:['src/**']})
  }
}
describe('M3 provider每次写HTTP许可的本机真实传输窗口',()=>{
  it.each(['github','gitea'] as const)('%s所有受支持写窗口逐个拒绝；GET不领取写许可',async name=>{
    let merged=false,kind:Kind='branch';const writes:string[]=[],reads:string[]=[]
    const server=createServer({key,cert},(req,res)=>{
      const path=req.url??'';res.setHeader('content-type','application/json')
      if(path.endsWith('/access_tokens')){res.end(JSON.stringify({token:'public-local-fixture',expires_at:new Date(Date.now()+3600000).toISOString()}));return}
      if(req.method==='GET')reads.push(path);else writes.push(`${req.method}:${path}`)
      const pull={id:71,number:71,html_url:'https://local.test/pull/71',base:{ref:'main',sha:'base'},head:{ref:'workmesh/test',sha:'head'},state:merged?'closed':'open',merged,merge_commit_sha:merged?'merged':undefined,draft:false}
      let body:unknown={}
      if(path.includes('/pulls?'))body=[]
      else if(path.endsWith('/merge')){merged=true;body={merged:true,sha:'merged'}}
      else if(path.includes('/pulls'))body=pull
      else if(path.endsWith('/branches'))body={name:'workmesh/test',commit:{id:'base'}}
      else if(path.includes('/git/ref/heads/'))body={object:{sha:'base'}}
      else if(path.includes('/git/commits/base'))body={tree:{sha:'base-tree'}}
      else if(path.includes('/git/trees/base-tree'))body={tree:[{path:'AGENTS.md',type:'blob',sha:'guidance'}]}
      else if(path.includes('/git/blobs/'))body={encoding:'base64',content:Buffer.from('# Local guidance').toString('base64')}
      else if(path.endsWith('/git/trees'))body={sha:'new-tree'}
      else if(path.endsWith('/git/commits'))body={sha:'new-commit',html_url:'https://local.test/commit'}
      else if(path.includes('/contents/')&&req.method==='GET') {
        if(kind==='context')body={sha:'guidance',encoding:'base64',content:Buffer.from('# Local guidance').toString('base64')}
        else if(kind==='commit_update')body={sha:'existing-file'}
        else {res.statusCode=404;body={}}
      } else if(path.includes('/contents/'))body={commit:{sha:'new-commit',html_url:'https://local.test/commit'}}
      res.end(JSON.stringify(body))
    })
    server.listen(0,'127.0.0.1');await once(server,'listening')
    const baseUrl=`https://127.0.0.1:${(server.address() as {port:number}).port}`
    if(name==='gitea') {
      const provider=new GiteaProvider({baseUrl,accessToken:'public-local-fixture',fetch:localFetch,beforeMutation:async()=>{throw new Error('Unsupported must not request permission')}})
      await expect(provider.createCommit({provider:'gitea',connectionId:'local',repositoryId:'9001',repositoryFullName:'acme/workmesh',branch:'workmesh/test',expectedHeadSha:'base',message:'Unsupported multi-file',files:[{path:'a.ts',content:'a'},{path:'b.ts',content:'b'}],idempotencyKey:'multi-file'})).rejects.toMatchObject({code:'PROVIDER_CAPABILITY_UNSUPPORTED'})
      expect(writes).toEqual([]);expect(reads).toEqual([])
    }
    const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString()
    try {
      for(kind of kinds) {
        if(name==='github'&&kind==='commit_update')continue
        const unsupported=name==='gitea'&&kind==='retry'
        const count=kind==='context'||unsupported?0:name==='github'&&kind==='commit'?3:1
        for(let deny=0;deny<=count;deny++) {
          merged=false;writes.length=0;reads.length=0;let calls=0
          const guard=async()=>{calls++;if(calls===deny)throw new Error('LOCAL_AUTHORITY_REVOKED');return {deadlineMonotonicMs:performance.now()+5000}}
          const provider=name==='github'?new GitHubAppProvider({appId:'1',installationId:'2',privateKey,apiBaseUrl:baseUrl,fetch:localFetch,beforeMutation:guard}):new GiteaProvider({baseUrl,accessToken:'public-local-fixture',fetch:localFetch,beforeMutation:guard})
          if(unsupported)await expect(execute(provider,name,kind)).rejects.toMatchObject({code:'PROVIDER_CAPABILITY_UNSUPPORTED'})
          else if(deny)await expect(execute(provider,name,kind)).rejects.toThrow('LOCAL_AUTHORITY_REVOKED')
          else expect(await execute(provider,name,kind)).toBeDefined()
          expect(writes).toHaveLength(deny?deny-1:count);expect(calls).toBe(deny||count)
          console.info(JSON.stringify({m3ProviderWindow:{provider:name,kind,denyAt:deny,actualWrites:[...writes],readCount:reads.length,guards:calls}}))
          if(kind==='context')expect(reads.length).toBeGreaterThan(0)
        }
      }
    } finally {server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()))}
  })
})
