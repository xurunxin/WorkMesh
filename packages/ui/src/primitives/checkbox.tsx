'use client'

import { useEffect, useRef, type InputHTMLAttributes, type RefAttributes } from 'react'
import { classNames } from '../internal/utils.js'

export type CheckedState = boolean | 'indeterminate'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange' | 'type'> & RefAttributes<HTMLInputElement> & {
  checked: CheckedState
  onCheckedChange: (checked: CheckedState) => void
}

export function Checkbox({ checked, className, disabled = false, onCheckedChange, ...props }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = checked === 'indeterminate'
  }, [checked])
  return <input
    {...props}
    aria-checked={checked === 'indeterminate' ? 'mixed' : undefined}
    checked={checked === true}
    className={classNames('wm-checkbox', className)}
    disabled={disabled}
    onChange={() => onCheckedChange(checked === 'indeterminate' ? true : !checked)}
    ref={inputRef}
    type="checkbox"
  />
}

export type CheckboxOption = {
  disabled?: boolean
  label: string
  value: string
}

export type CheckboxGroupProps = {
  disabled?: boolean
  label: string
  name?: string
  onValuesChange: (values: string[]) => void
  options: CheckboxOption[]
  values: string[]
}

export function CheckboxGroup({ disabled = false, label, name, onValuesChange, options, values }: CheckboxGroupProps) {
  return <fieldset className="wm-checkbox-group" disabled={disabled}>
    <legend className="wm-visually-hidden">{label}</legend>
    {options.map(option => {
      const checked = values.includes(option.value)
      return <label className="wm-checkbox-option" key={option.value}>
        <Checkbox
          checked={checked}
          disabled={disabled || option.disabled}
          name={name}
          onCheckedChange={() => onValuesChange(checked ? values.filter(value => value !== option.value) : [...values, option.value])}
          value={option.value}
        />
        {option.label}
      </label>
    })}
  </fieldset>
}
