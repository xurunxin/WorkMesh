import { expect, test } from '@playwright/test'

const projectId = '3f12de4f-b117-4a78-9e10-da102c892ae1'

test.describe('frontend layout and shell unification', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies({ name: 'workmesh_locale' })
    await page.addInitScript(() => window.localStorage.removeItem('workmesh_locale'))
  })

  test('keeps board content inside equal-height cards at desktop and narrow widths', async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 768, height: 900 },
      { width: 375, height: 812 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/?view=my-work&layout=board')
      await expect(page.getByRole('region', { name: 'Issue 看板列' })).toBeVisible()

      const metrics = await page.evaluate(() => {
        const board = document.querySelector<HTMLElement>('.wm-work-item-board-scroll')
        const columns = [...document.querySelectorAll<HTMLElement>('.wm-work-item-column')]
        const cards = [...document.querySelectorAll<HTMLElement>('.wm-work-item-card-board')]
        const metadata = [...document.querySelectorAll<HTMLElement>('.wm-work-item-card-board .wm-work-item-metadata span')]
        if (!board || cards.length === 0) throw new Error('Board fixture did not render')
        return {
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          boardWidth: board.clientWidth,
          columnWidths: columns.map(column => column.getBoundingClientRect().width),
          cardHeights: cards.map(card => card.getBoundingClientRect().height),
          metadataOverflow: metadata.map(node => node.scrollWidth - node.clientWidth),
        }
      })

      expect(metrics.documentOverflow).toBeLessThanOrEqual(0)
      expect(Math.max(...metrics.cardHeights) - Math.min(...metrics.cardHeights)).toBeLessThanOrEqual(1)
      expect(Math.max(0, ...metrics.metadataOverflow)).toBeLessThanOrEqual(1)
      if (viewport.width <= 375)
        expect(Math.abs((metrics.columnWidths[0] ?? 0) - metrics.boardWidth)).toBeLessThanOrEqual(2)
    }
  })

  test('separates project Overview from the work panel without overlapping layout layers', async ({ page }) => {
    await page.goto(`/?view=projects&project=${projectId}`)
    const projectControl = page.getByTestId('project-control-center')
    await expect(projectControl.locator('.wm-project-navigation a').first()).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('region', { name: 'Work surfaces' })).toHaveCount(0)

    await page.getByTestId('project-control-view-work').click()
    await expect(page.getByTestId('project-tab-list')).toBeVisible()
    await expect(page.getByTestId('project-tab-board')).toBeVisible()
    await expect(page.getByTestId('project-tab-backlog')).toBeVisible()
    await expect(page.locator('.project-plan-copy .rich-markdown')).toHaveCount(0)
    await expect(page.getByRole('region', { name: '里程碑路线图' })).toHaveCount(0)
    const layers = await page.evaluate(() => {
      const context = document.querySelector<HTMLElement>('.project-work-context')?.getBoundingClientRect()
      const tabs = document.querySelector<HTMLElement>('.project-tabs')?.getBoundingClientRect()
      const work = document.querySelector<HTMLElement>('.work-surfaces')?.getBoundingClientRect()
      if (!context || !tabs || !work) throw new Error('Project work panel did not render all layout layers')
      return {
        contextBottom: context.bottom,
        tabsTop: tabs.top,
        tabsBottom: tabs.bottom,
        workTop: work.top,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(layers.contextBottom).toBeLessThanOrEqual(layers.tabsTop + 1)
    expect(layers.tabsBottom).toBeLessThanOrEqual(layers.workTop + 1)
    expect(layers.overflow).toBeLessThanOrEqual(0)
  })

  test('keeps Agents and Session details in the localized workspace shell', async ({ page }) => {
    await page.goto('/?view=my-work')
    await page.getByRole('navigation', { name: '工作区导航' }).getByRole('link', { name: '智能体' }).click()
    await expect(page).toHaveURL(/\/agents$/)

    const agentsNavigation = page.getByRole('navigation', { name: '工作区导航' })
    await expect(agentsNavigation).toContainText('Issues')
    await expect(agentsNavigation).toContainText('智能体')
    await expect(agentsNavigation).not.toContainText('My Work')
    await expect(agentsNavigation).not.toContainText('Active')
    await expect(agentsNavigation).not.toContainText('Backlog')
    await expect(page.getByRole('button', { name: '中' })).toHaveAttribute('aria-pressed', 'true')

    await page.locator('a[href="/agent-sessions/session-preview"]').click()
    await expect(page).toHaveURL(/\/agent-sessions\/session-preview$/)
    const sessionNavigation = page.getByRole('navigation', { name: '工作区导航' })
    await expect(sessionNavigation).toContainText('Issues')
    await expect(sessionNavigation).toContainText('智能体')
    await expect(sessionNavigation).not.toContainText('My Work')
    await expect(page.getByRole('button', { name: '中' })).toHaveAttribute('aria-pressed', 'true')
  })
})
