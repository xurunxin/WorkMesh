'use client'
import { Toast } from '@workmesh/ui'
import { useToast, type ToastTone } from './use-toast'

function mapTone(tone: ToastTone): 'info' | 'success' | 'warning' | 'danger' {
  if (tone === 'error') return 'danger'
  return tone
}

export function ToastViewport() {
  const { toasts, dismiss } = useToast()
  return (
    <div aria-label="Notifications" className="wm-toast-viewport" role="region">
      {toasts.map(t => (
        <Toast
          key={t.id}
          message={t.description ?? ''}
          onDismiss={() => dismiss(t.id)}
          open
          title={t.title}
          tone={mapTone(t.tone)}
        />
      ))}
    </div>
  )
}
