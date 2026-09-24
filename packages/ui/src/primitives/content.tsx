'use client'

import { cloneElement, isValidElement, useId, type HTMLAttributes, type PropsWithChildren, type ReactElement, type ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type ResponsiveActionBarProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  align?: 'end' | 'space-between' | 'start'
  label?: string
}

export function ResponsiveActionBar({ align = 'start', children, className, label, role, ...props }: ResponsiveActionBarProps) {
  return <div
    {...props}
    aria-label={label}
    className={classNames('wm-responsive-action-bar', `wm-responsive-action-bar-${align}`, className)}
    role={role ?? (label ? 'toolbar' : undefined)}
  >{children}</div>
}

export type DataTableFrameProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  label: string
}

export function DataTableFrame({ children, className, label, ...props }: DataTableFrameProps) {
  return <div
    {...props}
    aria-label={label}
    className={classNames('wm-data-table-frame', className)}
    role="region"
    tabIndex={0}
  >{children}</div>
}

export type DescriptionListItem = Readonly<{
  description: ReactNode
  id: string
  term: ReactNode
}>

export type DescriptionListProps = PropsWithChildren<HTMLAttributes<HTMLDListElement>> & {
  items?: readonly DescriptionListItem[]
  layout?: 'responsive' | 'stacked'
}

export function DescriptionList({ children, className, items, layout = 'responsive', ...props }: DescriptionListProps) {
  return <dl {...props} className={classNames('wm-description-list', `wm-description-list-${layout}`, className)}>
    {items?.map(item => <div key={item.id}><dt>{item.term}</dt><dd>{item.description}</dd></div>) ?? children}
  </dl>
}

type FieldControlProps = {
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'false' | 'grammar' | 'spelling' | 'true'
  id?: string
}

export type FieldProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactElement<FieldControlProps>
  description?: ReactNode
  error?: ReactNode
  htmlFor: string
  label: ReactNode
  optionalLabel?: ReactNode
  required?: boolean
}

export function Field({ children, className, description, error, htmlFor, label, optionalLabel, required = false, ...props }: FieldProps) {
  const descriptionId = useId()
  const errorId = useId()
  const describedBy = [children.props['aria-describedby'], description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined
  const control = isValidElement<FieldControlProps>(children)
    ? cloneElement(children, {
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        id: children.props.id ?? htmlFor,
      })
    : children
  return <div {...props} className={classNames('wm-field', Boolean(error) && 'is-invalid', className)}>
    <label htmlFor={htmlFor}>{label}{required && <span aria-hidden="true" className="wm-field-required"> *</span>}{optionalLabel && <span className="wm-field-optional">{optionalLabel}</span>}</label>
    {control}
    {description && <p className="wm-field-description" id={descriptionId}>{description}</p>}
    {error && <p className="wm-field-error" id={errorId} role="alert">{error}</p>}
  </div>
}

export type OverflowTextProps = PropsWithChildren<HTMLAttributes<HTMLSpanElement>> & {
  lines?: 1 | 2 | 3
}

export function OverflowText({ children, className, lines = 2, ...props }: OverflowTextProps) {
  return <span {...props} className={classNames('wm-overflow-text', `wm-overflow-text-${lines}`, className)}>{children}</span>
}
