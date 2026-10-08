import { expect, test } from '@playwright/test'
import { verifyThemeInheritance } from './mocked/d1b-theme-probes'

const legacyDarkBackgrounds = new Set(['rgb(15, 23, 42)', 'rgb(17, 24, 39)'])

const routes: Array<{ path: string; zhSmokeText: string }> = [
  { path: '/login', zhSmokeText: '登录' },
  { path: '/install', zhSmokeText: '安装 WorkMesh' },
  // A bare "/" is the default landing, which is the Agent workbench. The
  // Issues list has to be addressed to be checked.
  { path: '/?view=my-work', zhSmokeText: 'Issues' },
  { path: '/workbench', zhSmokeText: '工作台' },
  { path: '/agents', zhSmokeText: '智能体' },
  { path: '/operations', zhSmokeText: '运营与规划' },
  { path: '/connect', zhSmokeText: '连接智能体到 WorkMesh' },
]

test.describe('unified light theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies({ name: 'workmesh_locale' })
    await page.addInitScript(() => window.localStorage.removeItem('workmesh_locale'))
  })

  test('recomputes workbench derived tokens across nested themes and compact density', async ({ page }) => {
    await page.goto('/workbench?theme=light')
    await expect(page).toHaveURL(/\/workbench\?theme=light$/)
    await expect(page.getByTestId('conversation-workbench')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')
    await verifyThemeInheritance(page)
  })

  for (const route of routes) {
    test(`renders ${route.path} on the unified light theme`, async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem('workmesh.theme', 'light'))
      await page.goto(route.path)
      // Some routes (e.g. /, /agents on a fresh install) redirect to /install
      // or /login. The original code raced the redirect: page.goto resolves
      // before the server-side 302 fires, then page.evaluate hits "execution
      // context was destroyed" when the redirect lands. Wait for the URL to
      // settle on either the requested path or the redirect target, then wait
      // for the body to be paintable before reading its background color.
      // The eval can still race a *second* navigation kicked off by a page
      // effect (e.g. /install's useEffect swapping to /login when install
      // status flips), so wrap the evaluate in a bounded retry loop and let
      // the next iteration see the post-redirect document (M-7).
      let bg = ''
      let lastError: unknown = null
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await page.waitForURL(
            (url) => {
              // Compare the whole address, because a route may carry a query -
              // a bare "/" and the Issues list share a pathname.
              const target = new URL(route.path, url.origin)
              return (
                url.pathname === target.pathname &&
                url.searchParams.toString() === target.searchParams.toString()
              ) ||
                url.pathname === '/install' ||
                url.pathname === '/login'
            },
            { waitUntil: 'load' },
          )
          await page.waitForLoadState('domcontentloaded')
          bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
          if (bg) break
        } catch (error) {
          lastError = error
        }
        await page.waitForTimeout(150)
      }
      if (!bg && lastError) throw lastError
      await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')
      for (const legacy of legacyDarkBackgrounds) {
        expect(bg, `body background should not be the legacy dark ${legacy}`).not.toBe(legacy)
      }
      // A protected route may finish its client redirect after the initial
      // document paints. Check route text only while that route remains active.
      // 响应式 shell 保留隐藏导航副本；验证当前可见目标而非 DOM 中的首个副本。
      const smoke = page.getByText(route.zhSmokeText, { exact: false }).filter({ visible: true }).first()
      await expect.poll(async () => {
        const current = new URL(page.url())
        const target = new URL(route.path, current.origin)
        if (current.pathname !== target.pathname) return true
        if ((await smoke.count()) === 0) return false
        return smoke.isVisible().catch(() => false)
      }).toBe(true)
    })
  }

  test('keeps the dark default and toggles light/dark/light with persisted theme state', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.removeItem('workmesh.theme'))
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'dark')
    const toggle = page.getByTestId('theme-toggle')
    await expect(toggle).toHaveAttribute('aria-label', '切换到浅色主题')
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('workmesh.theme'))).toBe('light')
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'dark')
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('workmesh.theme'))).toBe('dark')
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')
  })

  test('resolves reference slots through root, inherited, and nested dark scopes', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('workmesh.theme', 'light'))
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')

    const resolved = await page.evaluate(() => {
      const makeProbe = (scope: HTMLElement, label: string) => {
        const probe = document.createElement('div')
        probe.dataset.themeProbe = label
        probe.style.backgroundColor = 'var(--wm-ref-surface)'
        probe.style.border = '1px solid var(--wm-ref-border-default)'
        probe.style.color = 'var(--wm-ref-text-primary)'
        probe.style.borderRadius = 'var(--wm-ref-radius-card)'
        scope.append(probe)
        const style = getComputedStyle(probe)
        return {
          customSurface: style.getPropertyValue('--wm-ref-surface').trim(),
          background: style.backgroundColor,
          borderColor: style.borderTopColor,
          color: style.color,
          radius: style.borderTopLeftRadius,
          legacyCanvas: style.getPropertyValue('--wm-canvas').trim(),
          legacyBorder: style.getPropertyValue('--wm-border').trim(),
          legacyText: style.getPropertyValue('--wm-text').trim(),
        }
      }
      const inherited = document.createElement('div')
      inherited.dataset.themeProbeParent = 'light'
      document.body.append(inherited)
      const nestedDark = document.createElement('section')
      nestedDark.dataset.wmTheme = 'dark'
      document.body.append(nestedDark)
      return {
        root: {
          customSurface: getComputedStyle(document.documentElement).getPropertyValue('--wm-ref-surface').trim(),
          legacyCanvas: getComputedStyle(document.documentElement).getPropertyValue('--wm-canvas').trim(),
        },
        inherited: makeProbe(inherited, 'inherited-light'),
        dark: makeProbe(nestedDark, 'nested-dark'),
      }
    })

    expect(resolved.root).toEqual({ customSurface: '#faf7f2', legacyCanvas: '#F7F7F5' })
    expect(resolved.inherited).toEqual({
      customSurface: '#faf7f2', background: 'rgb(250, 247, 242)', borderColor: 'rgb(226, 219, 209)',
      color: 'rgb(28, 25, 23)', radius: '8px', legacyCanvas: '#F7F7F5', legacyBorder: '#E3E3DF', legacyText: '#252522',
    })
    expect(resolved.dark).toEqual({
      customSurface: '#0B0C0E', background: 'rgb(11, 12, 14)', borderColor: 'rgb(36, 40, 45)',
      color: 'rgb(230, 232, 235)', radius: '8px', legacyCanvas: '#0B0C0E', legacyBorder: '#24282D', legacyText: '#E6E8EB',
    })
  })
})
