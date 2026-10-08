# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: theme-unification.spec.ts >> unified light theme >> renders /agents on the unified light theme
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
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - img [ref=e8]
  - alert [ref=e11]
  - generic [ref=e12]:
    - link "跳到主要内容" [ref=e13] [cursor=pointer]:
      - /url: "#workmesh-main"
    - generic [ref=e14]:
      - banner [ref=e15]:
        - group [ref=e16]:
          - generic "菜单" [ref=e17] [cursor=pointer]
        - button "搜索" [ref=e19] [cursor=pointer]:
          - img [ref=e21]
          - generic [ref=e24]: 搜索
      - main [ref=e25]:
        - generic [ref=e26]:
          - generic [ref=e27]:
            - generic [ref=e28]:
              - paragraph [ref=e29]: 人类控制面
              - heading "智能体" [level=1] [ref=e30]
              - paragraph [ref=e31]: 监控委派工作、处理审批，并在不接触凭据的情况下诊断连接。
            - button "刷新" [ref=e32] [cursor=pointer]:
              - generic [ref=e33]: 刷新
          - region "智能体控制摘要" [ref=e34]:
            - article [ref=e35]:
              - generic [ref=e36]: 活跃智能体
              - strong [ref=e37]: "1"
              - generic [ref=e38]: 已注册 1 个
            - article [ref=e39]:
              - generic [ref=e40]: 运行中 Session
              - strong [ref=e41]: "1"
              - generic [ref=e42]: 可见 1 个
            - article [ref=e43]:
              - generic [ref=e44]: 待处理审批
              - strong [ref=e45]: "0"
              - generic [ref=e46]: 队列为空
            - article [ref=e47]:
              - generic [ref=e48]: 需要关注
              - strong [ref=e49]: "0"
              - generic [ref=e50]: 需要人类响应
          - generic [ref=e51]:
            - generic [ref=e52]:
              - generic [ref=e53]: 智能体
              - combobox "智能体工作区分区" [ref=e54]:
                - option "智能体" [selected]
                - option "连接"
                - option "自动接入策略"
                - option "已归档"
            - tabpanel "智能体" [ref=e55]:
              - region "注册表" [ref=e56]:
                - generic [ref=e57]:
                  - generic [ref=e58]:
                    - paragraph [ref=e59]: 注册表
                    - heading "智能体" [level=2] [ref=e60]
                    - paragraph [ref=e61]: 先检查定义；仅在需要审阅时展开团队权限。
                  - generic [ref=e62]:
                    - button "全部" [ref=e63]
                    - button "活跃" [ref=e64]
                    - button "停用" [ref=e65]
                - group "智能体筛选" [ref=e66]:
                  - generic [ref=e67]:
                    - generic [ref=e68]: 名称
                    - searchbox "名称" [ref=e69]
                  - generic [ref=e70]:
                    - generic [ref=e71]: 团队
                    - combobox "团队" [ref=e72]:
                      - option "全部团队" [selected]
                      - option "WorkMesh Product"
                  - generic [ref=e73]:
                    - generic [ref=e74]: 能力
                    - combobox "能力" [ref=e75]:
                      - option "全部能力" [selected]
                      - option "work:read"
                  - generic [ref=e76]:
                    - generic [ref=e77]: 状态
                    - combobox "状态" [ref=e78]:
                      - option "全部" [selected]
                      - option "活跃"
                      - option "停用"
                - article [ref=e80]:
                  - link "打开 Codex Preview 的详情" [ref=e81] [cursor=pointer]:
                    - /url: /agents/agent-preview
                    - generic [ref=e82]:
                      - generic [ref=e83]:
                        - heading "Codex Preview" [level=3] [ref=e84]
                        - generic [ref=e85]: codex-preview · openai 1.0.0
                      - generic [ref=e86]: 活跃
                    - paragraph [ref=e87]: Frontend preview agent.
                    - generic [ref=e88]:
                      - generic [ref=e89]:
                        - term [ref=e90]: 已批准
                        - definition [ref=e91]: 1 项能力
                      - generic [ref=e92]:
                        - term [ref=e93]: 并发数
                        - definition [ref=e94]: "1"
                      - generic [ref=e95]:
                        - term [ref=e96]: 心跳
                        - definition [ref=e97]: 30s
                    - generic [ref=e98]:
                      - generic [ref=e99]:
                        - img [ref=e100]
                        - text: 按空格键快速查看
                      - generic [ref=e102]:
                        - text: 打开详情
                        - img [ref=e103]
                  - button "管理 Codex Preview 的团队访问" [ref=e106] [cursor=pointer]:
                    - img [ref=e108]
                    - generic [ref=e110]: 管理团队访问
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