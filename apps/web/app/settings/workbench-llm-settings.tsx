'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { Button } from '@workmesh/ui'
import { apiRequest, json, type ListResponse } from '../lib/api'
import { useLocale } from '../lib/i18n'

type Connection = {
  id: string; scope: 'personal' | 'team' | 'workspace'; scope_id: string | null
  name: string; api_type: 'openai-completions' | 'openai-responses'; base_url: string
  status: 'active' | 'disabled' | 'revoked'; secret_status: 'configured' | 'missing'; revision: number
  can_manage: boolean
}
type Model = { id: string; external_model_id: string; display_name: string; enabled: boolean; revision: number }
type Detail = Connection & { models: Model[] }
type Team = { id: string; name: string }

const root = '/api/v1/workbench/llm-connections'
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

export function WorkbenchLlmSettings({ canManageWorkspace, teams }: { canManageWorkspace: boolean; teams: Team[] }) {
  const { locale } = useLocale()
  const zh = locale === 'zh-CN'
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const refresh = async () => {
    const response = await apiRequest<ListResponse<Connection>>(root)
    setConnections(response.items)
    setSelectedId(current => current && response.items.some(item => item.id === current) ? current : response.items[0]?.id ?? null)
  }
  useEffect(() => {
    let mounted = true
    void apiRequest<ListResponse<Connection>>(root).then(response => {
      if (!mounted) return
      setConnections(response.items)
      setSelectedId(response.items[0]?.id ?? null)
    }).catch(reason => { if (mounted) setError(errorText(reason)) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let mounted = true
    setDetail(null)
    void apiRequest<Detail>(`${root}/${selectedId}`).then(value => { if (mounted) setDetail(value) })
      .catch(reason => { if (mounted) setError(errorText(reason)) })
    return () => { mounted = false }
  }, [selectedId])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const scope = String(fields.get('scope'))
    setBusy(true); setError(''); setNotice('')
    try {
      const created = await apiRequest<Connection>(root, {
        method: 'POST', headers: json({}),
        body: JSON.stringify({
          name: String(fields.get('name')).trim(), scope,
          ...(scope === 'team' ? { teamId: String(fields.get('teamId')) } : {}),
          apiType: String(fields.get('apiType')), baseUrl: String(fields.get('baseUrl')).trim(),
          secretMaterial: String(fields.get('secretMaterial')),
        }),
      })
      form.reset()
      await refresh()
      setSelectedId(created.id)
      setNotice(zh ? '连接已保存。请登记可用模型。' : 'Connection saved. Add a model before using it.')
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const update = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail) return
    const fields = new FormData(event.currentTarget)
    const secret = String(fields.get('secretMaterial') ?? '')
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await apiRequest<Connection>(`${root}/${detail.id}`, {
        method: 'PATCH', headers: { ...json({}), 'If-Match': `"revision-${detail.revision}"` },
        body: JSON.stringify({
          name: String(fields.get('name')).trim(), apiType: String(fields.get('apiType')),
          baseUrl: String(fields.get('baseUrl')).trim(), status: String(fields.get('status')),
          ...(secret ? { secretMaterial: secret } : {}),
        }),
      })
      await refresh()
      setDetail(current => current ? { ...current, ...updated } : null)
      setNotice(zh ? '连接已更新。' : 'Connection updated.')
      event.currentTarget.reset()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const addModel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail) return
    const form = event.currentTarget
    const fields = new FormData(form)
    setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest(`${root}/${detail.id}/models`, {
        method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${detail.revision}"` },
        body: JSON.stringify({
          externalModelId: String(fields.get('modelId')).trim(),
          displayName: String(fields.get('displayName')).trim(), enabled: true,
          capabilities: {
            inputModalities: ['text'], toolCalling: fields.get('toolCalling') === 'on',
            reasoning: fields.get('reasoning') === 'on',
            contextWindowTokens: Number(fields.get('contextWindowTokens')),
            maxOutputTokens: Number(fields.get('maxOutputTokens')),
          },
        }),
      })
      setDetail(await apiRequest<Detail>(`${root}/${detail.id}`))
      form.reset()
      setNotice(zh ? '模型已登记。能力需通过真实协议测试确认。' : 'Model added. Verify capabilities with a live protocol test.')
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const revoke = async () => {
    if (!detail) return
    setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest(`${root}/${detail.id}`, {
        method: 'DELETE', headers: { 'If-Match': `"revision-${detail.revision}"` },
      })
      setConfirmRevoke(false)
      await refresh()
      setDetail(null)
      setNotice(zh ? '连接已吊销，凭据已清除。' : 'Connection revoked and credential erased.')
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  return <section aria-labelledby="workbench-llm-heading" className="settings-card settings-card-wide workbench-llm-settings">
    <header><div><p className="eyebrow">{zh ? 'Agent 工作台' : 'Agent workbench'}</p><h2 id="workbench-llm-heading">{zh ? '模型服务接入' : 'Model service connections'}</h2></div></header>
    <p>{zh ? '选择 Chat Completions 或 Responses 协议。密钥由服务端加密保存，页面仅显示配置状态。' : 'Choose Chat Completions or Responses. The server stores credentials encrypted and only shows their status.'}</p>
    {error && <div role="alert"><p className="error">{error}</p><Button onClick={() => { setError(''); void refresh().catch(reason => setError(errorText(reason))) }}>{zh ? '重试' : 'Retry'}</Button></div>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>{zh ? '正在加载服务…' : 'Loading services…'}</p> : <>
      <div className="workbench-llm-list" role="group" aria-label={zh ? '已配置服务' : 'Configured services'}>
        {connections.map(connection => <Button
          aria-pressed={selectedId === connection.id} key={connection.id}
          onClick={() => { setSelectedId(connection.id); setConfirmRevoke(false) }}
          type="button" variant={selectedId === connection.id ? 'primary' : 'ghost'}
        >{connection.name} · {connection.api_type === 'openai-completions' ? 'Chat' : 'Responses'} · {connection.status}</Button>)}
        {connections.length === 0 && <p>{zh ? '暂无模型服务。' : 'No model services configured.'}</p>}
      </div>
      <form className="settings-form" onSubmit={create}>
        <h3>{zh ? '添加服务' : 'Add service'}</h3>
        <label>{zh ? '名称' : 'Name'}<input maxLength={120} name="name" required /></label>
        <label>{zh ? '使用范围' : 'Scope'}<select defaultValue="personal" name="scope">
          <option value="personal">{zh ? '仅自己' : 'Personal'}</option>
          {teams.length > 0 && <option value="team">{zh ? '团队' : 'Team'}</option>}
          {canManageWorkspace && <option value="workspace">{zh ? '全工作区' : 'Workspace'}</option>}
        </select></label>
        {teams.length > 0 && <label>{zh ? '团队（仅团队范围需要）' : 'Team (for team scope)'}<select name="teamId"><option value="">{zh ? '选择团队' : 'Select a team'}</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
        <label>{zh ? 'API 协议' : 'API protocol'}<select name="apiType"><option value="openai-completions">Chat Completions</option><option value="openai-responses">Responses</option></select></label>
        <label>{zh ? '服务地址' : 'Base URL'}<input autoComplete="url" name="baseUrl" placeholder="https://api.minimax.cn/v1" required type="url" /></label>
        <label>{zh ? 'API 密钥' : 'API key'}<input autoComplete="new-password" name="secretMaterial" required type="password" /></label>
        <Button disabled={busy} type="submit" variant="primary">{zh ? '保存服务' : 'Save service'}</Button>
      </form>
      {detail && detail.status !== 'revoked' && <>
        {!detail.can_manage && <p>{zh ? '此服务由其他管理员维护，你可以查看已登记的模型。' : 'Another administrator manages this service. You can view its models.'}</p>}
        <div className="settings-form">
          <h3>{zh ? '模型目录' : 'Model catalog'}</h3>
          <ul>{detail.models.map(model => <li key={model.id}>{model.display_name} <code>{model.external_model_id}</code></li>)}</ul>
          {detail.models.length === 0 && <p>{zh ? '尚未登记模型。' : 'No models added.'}</p>}
        </div>
        {detail.can_manage && <>
        <form className="settings-form" key={`${detail.id}:${detail.revision}`} onSubmit={update}>
          <h3>{zh ? '编辑服务' : 'Edit service'}</h3>
          <label>{zh ? '名称' : 'Name'}<input defaultValue={detail.name} maxLength={120} name="name" required /></label>
          <label>{zh ? 'API 协议' : 'API protocol'}<select defaultValue={detail.api_type} name="apiType"><option value="openai-completions">Chat Completions</option><option value="openai-responses">Responses</option></select></label>
          <label>{zh ? '服务地址' : 'Base URL'}<input defaultValue={detail.base_url} name="baseUrl" required type="url" /></label>
          <label>{zh ? '状态' : 'Status'}<select defaultValue={detail.status} name="status"><option value="active">{zh ? '启用' : 'Active'}</option><option value="disabled">{zh ? '停用' : 'Disabled'}</option></select></label>
          <label>{zh ? '替换密钥（留空则保留）' : 'Replace key (leave blank to keep)'}<input autoComplete="new-password" name="secretMaterial" type="password" /></label>
          <Button disabled={busy} type="submit">{zh ? '保存更改' : 'Save changes'}</Button>
        </form>
        <form className="settings-form" onSubmit={addModel}>
          <label>{zh ? '模型 ID' : 'Model ID'}<input name="modelId" placeholder="MiniMax-M3" required /></label>
          <label>{zh ? '显示名称' : 'Display name'}<input name="displayName" placeholder="MiniMax M3" required /></label>
          <label>{zh ? '上下文上限（token）' : 'Context limit (tokens)'}<input min={1} name="contextWindowTokens" required type="number" /></label>
          <label>{zh ? '输出上限（token）' : 'Output limit (tokens)'}<input min={1} name="maxOutputTokens" required type="number" /></label>
          <label><input name="toolCalling" type="checkbox" />{zh ? '工具调用' : 'Tool calling'}</label>
          <label><input name="reasoning" type="checkbox" />{zh ? '推理能力' : 'Reasoning'}</label>
          <Button disabled={busy} type="submit">{zh ? '登记模型' : 'Add model'}</Button>
        </form>
        {confirmRevoke ? <div role="group" aria-label={zh ? '确认吊销' : 'Confirm revocation'}><p>{zh ? '吊销后无法恢复此密钥。' : 'Revocation permanently erases this credential.'}</p><Button disabled={busy} onClick={() => void revoke()} type="button" variant="danger">{zh ? '确认吊销' : 'Confirm revoke'}</Button><Button onClick={() => setConfirmRevoke(false)} type="button">{zh ? '取消' : 'Cancel'}</Button></div>
          : <Button onClick={() => setConfirmRevoke(true)} type="button" variant="danger">{zh ? '吊销服务' : 'Revoke service'}</Button>}
        </>}
      </>}
    </>}
  </section>
}
