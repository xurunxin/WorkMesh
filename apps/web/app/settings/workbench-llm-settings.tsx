'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { Button, Eyebrow, SettingsCard, SettingsForm } from '@workmesh/ui'
import { apiRequest, json, type ListResponse } from '../lib/api'
import { useLocale } from '../lib/i18n'

type Connection = {
  id: string; scope: 'personal' | 'team' | 'workspace'; scope_id: string | null
  name: string; api_type: 'openai-completions' | 'openai-responses'; base_url: string
  status: 'active' | 'disabled' | 'revoked'; secret_status: 'configured' | 'missing'; revision: number
  can_manage: boolean
}
type Model = { id: string; external_model_id: string; display_name: string; enabled: boolean; revision: number
  capabilities: { inputModalities: string[]; toolCalling: boolean; reasoning: boolean; contextWindowTokens: number; maxOutputTokens: number } }
type Detail = Connection & { models: Model[] }
type Team = { id: string; name: string }

const root = '/api/v1/workbench/llm-connections'
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

export function WorkbenchLlmSettings({ canManageWorkspace, teams }: { canManageWorkspace: boolean; teams: Team[] }) {
  const { settingsCopy: text } = useLocale()
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
      setNotice(text.connectionSavedNotice)
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
      setNotice(text.connectionUpdatedNotice)
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
      setNotice(text.modelAddedNotice)
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const toggleModel = async (model: Model) => {
    if (!detail || !detail.can_manage) return
    const connectionId = detail.id
    setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest(`${root}/${connectionId}/models`, {
        method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${detail.revision}"` },
        body: JSON.stringify({
          externalModelId: model.external_model_id, displayName: model.display_name,
          enabled: !model.enabled, capabilities: model.capabilities,
        }),
      })
      const latest = await apiRequest<Detail>(`${root}/${connectionId}`)
      setDetail(current => current?.id === connectionId ? latest : current)
      setNotice(model.enabled ? text.modelDisabledNotice : text.modelEnabledNotice)
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
      setNotice(text.connectionRevokedNotice)
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  // W17: this page is a full route, so its title is the page-level heading. The
  // shell sets the document title but renders no <h1>, which left the route with
  // no heading for assistive technology to anchor (found by the accessibility
  // matrix in apps/web/e2e/workbench-accessibility.spec.ts).
  return <SettingsCard aria-labelledby="workbench-llm-heading" className="workbench-llm-settings" headingLevel={1} kicker={text.workbenchKicker} title={<span id="workbench-llm-heading">{text.workbenchServiceTitle}</span>} wide>
    <p>{text.pageDescription}</p>
    {error && <div role="alert"><p className="error">{error}</p><Button onClick={() => { setError(''); void refresh().catch(reason => setError(errorText(reason))) }}>{text.retry}</Button></div>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>{text.loadingServices}</p> : <>
      <div className="workbench-llm-list" role="group" aria-label={text.configuredServicesLabel}>
        {connections.map(connection => <Button
          aria-pressed={selectedId === connection.id} key={connection.id}
          onClick={() => { setSelectedId(connection.id); setConfirmRevoke(false) }}
          type="button" variant={selectedId === connection.id ? 'primary' : 'ghost'}
        >{connection.name} · {connection.api_type === 'openai-completions' ? text.protocolChat : text.protocolResponses} · {connection.status}</Button>)}
        {connections.length === 0 && <p>{text.noServices}</p>}
      </div>
      <SettingsForm onSubmit={create}>
        <h3>{text.addServiceHeading}</h3>
        <label>{text.nameLabel}<input maxLength={120} name="name" required /></label>
        <label>{text.scopeLabel}<select defaultValue="personal" name="scope">
          <option value="personal">{text.scopePersonal}</option>
          {teams.length > 0 && <option value="team">{text.scopeTeam}</option>}
          {canManageWorkspace && <option value="workspace">{text.scopeWorkspace}</option>}
        </select></label>
        {teams.length > 0 && <label>{text.teamScopeLabel}<select name="teamId"><option value="">{text.selectTeamOption}</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
        <label>{text.apiProtocolLabel}<select name="apiType"><option value="openai-completions">{text.apiProtocolChatCompletions}</option><option value="openai-responses">{text.apiProtocolResponses}</option></select></label>
        <label>{text.baseUrlLabel}<input autoComplete="url" name="baseUrl" placeholder={text.baseUrlPlaceholder} required type="url" /></label>
        <label>{text.apiKeyLabel}<input autoComplete="new-password" name="secretMaterial" required type="password" /></label>
        <Button disabled={busy} type="submit" variant="primary">{text.saveService}</Button>
      </SettingsForm>
      {detail && detail.status !== 'revoked' && <>
        {!detail.can_manage && <p>{text.managedElsewhereNote}</p>}
        <SettingsForm>
          <h3>{text.modelCatalogHeading}</h3>
          <ul>{detail.models.map(model => <li key={model.id}>{model.display_name} <code>{model.external_model_id}</code>
            {' · '}{model.enabled ? text.modelEnabled : text.modelDisabled}
            {detail.can_manage && <Button disabled={busy} onClick={() => void toggleModel(model)} type="button" variant="ghost">
              {model.enabled ? text.disableModel : text.enableModel}
            </Button>}
          </li>)}</ul>
          {detail.models.length === 0 && <p>{text.noModels}</p>}
        </SettingsForm>
        {detail.can_manage && <>
        <SettingsForm key={`${detail.id}:${detail.revision}`} onSubmit={update}>
          <h3>{text.editServiceHeading}</h3>
          <label>{text.nameLabel}<input defaultValue={detail.name} maxLength={120} name="name" required /></label>
          <label>{text.apiProtocolLabel}<select defaultValue={detail.api_type} name="apiType"><option value="openai-completions">{text.apiProtocolChatCompletions}</option><option value="openai-responses">{text.apiProtocolResponses}</option></select></label>
          <label>{text.baseUrlLabel}<input defaultValue={detail.base_url} name="baseUrl" required type="url" /></label>
          <label>{text.statusLabel}<select defaultValue={detail.status} name="status"><option value="active">{text.statusActive}</option><option value="disabled">{text.statusDisabled}</option></select></label>
          <label>{text.replaceKeyLabel}<input autoComplete="new-password" name="secretMaterial" type="password" /></label>
          <Button disabled={busy} type="submit">{text.saveChanges}</Button>
        </SettingsForm>
        <SettingsForm onSubmit={addModel}>
          <label>{text.modelIdLabel}<input name="modelId" placeholder={text.modelIdPlaceholder} required /></label>
          <label>{text.displayNameLabel}<input name="displayName" placeholder={text.displayNamePlaceholder} required /></label>
          <label>{text.contextLimitLabel}<input min={1} name="contextWindowTokens" required type="number" /></label>
          <label>{text.outputLimitLabel}<input min={1} name="maxOutputTokens" required type="number" /></label>
          <label><input name="toolCalling" type="checkbox" />{text.toolCallingLabel}</label>
          <label><input name="reasoning" type="checkbox" />{text.reasoningLabel}</label>
          <Button disabled={busy} type="submit">{text.addModelSubmit}</Button>
        </SettingsForm>
        {confirmRevoke ? <div role="group" aria-label={text.confirmRevocationLabel}><p>{text.revocationWarning}</p><Button disabled={busy} onClick={() => void revoke()} type="button" variant="danger">{text.confirmRevoke}</Button><Button onClick={() => setConfirmRevoke(false)} type="button">{text.cancel}</Button></div>
          : <Button onClick={() => setConfirmRevoke(true)} type="button" variant="danger">{text.revokeService}</Button>}
        </>}
      </>}
    </>}
  </SettingsCard>
}
