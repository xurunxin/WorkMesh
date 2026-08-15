import '@workmesh/ui/tokens.css'
import './styles.css'
import type { ReactNode } from 'react'
import { RealtimeProvider } from './lib/realtime'
export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body><RealtimeProvider>{children}</RealtimeProvider></body></html>}
