import '@workmesh/ui/tokens.css'
import './styles.css'
import type { ReactNode } from 'react'
import { CommandCenterMount } from './command-center-mount'
import { AuthenticatedRuntime } from './lib/page-hotkeys-mount'
import { LocaleProvider } from './lib/i18n'
import { ToastViewport } from './lib/toast-viewport'
export default function Layout({children}:{children:ReactNode}){return <html lang="zh-CN"><body><LocaleProvider><AuthenticatedRuntime commandCenter={<CommandCenterMount />}>{children}</AuthenticatedRuntime><ToastViewport /></LocaleProvider></body></html>}
