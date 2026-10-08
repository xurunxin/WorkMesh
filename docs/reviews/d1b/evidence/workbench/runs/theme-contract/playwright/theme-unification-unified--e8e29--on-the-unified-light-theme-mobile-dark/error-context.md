# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: theme-unification.spec.ts >> unified light theme >> renders /workbench on the unified light theme
- Location: e2e\theme-unification.spec.ts:33:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - link "跳到主要内容" [ref=e3] [cursor=pointer]:
      - /url: "#workmesh-main"
    - generic [ref=e4]:
      - banner [ref=e5]:
        - group [ref=e6]:
          - generic "菜单" [ref=e7] [cursor=pointer]
        - button "搜索" [ref=e9] [cursor=pointer]:
          - img [ref=e11]
          - generic [ref=e14]: 搜索
      - main [ref=e15]:
        - generic [ref=e17]:
          - complementary "对话列表" [ref=e18]:
            - link "返回传统交互页面" [ref=e19] [cursor=pointer]:
              - /url: /?view=my-work
            - generic [ref=e20]:
              - heading "Agent 工作台" [level=1] [ref=e21]
              - link "模型服务设置" [ref=e22] [cursor=pointer]:
                - /url: /settings/agent-workbench
            - button "新建对话" [ref=e23] [cursor=pointer]:
              - generic [ref=e24]: 新建对话
            - paragraph [ref=e25]: 会话
            - list [ref=e26]:
              - paragraph [ref=e27]: 尚无对话
            - paragraph [ref=e28]: 执行器
            - generic [ref=e29]:
              - paragraph [ref=e30]: 尚未配置模型服务
              - generic [ref=e31]:
                - generic [ref=e33]: 委派执行会话
                - generic [ref=e34]: —
          - region "对话内容" [ref=e35]:
            - alert [ref=e36]:
              - text: "Preview route not found: GET /api/v1/workbench/conversations"
              - button "重试" [ref=e37]
            - paragraph [ref=e38]: 选择或新建对话。
          - complementary "执行上下文" [ref=e39]:
            - heading "执行上下文" [level=2] [ref=e40]
            - paragraph [ref=e41]: 选择对话后显示上下文。
  - button "Open Next.js Dev Tools" [ref=e47] [cursor=pointer]:
    - img [ref=e48]
  - alert [ref=e51]
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test'
  2   | import { verifyThemeInheritance } from './mocked/d1b-theme-probes'
  3   | 
  4   | const legacyDarkBackgrounds = new Set(['rgb(15, 23, 42)', 'rgb(17, 24, 39)'])
  5   | 
  6   | const routes: Array<{ path: string; zhSmokeText: string }> = [
  7   |   { path: '/login', zhSmokeText: '登录' },
  8   |   { path: '/install', zhSmokeText: '安装 WorkMesh' },
  9   |   // A bare "/" is the default landing, which is the Agent workbench. The
  10  |   // Issues list has to be addressed to be checked.
  11  |   { path: '/?view=my-work', zhSmokeText: 'Issues' },
  12  |   { path: '/workbench', zhSmokeText: '工作台' },
  13  |   { path: '/agents', zhSmokeText: '智能体' },
  14  |   { path: '/operations', zhSmokeText: '运营与规划' },
  15  |   { path: '/connect', zhSmokeText: '连接智能体到 WorkMesh' },
  16  | ]
  17  | 
  18  | test.describe('unified light theme', () => {
  19  |   test.beforeEach(async ({ page }) => {
  20  |     await page.context().clearCookies({ name: 'workmesh_locale' })
  21  |     await page.addInitScript(() => window.localStorage.removeItem('workmesh_locale'))
  22  |   })
  23  | 
  24  |   test('recomputes workbench derived tokens across nested themes and compact density', async ({ page }) => {
  25  |     await page.goto('/workbench?theme=light')
  26  |     await expect(page).toHaveURL(/\/workbench\?theme=light$/)
  27  |     await expect(page.getByTestId('conversation-workbench')).toBeVisible()
  28  |     await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')
  29  |     await verifyThemeInheritance(page)
  30  |   })
  31  | 
  32  |   for (const route of routes) {
  33  |     test(`renders ${route.path} on the unified light theme`, async ({ page }) => {
  34  |       await page.addInitScript(() => window.localStorage.setItem('workmesh.theme', 'light'))
  35  |       await page.goto(route.path)
  36  |       // Some routes (e.g. /, /agents on a fresh install) redirect to /install
  37  |       // or /login. The original code raced the redirect: page.goto resolves
  38  |       // before the server-side 302 fires, then page.evaluate hits "execution
  39  |       // context was destroyed" when the redirect lands. Wait for the URL to
  40  |       // settle on either the requested path or the redirect target, then wait
  41  |       // for the body to be paintable before reading its background color.
  42  |       // The eval can still race a *second* navigation kicked off by a page
  43  |       // effect (e.g. /install's useEffect swapping to /login when install
  44  |       // status flips), so wrap the evaluate in a bounded retry loop and let
  45  |       // the next iteration see the post-redirect document (M-7).
  46  |       let bg = ''
  47  |       let lastError: unknown = null
  48  |       for (let attempt = 0; attempt < 5; attempt += 1) {
  49  |         try {
  50  |           await page.waitForURL(
  51  |             (url) => {
  52  |               // Compare the whole address, because a route may carry a query -
  53  |               // a bare "/" and the Issues list share a pathname.
  54  |               const target = new URL(route.path, url.origin)
  55  |               return (
  56  |                 url.pathname === target.pathname &&
  57  |                 url.searchParams.toString() === target.searchParams.toString()
  58  |               ) ||
  59  |                 url.pathname === '/install' ||
  60  |                 url.pathname === '/login'
  61  |             },
  62  |             { waitUntil: 'load' },
  63  |           )
  64  |           await page.waitForLoadState('domcontentloaded')
  65  |           bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  66  |           if (bg) break
  67  |         } catch (error) {
  68  |           lastError = error
  69  |         }
  70  |         await page.waitForTimeout(150)
  71  |       }
  72  |       if (!bg && lastError) throw lastError
  73  |       await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')
  74  |       for (const legacy of legacyDarkBackgrounds) {
  75  |         expect(bg, `body background should not be the legacy dark ${legacy}`).not.toBe(legacy)
  76  |       }
  77  |       // A protected route may finish its client redirect after the initial
  78  |       // document paints. Check route text only while that route remains active.
  79  |       const smoke = page.getByText(route.zhSmokeText, { exact: false }).first()
  80  |       await expect.poll(async () => {
  81  |         if (new URL(page.url()).pathname !== route.path) return true
  82  |         if ((await smoke.count()) === 0) return true
  83  |         return smoke.isVisible().catch(() => false)
> 84  |       }).toBe(true)
      |          ^ Error: expect(received).toBe(expected) // Object.is equality
  85  |     })
  86  |   }
  87  | 
  88  |   test('keeps the dark default and toggles light/dark/light with persisted theme state', async ({ page }) => {
  89  |     await page.addInitScript(() => window.localStorage.removeItem('workmesh.theme'))
  90  |     await page.goto('/login')
  91  |     await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'dark')
  92  |     const toggle = page.getByTestId('theme-toggle')
  93  |     await expect(toggle).toHaveAttribute('aria-label', '切换到浅色主题')
  94  |     await toggle.click()
  95  |     await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')
  96  |     await expect.poll(() => page.evaluate(() => window.localStorage.getItem('workmesh.theme'))).toBe('light')
  97  |     await toggle.click()
  98  |     await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'dark')
  99  |     await expect.poll(() => page.evaluate(() => window.localStorage.getItem('workmesh.theme'))).toBe('dark')
  100 |     await toggle.click()
  101 |     await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')
  102 |   })
  103 | 
  104 |   test('resolves reference slots through root, inherited, and nested dark scopes', async ({ page }) => {
  105 |     await page.addInitScript(() => window.localStorage.setItem('workmesh.theme', 'light'))
  106 |     await page.goto('/login')
  107 |     await expect(page.locator('html')).toHaveAttribute('data-wm-theme', 'light')
  108 | 
  109 |     const resolved = await page.evaluate(() => {
  110 |       const makeProbe = (scope: HTMLElement, label: string) => {
  111 |         const probe = document.createElement('div')
  112 |         probe.dataset.themeProbe = label
  113 |         probe.style.backgroundColor = 'var(--wm-ref-surface)'
  114 |         probe.style.border = '1px solid var(--wm-ref-border-default)'
  115 |         probe.style.color = 'var(--wm-ref-text-primary)'
  116 |         probe.style.borderRadius = 'var(--wm-ref-radius-card)'
  117 |         scope.append(probe)
  118 |         const style = getComputedStyle(probe)
  119 |         return {
  120 |           customSurface: style.getPropertyValue('--wm-ref-surface').trim(),
  121 |           background: style.backgroundColor,
  122 |           borderColor: style.borderTopColor,
  123 |           color: style.color,
  124 |           radius: style.borderTopLeftRadius,
  125 |           legacyCanvas: style.getPropertyValue('--wm-canvas').trim(),
  126 |           legacyBorder: style.getPropertyValue('--wm-border').trim(),
  127 |           legacyText: style.getPropertyValue('--wm-text').trim(),
  128 |         }
  129 |       }
  130 |       const inherited = document.createElement('div')
  131 |       inherited.dataset.themeProbeParent = 'light'
  132 |       document.body.append(inherited)
  133 |       const nestedDark = document.createElement('section')
  134 |       nestedDark.dataset.wmTheme = 'dark'
  135 |       document.body.append(nestedDark)
  136 |       return {
  137 |         root: {
  138 |           customSurface: getComputedStyle(document.documentElement).getPropertyValue('--wm-ref-surface').trim(),
  139 |           legacyCanvas: getComputedStyle(document.documentElement).getPropertyValue('--wm-canvas').trim(),
  140 |         },
  141 |         inherited: makeProbe(inherited, 'inherited-light'),
  142 |         dark: makeProbe(nestedDark, 'nested-dark'),
  143 |       }
  144 |     })
  145 | 
  146 |     expect(resolved.root).toEqual({ customSurface: '#faf7f2', legacyCanvas: '#F7F7F5' })
  147 |     expect(resolved.inherited).toEqual({
  148 |       customSurface: '#faf7f2', background: 'rgb(250, 247, 242)', borderColor: 'rgb(226, 219, 209)',
  149 |       color: 'rgb(28, 25, 23)', radius: '8px', legacyCanvas: '#F7F7F5', legacyBorder: '#E3E3DF', legacyText: '#252522',
  150 |     })
  151 |     expect(resolved.dark).toEqual({
  152 |       customSurface: '#0B0C0E', background: 'rgb(11, 12, 14)', borderColor: 'rgb(36, 40, 45)',
  153 |       color: 'rgb(230, 232, 235)', radius: '8px', legacyCanvas: '#0B0C0E', legacyBorder: '#24282D', legacyText: '#E6E8EB',
  154 |     })
  155 |   })
  156 | })
  157 | 
```