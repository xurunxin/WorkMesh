import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  agentLockManifest,
  agentLockRanks,
  agentLockStatementManifest,
  type AgentLockStatementExemption,
  type AgentLockStatementManifestEntry,
} from './agent-lock-order-manifest.js'

const root=join(import.meta.dirname,'../../..')
const productionRoots=['apps/api/src','apps/worker/src','packages/db/src']
const normalized=(path:string)=>relative(root,path).replaceAll('\\','/')

async function sourceFiles(directory:string):Promise<string[]> {
  const entries=await readdir(directory,{withFileTypes:true})
  return (await Promise.all(entries.map(async entry=>{
    const path=join(directory,entry.name)
    if(entry.isDirectory()) return sourceFiles(path)
    return entry.isFile()&&/\.(?:ts|tsx)$/.test(entry.name)&&!entry.name.endsWith('.test.ts')?[path]:[]
  }))).flat()
}

const rankedPattern=new RegExp(`\\b(?:${agentLockRanks.join('|')})\\b`,'i')
const lockOrWritePattern=/\b(?:FOR\s+(?:UPDATE|SHARE)|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\b/i
const rankSet=new Set<string>(agentLockRanks)
const rankIndex=new Map<string,number>(agentLockRanks.map((rank,index)=>[rank,index]))
const terminalMultiRankExemption:AgentLockStatementExemption=
  'SKIP_LOCKED_TERMINAL_MULTI_RANK'

type RankedStatement=AgentLockStatementManifestEntry & {
  position:number
  end:number
}

function routeOwner(node:ts.Node):string|undefined {
  let current:ts.Node|undefined=node
  let namedOwner:string|undefined
  while(current) {
    if(ts.isFunctionDeclaration(current)&&current.name) namedOwner??=current.name.text
    if(
      (ts.isArrowFunction(current)||ts.isFunctionExpression(current))
      && ts.isVariableDeclaration(current.parent)
      && ts.isIdentifier(current.parent.name)
    ) namedOwner??=current.parent.name.text
    if(
      (ts.isArrowFunction(current)||ts.isFunctionExpression(current))
      && ts.isPropertyAssignment(current.parent)
    ) namedOwner??=current.parent.name.getText()
    if(
      (ts.isArrowFunction(current)||ts.isFunctionExpression(current))
      && ts.isCallExpression(current.parent)
    ) {
      const call=current.parent
      if(
        ts.isPropertyAccessExpression(call.expression)
        && ['get','post','put','patch','delete'].includes(call.expression.name.text)
        && call.arguments[0]
        && ts.isStringLiteralLike(call.arguments[0])
      ) return `${call.expression.name.text.toUpperCase()} ${call.arguments[0].text}`
    }
    current=current.parent
  }
  return namedOwner
}

function tableAliases(sql:string):Map<string,string> {
  const aliases=new Map<string,string>()
  const keyword=/^(?:where|join|left|right|inner|outer|full|cross|on|set|using|order|group|limit|for|returning)$/i
  for(const match of sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)(?:\s+(?:AS\s+)?([a-z_][a-z0-9_]*))?/gi)) {
    const table=match[1]!.toLowerCase()
    const alias=match[2]&&!keyword.test(match[2])?match[2].toLowerCase():table
    aliases.set(table,table)
    aliases.set(alias,table)
  }
  return aliases
}

type RankedSemanticEvent = {
  position:number
  class:'ranked-lock'|'ranked-write'
  ranks:string[]
  terminalSkipLocked?:boolean
}

const uniqueRanks=(ranks:readonly string[]):string[]=>
  [...new Set(ranks.filter(rank=>rankSet.has(rank)))]

function rankedSemanticEvents(sql:string):RankedSemanticEvent[] {
  const events:RankedSemanticEvent[]=[]
  for(const match of sql.matchAll(
    /\bUPDATE\s+([a-z_][a-z0-9_]*)(?:\s+(?:AS\s+)?[a-z_][a-z0-9_]*)?\s+SET\b/gi,
  )) events.push({
    position:match.index,
    class:'ranked-write',
    ranks:uniqueRanks([match[1]!.toLowerCase()]),
  })
  for(const match of sql.matchAll(/\bDELETE\s+FROM\s+([a-z_][a-z0-9_]*)\b/gi))
    events.push({
      position:match.index,
      class:'ranked-write',
      ranks:uniqueRanks([match[1]!.toLowerCase()]),
    })
  for(const match of sql.matchAll(
    /\bINSERT\s+INTO\s+([a-z_][a-z0-9_]*)[^;]*?\bON\s+CONFLICT\b[^;]*?\bDO\s+UPDATE\b/gi,
  )) {
    const doUpdateOffset=match[0].search(/\bDO\s+UPDATE\b/i)
    events.push({
      position:match.index+doUpdateOffset,
      class:'ranked-write',
      ranks:uniqueRanks([match[1]!.toLowerCase()]),
    })
  }
  for(const match of sql.matchAll(
    /\bFOR\s+(?:UPDATE|SHARE)(?:\s+OF\s+([a-z0-9_,\s]+?))?(?=\s+(?:NOWAIT|SKIP\s+LOCKED)|\s*(?:\)|;|$))/gi,
  )) {
    const statementStart=sql.lastIndexOf(';',match.index)+1
    const scope=sql.slice(statementStart,match.index)
    const aliases=tableAliases(scope)
    const ranks=match[1]
      ? match[1].split(',').map(value=>value.trim().toLowerCase())
        .map(alias=>aliases.get(alias)??alias)
      : [...scope.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)]
        .map(table=>table[1]!.toLowerCase())
    events.push({
      position:match.index,
      class:'ranked-lock',
      ranks:uniqueRanks(ranks),
      terminalSkipLocked:/^\s+SKIP\s+LOCKED\b/i
        .test(sql.slice(match.index+match[0].length)),
    })
  }
  return events
    .filter(event=>event.ranks.length>0)
    .sort((left,right)=>left.position-right.position)
}

function rankedStatement(
  node:ts.StringLiteralLike|ts.TemplateExpression,
  source:ts.SourceFile,
  file:string,
):RankedStatement|undefined {
  const sql=node.getText(source)
  if(!rankedPattern.test(sql)||!lockOrWritePattern.test(sql)) return undefined
  const normalized=sql.replaceAll(/[`'"]/g,' ')
  const events=rankedSemanticEvents(normalized)
  const statementClass=events.some(event=>event.class==='ranked-write')
    ? 'ranked-write'
    : 'ranked-lock'
  const ranks=events.flatMap(event=>event.ranks)
  if(!ranks.length) return undefined
  const owner=routeOwner(node)??'<module>'
  const fingerprint=createHash('sha256')
    .update(`${file}\0${owner}\0${normalized.replaceAll(/\s+/g,' ').trim().toLowerCase()}`)
    .digest('hex')
  const location=source.getLineAndCharacterOfPosition(node.getStart(source))
  const siteKey=`${location.line+1}:${location.character+1}`
  return {
    statementId:`${siteKey}:${fingerprint}`,
    siteKey,
    file,
    owner,
    class:statementClass,
    rankSequence:ranks as RankedStatement['rankSequence'],
    position:node.getStart(source),
    end:node.getEnd(),
  }
}

function rankedStatements(sourceText:string,file:string):RankedStatement[] {
  const source=ts.createSourceFile(file,sourceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const statements:RankedStatement[]=[]
  const visit=(node:ts.Node):void=>{
    if(
      ts.isStringLiteralLike(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateExpression(node)
    ) {
      const statement=rankedStatement(node,source,file)
      if(statement) statements.push(statement)
    }
    ts.forEachChild(node,visit)
  }
  visit(source)
  const occurrences=new Map<string,number>()
  return statements.sort((left,right)=>left.position-right.position).map(statement=>{
    const occurrence=(occurrences.get(statement.statementId)??0)+1
    occurrences.set(statement.statementId,occurrence)
    return {...statement,statementId:`${statement.statementId}#${occurrence}`}
  })
}

function manifestStatements(
  statements:readonly RankedStatement[],
  declarations:readonly AgentLockStatementManifestEntry[]=[],
):AgentLockStatementManifestEntry[] {
  const declared=new Map(declarations.map(entry=>[`${entry.file}:${entry.statementId}`,entry]))
  return statements.map(({position:_,end:__,...statement})=>{
    const exemption=declared.get(`${statement.file}:${statement.statementId}`)?.exemption
    return {...statement,...(exemption?{exemption}: {})}
  }).sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

function staticViolations(
  sourceText:string,
  file:string,
  declarations:readonly AgentLockStatementManifestEntry[]=agentLockStatementManifest,
):string[] {
  const statements=rankedStatements(sourceText,file)
  const violations:string[]=[]
  const declarationById=new Map(
    declarations.map(entry=>[`${entry.file}:${entry.statementId}`,entry]),
  )
  const source=ts.createSourceFile(file,sourceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const enclosingFunction=(node:ts.Node):ts.FunctionLikeDeclaration|undefined=>{
    let current=node.parent
    while(current&&!ts.isFunctionLike(current)) current=current.parent
    return current as ts.FunctionLikeDeclaration|undefined
  }
  const plannerCalls:{owner:string;position:number}[]=[]
  const visit=(node:ts.Node):void=>{
    if(
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text==='lockAgentAuthorityPlan'
    ) {
      const owner=enclosingFunction(node)
      if(owner) plannerCalls.push({
        owner:routeOwner(owner)??'<anonymous>',
        position:node.getStart(source),
      })
    }
    ts.forEachChild(node,visit)
  }
  visit(source)
  for(const statement of statements) {
    const declaration=declarationById.get(`${statement.file}:${statement.statementId}`)
    const indices=statement.rankSequence.map(rank=>rankIndex.get(rank)!)
    const monotonic=indices.every((index,position)=>
      position===0||index>=indices[position-1]!)
    const fragment=sourceText.slice(statement.position,statement.end)
    const laterCoreRank=statements.some(candidate=>
      candidate.owner===statement.owner
      && candidate.position>statement.position,
    )||plannerCalls.some(call=>
      call.owner===statement.owner
      && call.position>statement.position,
    )
    const fragmentEvents=rankedSemanticEvents(fragment.replaceAll(/[`'"]/g,' '))
    const terminalEvent=[...fragmentEvents].reverse()
      .find(event=>event.terminalSkipLocked)
    const skipLockedIsLastCoreEvent=terminalEvent!==undefined
      && fragmentEvents.every(event=>event.position<=terminalEvent.position)
    const isPureRankedLockClaim=fragmentEvents.every(event=>event.class==='ranked-lock')
    const validTerminalExemption=
      declaration?.exemption===terminalMultiRankExemption
      && statement.rankSequence.length>1
      && !monotonic
      && skipLockedIsLastCoreEvent
      && isPureRankedLockClaim
      && !laterCoreRank
    if(!monotonic&&!validTerminalExemption)
      violations.push(
        `${statement.owner}: non-monotonic rank sequence ${statement.rankSequence.join(' -> ')}`,
      )
    if(declaration?.exemption===terminalMultiRankExemption&&!validTerminalExemption)
      violations.push(
        `${statement.owner}: invalid ${terminalMultiRankExemption} exemption`,
      )
    if(
      file==='apps/api/src/collaboration/routes.ts'
      && statement.class==='ranked-lock'
      && statement.rankSequence.length>1
    ) violations.push(`${statement.owner}: manual multi-table ranked FOR UPDATE`)
    if(
      statement.class==='ranked-lock'
      && /\b(?:[a-z_][a-z0-9_]*\.)?id\s*=\s*ANY\s*\(/i.test(fragment)
      && !/\bORDER\s+BY\b/i.test(fragment)
    ) violations.push(`${statement.owner}: multi-row ranked lock lacks stable ORDER BY`)
  }
  for(const call of plannerCalls) {
    const earlierLock=statements.find(statement=>
      statement.class==='ranked-lock'
      && statement.position<call.position
      && statement.owner===call.owner)
    if(earlierLock) violations.push(`${call.owner}: planner follows a ranked lock`)
  }
  return violations
}

function sqlFragments(sourceText:string,file:string):string[] {
  const source=ts.createSourceFile(file,sourceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const fragments:string[]=[]
  const visit=(node:ts.Node):void=>{
    if(
      ts.isStringLiteralLike(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateExpression(node)
    ) {
      if(rankedStatement(node,source,file)) fragments.push(node.getText(source))
    }
    ts.forEachChild(node,visit)
  }
  visit(source)
  return fragments
}

describe('Agent authority lock-order inventory',()=>{
  it('keeps the central ranked helper complete, ordered, and sorted within each rank',async()=>{
    const source=await readFile(join(root,'packages/db/src/agent-locks.ts'),'utf8')
    const positions=agentLockRanks.map(rank=>source.indexOf(rank))
    expect(positions.every(position=>position>=0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left,right)=>left-right))
    expect(source).toMatch(/sortedIds[\s\S]*new Set[\s\S]*localeCompare/)
    expect(source).toMatch(/ORDER BY access\.agent_id,access\.team_id,access\.workspace_id/)
    expect(source).toMatch(/ORDER BY id[\s\S]*FOR UPDATE/)
  })

  it('keeps Connection credential reconciliation inside rank 7 of the unified claim plan',async()=>{
    const locks=await readFile(join(root,'packages/db/src/agent-locks.ts'),'utf8')
    const helperStart=locks.indexOf(
      'export async function lockAgentAuthorityPlanWithInstallationTokenWrite',
    )
    const helper=locks.slice(helperStart)
    expect(helperStart).toBeGreaterThanOrEqual(0)
    expect(helper.indexOf("lockIds(tx, 'agent_sessions'")).toBeLessThan(
      helper.indexOf('writeInstallationToken(tx)'),
    )
    expect(helper.indexOf("lockIds(tx, 'agent_installation_tokens'")).toBeLessThan(
      helper.indexOf('writeInstallationToken(tx)'),
    )
    expect(helper.indexOf('writeInstallationToken(tx)')).toBeLessThan(
      helper.indexOf("lockIds(tx, 'work_items'"),
    )

    const commands=await readFile(join(root,'apps/api/src/agent/commands.ts'),'utf8')
    const claimStart=commands.indexOf('export async function claimWorkItem')
    const claimEnd=commands.indexOf('export async function exchangeAgentToken',claimStart)
    const claim=commands.slice(claimStart,claimEnd)
    expect(claim).toContain('lockAgentAuthorityPlanWithInstallationTokenWrite')
    expect(claim).toMatch(
      /lockAgentAuthorityPlanWithInstallationTokenWrite[\s\S]*async rankTx => reconcileConnectionInstallationToken\(rankTx/,
    )
    expect(claim.match(/reconcileConnectionInstallationToken\(/g)).toHaveLength(1)
  })

  it('manifests every production file with ranked locking or writes',async()=>{
    const manifested=new Set(agentLockManifest.map(entry=>entry.file))
    const offenders:string[]=[]
    for(const productionRoot of productionRoots)
      for(const file of await sourceFiles(join(root,productionRoot))) {
        const name=normalized(file)
        if(name.endsWith('agent-lock-order-manifest.ts')) continue
        const fragments=sqlFragments(await readFile(file,'utf8'),file)
        if(fragments.length&&!manifested.has(name)) offenders.push(name)
      }
    expect([...new Set(offenders)].sort()).toEqual([])
  },15_000)

  it('manifests every ranked SQL statement with its transaction owner and rank sequence',async()=>{
    const actual:RankedStatement[]=[]
    for(const productionRoot of productionRoots)
      for(const file of await sourceFiles(join(root,productionRoot))) {
        const name=normalized(file)
        if(name.endsWith('agent-lock-order-manifest.ts')) continue
        actual.push(...rankedStatements(await readFile(file,'utf8'),name))
      }
    const manifested=[...agentLockStatementManifest].sort((left,right)=>
      JSON.stringify(left).localeCompare(JSON.stringify(right)))
    if(process.env.UPDATE_AGENT_LOCK_MANIFEST==='1') {
      const entries=manifestStatements(actual,agentLockStatementManifest)
        .sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)))
      const manifestPath=join(root,'packages/db/src/agent-lock-order-manifest.ts')
      const current=await readFile(manifestPath,'utf8')
      const start=current.indexOf('export const agentLockStatementManifest:')
      const arrayStart=current.indexOf('= [',start)+2
      const arrayEnd=current.indexOf('\n]',arrayStart)
      const rendered=entries.map(entry=>{
        const factory=entry.class==='ranked-lock'?'lock':'write'
        const args=[entry.statementId,entry.siteKey,entry.file,entry.owner,entry.rankSequence]
          .map(value=>JSON.stringify(value)).join(',')
        return `  ${factory}(${args}${entry.exemption?`,${JSON.stringify(entry.exemption)}`:''}),`
      }).join('\n')
      await writeFile(manifestPath,`${current.slice(0,arrayStart+1)}\n${rendered}${current.slice(arrayEnd)}`)
      return
    }
    expect(new Set(manifested.map(entry=>`${entry.file}:${entry.statementId}`)).size)
      .toBe(manifested.length)
    expect(manifestStatements(actual,agentLockStatementManifest)).toEqual(manifested)
  },15_000)

  it('keeps Room message authorization on its merged plan without a nested planner',async()=>{
    const source=await readFile(join(root,'apps/api/src/collaboration/routes.ts'),'utf8')
    const start=source.indexOf('async function assertSessionMessageWrite')
    const end=source.indexOf('async function assertLeaseResourceScope',start)
    const guard=source.slice(start,end)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(guard).toContain('revalidateLockedAgentSessionForMutation')
    expect(guard).not.toMatch(
      /authorizeCommandInTx|loadAgentSessionForMutation|lockAgentAuthorityPlan|FOR\s+(?:UPDATE|SHARE)/,
    )
  })

  it('requires maintainable symbol, class, rank, order, and exemption metadata',async()=>{
    for(const entry of agentLockManifest) {
      expect(entry.symbols.length).toBeGreaterThan(0)
      expect(entry.classes.length).toBeGreaterThan(0)
      expect(entry.ranks.length).toBeGreaterThan(0)
      const source=await readFile(join(root,entry.file),'utf8')
      for(const symbol of entry.symbols) expect(source).toContain(symbol)
      if(entry.classes.includes('terminal-skip-locked')) {
        expect(entry.order).toBe('terminal-claim')
        expect(entry.exemption?.length).toBeGreaterThan(20)
        expect(source).toMatch(/FOR UPDATE(?: OF \w+)? SKIP LOCKED/i)
      }
    }
  })

  it('rejects ambiguous multi-table FOR UPDATE and unsorted multi-row ranked locks',async()=>{
    const helper=await readFile(join(root,'packages/db/src/agent-locks.ts'),'utf8')
    expect(helper).not.toMatch(/\bJOIN\b[\s\S]{0,400}\bFOR UPDATE(?!\s+OF\b)/i)
    expect(helper).toMatch(/WHERE id=ANY\(\$1::uuid\[\]\)[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/)
  })

  it('rejects unsafe production ordering and proves the negative fixtures',async()=>{
    const productionViolations:string[]=[]
    for(const productionRoot of productionRoots)
      for(const file of await sourceFiles(join(root,productionRoot))) {
        const name=normalized(file)
        if(name.endsWith('agent-lock-order-manifest.ts')) continue
        productionViolations.push(...staticViolations(await readFile(file,'utf8'),name))
      }
    expect(productionViolations).toEqual([])

    const fixtures=[
      {
        source:"async function bad(tx:any){await tx.query('SELECT d.id,s.id FROM delegations d JOIN agent_sessions s ON s.delegation_id=d.id FOR UPDATE')}",
        expected:'manual multi-table ranked FOR UPDATE',
        file:'apps/api/src/collaboration/routes.ts',
      },
      {
        source:"async function bad(tx:any,ids:string[]){await tx.query('SELECT id FROM agent_sessions WHERE id=ANY($1::uuid[]) FOR UPDATE',[ids])}",
        expected:'multi-row ranked lock lacks stable ORDER BY',
        file:'apps/api/src/fixture.ts',
      },
      {
        source:"async function bad(tx:any){await tx.query('SELECT id FROM agent_sessions WHERE id=$1 FOR UPDATE');await lockAgentAuthorityPlan(tx,{})}",
        expected:'planner follows a ranked lock',
        file:'apps/api/src/fixture.ts',
      },
    ]
    for(const fixture of fixtures)
      expect(staticViolations(fixture.source,fixture.file).join('\n')).toContain(fixture.expected)
    const reversedSource=
      "async function bad(tx:any){await tx.query('SELECT s.id,d.id FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id FOR UPDATE SKIP LOCKED')}"
    const reversedFile='apps/worker/src/reversed-fixture.ts'
    expect(staticViolations(reversedSource,reversedFile).join('\n'))
      .toContain('non-monotonic rank sequence agent_sessions -> delegations')
    const terminalStatement=manifestStatements(rankedStatements(reversedSource,reversedFile))[0]!
    const terminalDeclaration={
      ...terminalStatement,
      exemption:terminalMultiRankExemption,
    } satisfies AgentLockStatementManifestEntry
    expect(staticViolations(reversedSource,reversedFile,[terminalDeclaration])).toEqual([])
    const nonTerminalSource=
      "async function bad(tx:any){await tx.query('SELECT s.id,d.id FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id FOR UPDATE SKIP LOCKED');await tx.query('UPDATE agent_sessions SET revision=revision+1 WHERE id=$1')}"
    const nonTerminalStatement=manifestStatements(
      rankedStatements(nonTerminalSource,reversedFile),
    )[0]!
    expect(staticViolations(nonTerminalSource,reversedFile,[{
      ...nonTerminalStatement,
      exemption:terminalMultiRankExemption,
    }]).join('\n')).toContain(`invalid ${terminalMultiRankExemption} exemption`)
    const sameStatementWriteAfterClaim=
      "async function bad(tx:any){await tx.query('WITH claimed AS (SELECT s.id,d.id FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id FOR UPDATE SKIP LOCKED) UPDATE agent_sessions SET revision=revision+1 WHERE id IN (SELECT id FROM claimed)')}"
    const sameStatementClaim=manifestStatements(
      rankedStatements(sameStatementWriteAfterClaim,reversedFile),
    )[0]!
    expect(staticViolations(sameStatementWriteAfterClaim,reversedFile,[{
      ...sameStatementClaim,
      exemption:terminalMultiRankExemption,
    }]).join('\n')).toContain(`invalid ${terminalMultiRankExemption} exemption`)
    const sameStatementWriteBeforeClaim=
      "async function bad(tx:any){await tx.query('WITH changed AS (UPDATE agent_sessions SET revision=revision+1 RETURNING id), claimed AS (SELECT s.id,d.id FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id FOR UPDATE SKIP LOCKED) SELECT id FROM claimed')}"
    const writeBeforeClaim=manifestStatements(
      rankedStatements(sameStatementWriteBeforeClaim,reversedFile),
    )[0]!
    expect(staticViolations(sameStatementWriteBeforeClaim,reversedFile,[{
      ...writeBeforeClaim,
      exemption:terminalMultiRankExemption,
    }]).join('\n')).toContain(`invalid ${terminalMultiRankExemption} exemption`)
    expect(manifestStatements(rankedStatements(
      "async function missing(tx:any){await tx.query('SELECT id FROM agent_sessions WHERE id=$1 FOR UPDATE')}",
      'apps/api/src/unregistered.ts',
    ))).not.toEqual([])
    const original=manifestStatements(rankedStatements(
      "async function executeAutomationAction(tx:any){await tx.query('UPDATE agent_sessions SET revision=revision+1 WHERE id=$1')}",
      'packages/db/src/stage4.ts',
    ))
    const duplicated=manifestStatements(rankedStatements(
      "async function executeAutomationAction(tx:any){await tx.query('UPDATE agent_sessions SET revision=revision+1 WHERE id=$1');await tx.query('UPDATE agent_sessions SET state=$2 WHERE id=$1')}",
      'packages/db/src/stage4.ts',
    ))
    expect(original).toHaveLength(1)
    expect(duplicated).toHaveLength(2)
    expect(duplicated).not.toEqual(original)
    expect(new Set(duplicated.map(entry=>entry.statementId)).size).toBe(2)
    const unmoved=manifestStatements(rankedStatements(
      "async function executeAutomationAction(tx:any){await tx.query('UPDATE agent_sessions SET revision=revision+1 WHERE id=$1')}",
      'packages/db/src/stage4.ts',
    ))
    const moved=manifestStatements(rankedStatements(
      "\n\nasync function executeAutomationAction(tx:any){await tx.query('UPDATE agent_sessions SET revision=revision+1 WHERE id=$1')}",
      'packages/db/src/stage4.ts',
    ))
    expect(moved[0]?.rankSequence).toEqual(unmoved[0]?.rankSequence)
    expect(moved[0]?.statementId).not.toBe(unmoved[0]?.statementId)
    expect(moved[0]?.siteKey).not.toBe(unmoved[0]?.siteKey)
    const cte=manifestStatements(rankedStatements(
      "async function saved(tx:any){await tx.query('WITH changed AS (UPDATE agent_sessions SET revision=revision+1 RETURNING id) SELECT * FROM changed')}",
      'apps/api/src/fixture.ts',
    ))
    const upsert=manifestStatements(rankedStatements(
      "async function saved(tx:any){await tx.query('INSERT INTO agent_team_access(agent_id,team_id) VALUES($1,$2) ON CONFLICT(agent_id,team_id) DO UPDATE SET revoked_at=NULL')}",
      'apps/api/src/fixture.ts',
    ))
    expect(cte).toMatchObject([{class:'ranked-write',rankSequence:['agent_sessions']}])
    expect(upsert).toMatchObject([{class:'ranked-write',rankSequence:['agent_team_access']}])
    const lockThenWrite=manifestStatements(rankedStatements(
      "async function saved(tx:any){await tx.query('WITH locked AS (SELECT id FROM delegations FOR UPDATE) UPDATE agent_sessions SET revision=revision+1 WHERE id=$1')}",
      'apps/api/src/fixture.ts',
    ))
    expect(lockThenWrite).toMatchObject([{
      class:'ranked-write',
      rankSequence:['delegations','agent_sessions'],
    }])
    const interleaved=manifestStatements(rankedStatements(
      "async function saved(tx:any){await tx.query('WITH changed AS (UPDATE agent_definitions SET revision=revision+1), locked AS (SELECT s.id,d.id FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id FOR SHARE), removed AS (DELETE FROM work_items RETURNING id) SELECT 1')}",
      'apps/api/src/fixture.ts',
    ))
    expect(interleaved).toMatchObject([{
      class:'ranked-write',
      rankSequence:[
        'agent_definitions',
        'agent_sessions',
        'delegations',
        'work_items',
      ],
    }])
    const reverseTextOrder=manifestStatements(rankedStatements(
      "async function saved(tx:any){await tx.query('DELETE FROM projects WHERE id=$1; UPDATE agent_sessions SET revision=revision+1 WHERE id=$2')}",
      'apps/api/src/fixture.ts',
    ))
    expect(reverseTextOrder).toMatchObject([{
      class:'ranked-write',
      rankSequence:['projects','agent_sessions'],
    }])
    expect(manifestStatements(rankedStatements(
      `\n${"async function saved(tx:any){await tx.query('INSERT INTO agent_team_access(agent_id,team_id) VALUES($1,$2) ON CONFLICT(agent_id,team_id) DO UPDATE SET revoked_at=NULL')}"}`,
      'apps/api/src/fixture.ts',
    ))[0]?.statementId).not.toBe(upsert[0]?.statementId)
  },
  30000,
  )
})

