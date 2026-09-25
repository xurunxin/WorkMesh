'use client'

import { classNames } from '../internal/utils.js'

export type SwitchProps = {
  checked: boolean
  className?: string
  disabled?: boolean
  id?: string
  label: string
  onCheckedChange: (checked: boolean) => void
}

export function Switch({ checked, className, disabled = false, id, label, onCheckedChange }: SwitchProps) {
  return <button aria-checked={checked} aria-label={label} className={classNames('wm-switch', className)} disabled={disabled} id={id} onClick={() => onCheckedChange(!checked)} role="switch" type="button" />
}
