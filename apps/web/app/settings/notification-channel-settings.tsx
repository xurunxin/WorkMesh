'use client'

import { useEffect, useState, type FormEvent } from 'react'
import {
  notificationChannelTargetSchema,
  channelNotificationDeliverySchema,
} from '@workmesh/contracts'
import { Button, SettingsCard, SettingsForm } from '@workmesh/ui'
import { ApiError, apiMutation, apiRequest, json } from '../lib/api'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { useAuthorityLifetime } from '../lib/use-authority-lifetime'

type Target = ReturnType<typeof notificationChannelTargetSchema.parse>
type Delivery = ReturnType<typeof channelNotificationDeliverySchema.parse>
const root = '/api/v1/notification-channel-targets'
const deliveryRoot = '/api/v1/channel-notification-deliveries'
const headers = (revision: number) => ({
  ...json({}),
  'If-Match': '"revision-' + revision + '"',
})

export function NotificationChannelSettings({
  scopeKey,
}: {
  scopeKey: string
}) {
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isCurrent = useAuthorityLifetime()
  const targets = usePagedApiList<Target>(enabled ? root : null, { scopeKey })
  const deliveries = usePagedApiList<Delivery>(enabled ? deliveryRoot : null, {
    scopeKey,
  })
  useEffect(() => {
    let alive = true
    void apiRequest<{ features: Array<{ key: string; enabled: boolean }> }>(
      '/api/v1/features',
    )
      .then((config) => {
        if (alive)
          setEnabled(
            config.features.some(
              (feature) =>
                feature.key === 'WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS' &&
                feature.enabled,
            ),
          )
      })
      .catch((reason) => {
        if (
          alive &&
          !(reason instanceof ApiError && reason.code === 'FEATURE_DISABLED')
        )
          setError('无法读取个人渠道设置，请重新加载。')
      })
    return () => {
      alive = false
    }
  }, [])
  const run = async (operation: string, path: string, init: RequestInit) => {
    if (busy || !isCurrent()) return
    setBusy(true)
    setError('')
    try {
      await apiMutation(operation, path, init)
      if (isCurrent())
        await Promise.all([targets.refresh(), deliveries.refresh()])
    } catch (reason) {
      if (isCurrent())
        setError(
          reason instanceof ApiError && reason.status === 409
            ? '配置已变化，请重新加载后再操作。'
            : '操作未完成，请重试或重新登录。',
        )
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }
  const save = (event: FormEvent<HTMLFormElement>, target?: Target) => {
    event.preventDefault()
    const form = event.currentTarget,
      input = new FormData(form)
    const secretMaterial = String(input.get('secretMaterial') ?? '')
    const body = {
      name: String(input.get('name')),
      ...(secretMaterial ? { secretMaterial } : {}),
      ...(target ? {} : { provider: 'wecom', enabled: true }),
    }
    void run(
      'channel-save:' + (target?.id ?? scopeKey),
      target ? root + '/' + target.id : root,
      {
        method: target ? 'PATCH' : 'POST',
        headers: target ? headers(target.revision) : json({}),
        body: JSON.stringify(body),
      },
    ).then(() => form.reset())
  }
  if (!enabled) return error ? <p role="alert">{error}</p> : null
  return (
    <SettingsCard title="我的通知渠道" kicker="个人设置" wide>
      <p>只接收指派给你的事项。保存配置不会发送测试消息。</p>
      {(error || targets.error || deliveries.error) && (
        <p role="alert">{error || '读取失败，请重新加载。'}</p>
      )}
      <Button
        disabled={busy}
        onClick={() =>
          void Promise.all([targets.refresh(), deliveries.refresh()])
        }
      >
        重新加载
      </Button>
      <SettingsForm onSubmit={(event) => save(event)}>
        <label>
          目标名称
          <input name="name" maxLength={120} required disabled={busy} />
        </label>
        <label>
          企业微信出站地址
          <input
            name="secretMaterial"
            type="password"
            autoComplete="off"
            maxLength={4096}
            required
            disabled={busy}
          />
        </label>
        <Button type="submit" disabled={busy}>
          创建目标
        </Button>
      </SettingsForm>
      {targets.items.map((target) => (
        <section key={target.id} aria-label={target.name}>
          <p>
            {target.name} ·{' '}
            {target.status === 'revoked'
              ? '已撤销'
              : target.enabled
                ? '已启用'
                : '已禁用'}{' '}
            ·{' '}
            {target.secret_status === 'configured'
              ? '秘密已配置'
              : '秘密已清除'}
          </p>
          <code>{target.endpoint_fingerprint}</code>
          {target.status === 'active' && (
            <>
              <SettingsForm
                key={target.revision}
                onSubmit={(event) => save(event, target)}
              >
                <label>
                  目标名称
                  <input
                    name="name"
                    defaultValue={target.name}
                    required
                    maxLength={120}
                    disabled={busy}
                  />
                </label>
                <label>
                  替换秘密地址
                  <input
                    name="secretMaterial"
                    type="password"
                    autoComplete="off"
                    maxLength={4096}
                    disabled={busy}
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  保存目标
                </Button>
              </SettingsForm>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    'channel-toggle:' + target.id,
                    root + '/' + target.id,
                    {
                      method: 'PATCH',
                      headers: headers(target.revision),
                      body: JSON.stringify({ enabled: !target.enabled }),
                    },
                  )
                }
              >
                {target.enabled ? '禁用目标' : '启用目标'}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    'channel-revoke:' + target.id,
                    root + '/' + target.id,
                    {
                      method: 'DELETE',
                      headers: {
                        'If-Match': '"revision-' + target.revision + '"',
                      },
                    },
                  )
                }
              >
                撤销目标
              </Button>
            </>
          )}
        </section>
      ))}
      <LoadMoreButton
        collection={targets}
        label="渠道目标"
        loadingLabel="加载中"
        loadMoreLabel="更多目标"
      />
      <h3>投递记录</h3>
      {deliveries.items.map((delivery) => (
        <section key={delivery.id} aria-label="投递记录">
          <p>
            {delivery.effect_key} ·{' '}
            {delivery.outcome === 'uncertain'
              ? '发送结果未知'
              : delivery.status}
          </p>
          {delivery.outcome === 'uncertain' && (
            <>
              <p>重试可能再次发送同一条提醒；请先核对目标渠道的送达记录。</p>
              {(
                [
                  { outcome: 'delivered', label: '确认已送达' },
                  { outcome: 'retry', label: '允许重试' },
                  { outcome: 'dead', label: '终止投递' },
                ] as const
              ).map((action) => (
                <Button
                  key={action.outcome}
                  disabled={busy}
                  onClick={() =>
                    void run(
                      'channel-reconcile:' + delivery.id,
                      deliveryRoot + '/' + delivery.id + '/reconcile',
                      {
                        method: 'POST',
                        headers: headers(delivery.revision),
                        body: JSON.stringify({ outcome: action.outcome }),
                      },
                    )
                  }
                >
                  {action.label}
                </Button>
              ))}
            </>
          )}
        </section>
      ))}
      <LoadMoreButton
        collection={deliveries}
        label="投递记录"
        loadingLabel="加载中"
        loadMoreLabel="更多投递"
      />
    </SettingsCard>
  )
}
