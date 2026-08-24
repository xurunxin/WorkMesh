'use client'
import { Toast } from '@workmesh/ui'
import { useLocale } from './i18n'
import { useToast, type ToastTone } from './use-toast'

function mapTone(tone: ToastTone): 'info' | 'success' | 'warning' | 'danger' {
  if (tone === 'error') return 'danger'
  return tone
}

export function ToastViewport(): React.ReactNode {
  const { toastCopy } = useLocale()
  const { dismiss, pause, resume, toasts } = useToast()
  if (toasts.length === 0) return null
  return (
    <div aria-label={toastCopy.notifications} className="wm-toast-viewport" role="region">
      {toasts.map((t, index) => (
        <Toast
          dismissLabel={toastCopy.dismissLabel(t.title, index + 1, toasts.length)}
          dismissText={toastCopy.dismiss}
          key={t.id}
          message={t.description ?? ''}
          onBlurCapture={event => {
            const next = event.relatedTarget
            if (!(next instanceof Node) || !event.currentTarget.contains(next)) resume(t.id, 'focus')
          }}
          onDismiss={() => dismiss(t.id)}
          onFocusCapture={() => pause(t.id, 'focus')}
          onPointerEnter={() => pause(t.id, 'pointer')}
          onPointerLeave={() => resume(t.id, 'pointer')}
          open
          title={t.title}
          toastId={t.id}
          tone={mapTone(t.tone)}
        />
      ))}
    </div>
  )
}
