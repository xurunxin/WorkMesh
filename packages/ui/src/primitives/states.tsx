'use client'

import { classNames } from '../internal/utils.js'
import { Button } from './button.js'
import { Skeleton } from './skeleton.js'

export type SurfaceState = 'initial' | 'loading' | 'ready' | 'empty' | 'refreshing' | 'forbidden' | 'not_found' | 'deleted' | 'conflict' | 'offline' | 'reconnecting' | 'error'
export type AsyncStateSurfaceProps = {
  actionLabel?: string
  description: string
  onAction?: () => void
  state: Exclude<SurfaceState, 'ready'>
  title: string
}

export function AsyncStateSurface({ actionLabel, description, onAction, state, title }: AsyncStateSurfaceProps) {
  const urgent = state === 'error' || state === 'forbidden' || state === 'conflict' || state === 'deleted'
  return <section aria-busy={state === 'loading' || state === 'refreshing' || state === 'reconnecting' || undefined} aria-live={urgent ? 'assertive' : 'polite'} className={classNames('wm-state-surface', `wm-state-${state}`)} role={urgent ? 'alert' : 'status'}>
    {state === 'loading' || state === 'refreshing' || state === 'reconnecting' ? <Skeleton label={title} /> : <span aria-hidden="true" className="wm-state-marker" />}
    <div><h2>{title}</h2><p>{description}</p></div>
    {actionLabel && onAction && <Button onClick={onAction} type="button" variant={urgent ? 'primary' : 'secondary'}>{actionLabel}</Button>}
  </section>
}

type NamedStateProps = Omit<AsyncStateSurfaceProps, 'state'>
export const EmptyState = (props: NamedStateProps) => <AsyncStateSurface {...props} state="empty" />
export const ErrorState = (props: NamedStateProps) => <AsyncStateSurface {...props} state="error" />
export const ForbiddenState = (props: NamedStateProps) => <AsyncStateSurface {...props} state="forbidden" />
export const ConflictState = (props: NamedStateProps) => <AsyncStateSurface {...props} state="conflict" />
