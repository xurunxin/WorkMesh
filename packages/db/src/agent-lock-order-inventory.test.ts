import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { agentLockManifest, agentLockRanks } from './agent-lock-order-manifest.js'

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
const lockOrWritePattern=/\b(?:FOR\s+(?:UPDATE|SHARE)|UPDATE|DELETE\s+FROM)\b/i

function sqlFragments(sourceText:string,file:string):string[] {
  const source=ts.createSourceFile(file,sourceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const fragments:string[]=[]
  const visit=(node:ts.Node):void=>{
    if(
      ts.isStringLiteralLike(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateExpression(node)
    ) {
      const text=node.getText(source)
      if(rankedPattern.test(text)&&lockOrWritePattern.test(text)) fragments.push(text)
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
})
