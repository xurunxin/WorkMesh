import '@workmesh/ui/tokens.css'
import './styles.css'
import type { ReactNode } from 'react'
import { RealtimeProvider } from './lib/realtime'
import { LocaleProvider } from './lib/i18n'
import { ToastViewport } from './lib/toast-viewport'
export default function Layout({children}:{children:ReactNode}){return <html lang="zh-CN"><body><LocaleProvider><RealtimeProvider>{children}<ToastViewport /></RealtimeProvider></LocaleProvider></body></html>}
