'use client'
import { useEffect, useState } from 'react'

export type ToastTone = 'info' | 'success' | 'error'
export type Toast = { id: string; title: string; description?: string; tone: ToastTone }

type Listener = (toasts: Toast[]) => void
let toasts: Toast[] = []
const listeners = new Set<Listener>()
const emit = (): void => { for (const l of listeners) l(toasts) }

export function useToast(): { toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: string) => void } {
  const [state, setState] = useState<Toast[]>(toasts)
  useEffect(() => { const l: Listener = (next) => setState(next); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return {
    toasts: state,
    push: (t) => { const id = crypto.randomUUID(); toasts = [...toasts, { id, ...t }]; emit() },
    dismiss: (id) => { toasts = toasts.filter(t => t.id !== id); emit() },
  }
}
