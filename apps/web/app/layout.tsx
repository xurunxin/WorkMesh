import '@workmesh/ui/tokens.css'
import './styles.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { CommandCenterMount } from './command-center-mount'
import { AuthenticatedRuntime } from './lib/page-hotkeys-mount'
import { LocaleProvider } from './lib/i18n'
import { ToastViewport } from './lib/toast-viewport'

export const metadata: Metadata = {
  title: { default: 'WorkMesh', template: '%s · WorkMesh' },
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default function Layout({children}:{children:ReactNode}){return <html lang="zh-CN"><body><LocaleProvider><AuthenticatedRuntime commandCenter={<CommandCenterMount />}>{children}</AuthenticatedRuntime><ToastViewport /></LocaleProvider></body></html>}
