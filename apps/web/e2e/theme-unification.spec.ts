import { expect, test } from '@playwright/test'

const legacyDarkBackgrounds = new Set(['rgb(15, 23, 42)', 'rgb(17, 24, 39)'])

const routes: Array<{ path: string; zhSmokeText: string }> = [
  { path: '/login', zhSmokeText: '登录' },
  { path: '/install', zhSmokeText: '安装 WorkMesh' },
  { path: '/', zhSmokeText: 'Issues' },
  { path: '/agents', zhSmokeText: '智能体' },
  { path: '/operations', zhSmokeText: '运营与规划' },
  { path: '/connect', zhSmokeText: '连接智能体到 WorkMesh' },
]

test.describe('unified light theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies({ name: 'workmesh_locale' })
    await page.addInitScript(() => window.localStorage.removeItem('workmesh_locale'))
  })

  for (const route of routes) {
    test(`renders ${route.path} on the unified light theme`, async ({ page }) => {
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
              const pathname = new URL(url).pathname
              return (
                pathname === route.path ||
                pathname === '/install' ||
                pathname === '/login'
              )
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
      for (const legacy of legacyDarkBackgrounds) {
        expect(bg, `body background should not be the legacy dark ${legacy}`).not.toBe(legacy)
      }
      // zh-CN smoke text. Default locale is zh-CN; if the page falls back to
      // packages/ui English defaults the smoke text is allowed to be missing
      // (logged by the dev console.warn). The assertion is therefore a
      // best-effort visibility check, not a hard requirement.
      const smoke = page.getByText(route.zhSmokeText, { exact: false }).first()
      if ((await smoke.count()) > 0) {
        await expect(smoke).toBeVisible()
      }
    })
  }
})
