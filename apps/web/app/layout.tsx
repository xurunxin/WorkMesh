import '@workmesh/ui/tokens.css'
import './styles.css'
import type { ReactNode } from 'react'
import { RealtimeProvider } from './lib/realtime'
import { LocaleProvider } from './lib/i18n'
export default function Layout({children}:{children:ReactNode}){return <html lang="zh-CN"><body><LocaleProvider><RealtimeProvider>{children}</RealtimeProvider></LocaleProvider></body></html>}
