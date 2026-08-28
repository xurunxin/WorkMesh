import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import {
  AccessibilityFixture,
  accessibilityIds,
  accessibilityWebUrl,
  expectNamedVisibleControls,
  focusGeometry,
  semanticSnapshot,
  tabUntilFocused,
  type SemanticSnapshot,
} from './accessibility-fixtures'

type Locale = 'en' | 'zh-CN'
type FocusGeometry = Awaited<ReturnType<typeof focusGeometry>>

async function useLocale(page: Page, locale: Locale): Promise<void> {
  await page.context().addCookies([{ name: 'workmesh_locale', value: locale, url: accessibilityWebUrl }])
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  const path = testInfo.outputPath(`${name}.json`)
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8')
  await testInfo.attach(name, { path, contentType: 'application/json' })
}

async function attachScreenshot(testInfo: TestInfo, page: Page, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ fullPage: true, path })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function expectSemanticIntegrity(page: Page, label: string): Promise<SemanticSnapshot> {
  const snapshot = await semanticSnapshot(page)
  expect.soft(snapshot.duplicateIds, `${label}: no duplicate IDs`).toEqual([])
  expect.soft(snapshot.missingReferences, `${label}: every ARIA reference resolves to one connected ID`).toEqual([])
  expect.soft(snapshot.nestedInteractive, `${label}: no nested interactive control`).toEqual([])
  expect.soft(snapshot.documentScrollWidth, `${label}: the document is horizontally contained`).toBe(snapshot.documentClientWidth)
  await expectNamedVisibleControls(page)
  return snapshot
}

async function expectSemanticPage(page: Page, label: string): Promise<SemanticSnapshot> {
  const snapshot = await expectSemanticIntegrity(page, label)
  expect.soft(snapshot.mainCount, `${label}: exactly one visible main`).toBe(1)
  expect.soft(snapshot.visibleH1Count, `${label}: exactly one visible page h1`).toBe(1)
  expect.soft(snapshot.mainH1Count, `${label}: the page h1 belongs to main`).toBe(1)
  return snapshot
}

async function expectVisibleFocus(target: Locator, label: string): Promise<FocusGeometry> {
  const geometry = await focusGeometry(target)
  const subpixelTolerance = 2
  expect.soft(geometry.left, `${label}: focused control enters the viewport`).toBeGreaterThanOrEqual(-subpixelTolerance)
  expect.soft(geometry.top, `${label}: focused control enters the viewport`).toBeGreaterThanOrEqual(-subpixelTolerance)
  expect.soft(geometry.right, `${label}: focused control stays within the viewport`).toBeLessThanOrEqual(geometry.viewportWidth + subpixelTolerance)
  expect.soft(geometry.bottom, `${label}: focused control stays within the viewport`).toBeLessThanOrEqual(geometry.viewportHeight + subpixelTolerance)
  expect.soft(geometry.outlineStyle !== 'none' || geometry.boxShadow !== 'none', `${label}: focus is perceivable`).toBe(true)
  return geometry
}

async function expectSkipJourney(page: Page, label: string, locale: Locale): Promise<Readonly<Record<string, unknown>>> {
  const skip = page.locator('.wm-skip-link:visible')
  const skipCount = await skip.count()
  expect.soft(skipCount, `${label}: one visible skip link`).toBe(1)
  if (skipCount === 1) {
    await expect.soft(skip, `${label}: skip link is localized`).toHaveAccessibleName(locale === 'zh-CN' ? '跳到主要内容' : 'Skip to content')
  }
  const main = page.locator('main#workmesh-main:visible')
  expect.soft(await main.count(), `${label}: #workmesh-main exists`).toBe(1)
  if (skipCount !== 1 || await main.count() !== 1) return { activated: false, skipCount }

  const skipFocused = await tabUntilFocused(page, skip, 20)
  expect.soft(skipFocused, `${label}: real Tab navigation reaches the skip link`).toBe(true)
  const geometry = await expectVisibleFocus(skip, `${label} skip link`)
  if (!skipFocused) return { activated: false, geometry, skipCount }

  await page.keyboard.press('Enter')
  const activated = await main.evaluate(element => element === document.activeElement)
  expect.soft(activated, `${label}: Enter moves focus to #workmesh-main`).toBe(true)
  const targetCue = await main.evaluate(element => {
    const marker = document.createElement('span')
    marker.style.color = 'var(--wm-focus)'
    document.body.append(marker)
    const focusColor = getComputedStyle(marker).color
    marker.remove()
    const style = getComputedStyle(element)
    return {
      boxShadow: style.boxShadow,
      focusColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    }
  })
  expect.soft(targetCue.outlineStyle, `${label}: main skip target removes the browser outline`).toBe('none')
  expect.soft(targetCue.outlineWidth, `${label}: main skip target has no four-sided outline width`).toBe('0px')
  expect.soft(targetCue.boxShadow, `${label}: main skip target uses an inset cue`).toContain('inset')
  expect.soft(targetCue.boxShadow, `${label}: main skip target cue is anchored to the top edge`).toContain('0px 3px 0px')
  expect.soft(targetCue.boxShadow, `${label}: main skip target cue uses the product focus color`).toContain(targetCue.focusColor)
  return { activated, geometry, skipCount, targetCue }
}

async function expectCompactTabs(container: Locator, label: string): Promise<void> {
  await expect.soft(container.locator(':scope > .wm-tab-list'), `${label}: compact tabs have no tablist`).toHaveCount(0)
  const selector = container.locator(':scope > .wm-tab-list-compact select.wm-tab-select')
  await expect.soft(selector, `${label}: one compact selector`).toHaveCount(1)
  if (await selector.count() === 1) await expect.soft(selector, `${label}: compact selector is distinctly named`).toHaveAccessibleName(/\S/)
  const panel = container.locator(':scope > [role="tabpanel"]')
  await expect.soft(panel, `${label}: one compact panel`).toHaveCount(1)
  if (await panel.count() === 1) {
    await expect.soft(panel, `${label}: compact panel has a distinct accessible name`).toHaveAccessibleName(/\S/)
    const labels = await panel.evaluate(element => {
      const references = element.getAttribute('aria-labelledby')?.trim().split(/\s+/).filter(Boolean) ?? []
      return {
        references,
        resolved: references.every(reference => {
          const target = document.getElementById(reference)
          const matches = [...document.querySelectorAll<HTMLElement>('[id]')].filter(candidate => candidate.id === reference)
          return Boolean(target?.isConnected && matches.length === 1)
        }),
      }
    })
    expect.soft(labels.references.length, `${label}: compact panel has an accessible-name reference`).toBeGreaterThan(0)
    expect.soft(labels.resolved, `${label}: every compact panel label resolves`).toBe(true)
  }
}

async function exerciseTablist(tablist: Locator, label: string): Promise<void> {
  await expect.soft(tablist, `${label}: tablist is visible`).toBeVisible()
  const tabs = tablist.getByRole('tab')
  const count = await tabs.count()
  expect.soft(count, `${label}: tablist has choices`).toBeGreaterThan(1)
  if (count < 2) return

  const state = async () => tabs.evaluateAll(elements => elements.map(element => ({
    controls: element.getAttribute('aria-controls'),
    controlsResolved: Boolean(element.getAttribute('aria-controls') && document.getElementById(element.getAttribute('aria-controls')!)),
    id: element.id,
    panelLabelsTab: (() => {
      const controlled = element.getAttribute('aria-controls')
      const panel = controlled ? document.getElementById(controlled) : null
      return Boolean(element.id && panel?.getAttribute('role') === 'tabpanel' && panel.getAttribute('aria-labelledby')?.trim().split(/\s+/).includes(element.id))
    })(),
    selected: element.getAttribute('aria-selected'),
    tabIndex: element.getAttribute('tabindex'),
    text: element.textContent?.trim() ?? '',
  })))
  let values = await state()
  expect.soft(values.filter(value => value.selected === 'true'), `${label}: exactly one selected tab`).toHaveLength(1)
  expect.soft(values.filter(value => value.tabIndex === '0'), `${label}: exactly one roving tab stop`).toHaveLength(1)
  expect.soft(values.every(value => Boolean(value.controls)), `${label}: every tab owns a panel`).toBe(true)
  expect.soft(values.every(value => value.controlsResolved), `${label}: every aria-controls target is connected`).toBe(true)
  expect.soft(values.every(value => value.panelLabelsTab), `${label}: every controlled tabpanel is labelled by its tab`).toBe(true)

  const selectedIndex = Math.max(0, values.findIndex(value => value.selected === 'true'))
  const selected = tabs.nth(selectedIndex)
  if (!(await selected.evaluate(element => element === document.activeElement))) {
    const reached = await tabUntilFocused(tablist.page(), selected)
    expect.soft(reached, `${label}: selected tab is reachable by Tab`).toBe(true)
  }
  if (!(await selected.evaluate(element => element === document.activeElement))) return

  await tablist.page().keyboard.press('ArrowRight')
  const nextIndex = (selectedIndex + 1) % count
  await expect.soft(tabs.nth(nextIndex), `${label}: ArrowRight moves focus`).toBeFocused()
  await expect.soft(tabs.nth(nextIndex), `${label}: ArrowRight selects the focused tab`).toHaveAttribute('aria-selected', 'true')
  await tablist.page().keyboard.press('End')
  await expect.soft(tabs.last(), `${label}: End moves to the final tab`).toBeFocused()
  await expect.soft(tabs.last(), `${label}: End selects the final tab`).toHaveAttribute('aria-selected', 'true')
  await tablist.page().keyboard.press('Home')
  await expect.soft(tabs.first(), `${label}: Home moves to the first tab`).toBeFocused()
  await expect.soft(tabs.first(), `${label}: Home selects the first tab`).toHaveAttribute('aria-selected', 'true')
  await tablist.page().keyboard.press('ArrowLeft')
  await expect.soft(tabs.last(), `${label}: ArrowLeft wraps focus to the final tab`).toBeFocused()
  await expect.soft(tabs.last(), `${label}: ArrowLeft selects the focused tab`).toHaveAttribute('aria-selected', 'true')
  await tablist.page().keyboard.press('Home')

  values = await state()
  expect.soft(values.filter(value => value.selected === 'true'), `${label}: selection remains singular after navigation`).toHaveLength(1)
  expect.soft(values.filter(value => value.tabIndex === '0'), `${label}: roving stop remains singular after navigation`).toHaveLength(1)
}

async function expectTeamAccessTabs(dialog: Locator, compact: boolean): Promise<void> {
  const owner = dialog.locator('.team-access-card').first()
  if (compact) {
    await expect.soft(owner.getByRole('tablist'), 'Team Access phone mode has no tablist').toHaveCount(0, { timeout: 200 })
    const selector = owner.locator('select')
    await expect.soft(selector, 'Team Access phone mode has one named selector').toHaveCount(1, { timeout: 200 })
    if (await selector.count() === 1) await expect.soft(selector).toHaveAccessibleName(/\S/, { timeout: 200 })
    return
  }
  const tablist = owner.getByRole('tablist')
  await expect.soft(tablist, 'Team Access has one independent tablist').toHaveCount(1, { timeout: 200 })
  if (await tablist.count() !== 1) return
  const tabs = tablist.getByRole('tab')
  const initial = await tabs.evaluateAll(elements => elements.map(element => ({
    controls: element.getAttribute('aria-controls'),
    controlsResolved: Boolean(element.getAttribute('aria-controls') && document.getElementById(element.getAttribute('aria-controls')!)),
    id: element.id,
    panelLabelsTab: (() => {
      const controlled = element.getAttribute('aria-controls')
      const panel = controlled ? document.getElementById(controlled) : null
      return Boolean(element.id && panel?.getAttribute('role') === 'tabpanel' && panel.getAttribute('aria-labelledby')?.trim().split(/\s+/).includes(element.id))
    })(),
    selected: element.getAttribute('aria-selected'),
    tabIndex: element.getAttribute('tabindex'),
  })))
  expect.soft(initial.length, 'Team Access tablist has choices').toBeGreaterThan(1)
  if (initial.length < 2) return
  expect.soft(initial.filter(value => value.selected === 'true'), 'Team Access has exactly one selected tab').toHaveLength(1)
  expect.soft(initial.filter(value => value.tabIndex === '0'), 'Team Access has exactly one roving tab stop').toHaveLength(1)
  expect.soft(initial.every(value => Boolean(value.controls)), 'Team Access tabs own panels').toBe(true)
  expect.soft(initial.every(value => value.controlsResolved), 'Team Access aria-controls targets resolve').toBe(true)
  expect.soft(initial.every(value => value.panelLabelsTab), 'Team Access tabpanels are labelled by their tabs').toBe(true)
  const selectedIndex = Math.max(0, initial.findIndex(value => value.selected === 'true'))
  const selected = tabs.nth(selectedIndex)
  const reached = await tabUntilFocused(dialog.page(), selected)
  expect.soft(reached, 'Team Access selected tab is keyboard reachable').toBe(true)
  if (reached) {
    await dialog.page().keyboard.press('ArrowRight')
    const afterArrow = await tabs.evaluateAll(elements => ({
      activeIndex: elements.findIndex(element => element === document.activeElement),
      selectedIndex: elements.findIndex(element => element.getAttribute('aria-selected') === 'true'),
    }))
    expect.soft(afterArrow.activeIndex, 'Team Access ArrowRight moves focus').toBe((selectedIndex + 1) % initial.length)
    expect.soft(afterArrow.selectedIndex, 'Team Access ArrowRight moves selection').toBe((selectedIndex + 1) % initial.length)
    await dialog.page().keyboard.press('End')
    const afterEnd = await tabs.evaluateAll(elements => ({
      activeIndex: elements.findIndex(element => element === document.activeElement),
      selectedIndex: elements.findIndex(element => element.getAttribute('aria-selected') === 'true'),
    }))
    expect.soft(afterEnd.activeIndex, 'Team Access End moves focus').toBe(initial.length - 1)
    expect.soft(afterEnd.selectedIndex, 'Team Access End moves selection').toBe(initial.length - 1)
    await dialog.page().keyboard.press('Home')
    const afterHome = await tabs.evaluateAll(elements => ({
      activeIndex: elements.findIndex(element => element === document.activeElement),
      selectedIndex: elements.findIndex(element => element.getAttribute('aria-selected') === 'true'),
    }))
    expect.soft(afterHome.activeIndex, 'Team Access Home moves focus').toBe(0)
    expect.soft(afterHome.selectedIndex, 'Team Access Home moves selection').toBe(0)
    await dialog.page().keyboard.press('ArrowLeft')
    const afterLeft = await tabs.evaluateAll(elements => ({
      activeIndex: elements.findIndex(element => element === document.activeElement),
      selectedIndex: elements.findIndex(element => element.getAttribute('aria-selected') === 'true'),
    }))
    expect.soft(afterLeft.activeIndex, 'Team Access ArrowLeft wraps focus').toBe(initial.length - 1)
    expect.soft(afterLeft.selectedIndex, 'Team Access ArrowLeft wraps selection').toBe(initial.length - 1)
  }
  const panels = owner.locator('[role="tabpanel"]')
  await expect.soft(panels, 'Team Access keeps one connected panel shell per tab').toHaveCount(initial.length, { timeout: 200 })
  const panel = owner.locator('[role="tabpanel"]:not([hidden])')
  await expect.soft(panel, 'Team Access exposes exactly one active tabpanel').toHaveCount(1, { timeout: 200 })
  if (await panel.count() === 1) {
    const labelledBy = await panel.getAttribute('aria-labelledby')
    expect.soft(labelledBy, 'Team Access panel is labelled by its tab').toBeTruthy()
    if (labelledBy) {
      const resolved = await panel.evaluate((_element, references) => references.every(reference => {
        const label = document.getElementById(reference)
        const matches = [...document.querySelectorAll<HTMLElement>('[id]')].filter(candidate => candidate.id === reference)
        return Boolean(label?.isConnected && label.getAttribute('role') === 'tab' && matches.length === 1)
      }), labelledBy.trim().split(/\s+/).filter(Boolean))
      expect.soft(resolved, 'Team Access active panel labels resolve uniquely to tabs').toBe(true)
    }
  }
}

async function expectNativeTable(wrapper: Locator, columns: number, label: string): Promise<void> {
  const table = wrapper.getByRole('table')
  await expect.soft(table, `${label}: one native table`).toHaveCount(1)
  if (await table.count() !== 1) return
  await expect.soft(table.getByRole('columnheader'), `${label}: exact column headers`).toHaveCount(columns)
  expect.soft(await table.getByRole('cell').count(), `${label}: non-empty cells`).toBeGreaterThan(0)
}

async function expectStandaloneOperationsGeometry(
  page: Page,
  label: string,
  minimumInlinePadding: number,
): Promise<Readonly<Record<string, number | boolean>>> {
  const wrapper = page.locator('main#workmesh-main > .content.content--full')
  const count = await wrapper.count()
  expect.soft(count, `${label}: standalone Operations uses the full-width content wrapper`).toBe(1)
  if (count !== 1) return { present: false }

  const geometry = await wrapper.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const content = element.querySelector<HTMLElement>('.operations-tab')
    const contentRect = content?.getBoundingClientRect() ?? null
    return {
      contentLeft: contentRect?.left ?? rect.left,
      contentRight: contentRect?.right ?? rect.right,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      present: Boolean(content),
      wrapperLeft: rect.left,
      wrapperRight: rect.right,
    }
  })
  const tolerance = 1
  expect.soft(geometry.present, `${label}: wrapper contains OperationsContent`).toBe(true)
  expect.soft(geometry.paddingLeft, `${label}: keeps deliberate left padding`).toBeGreaterThanOrEqual(minimumInlinePadding)
  expect.soft(geometry.paddingRight, `${label}: keeps deliberate right padding`).toBeGreaterThanOrEqual(minimumInlinePadding)
  expect.soft(Math.abs(geometry.paddingLeft - geometry.paddingRight), `${label}: inline padding is symmetric`).toBeLessThanOrEqual(tolerance)
  expect.soft(geometry.wrapperLeft, `${label}: wrapper begins inside the viewport`).toBeGreaterThanOrEqual(-tolerance)
  expect.soft(geometry.wrapperRight, `${label}: wrapper ends inside the viewport`).toBeLessThanOrEqual(geometry.documentClientWidth + tolerance)
  expect.soft(geometry.contentLeft, `${label}: content respects left padding`).toBeGreaterThanOrEqual(geometry.wrapperLeft + geometry.paddingLeft - tolerance)
  expect.soft(geometry.contentRight, `${label}: content respects right padding`).toBeLessThanOrEqual(geometry.wrapperRight - geometry.paddingRight + tolerance)
  expect.soft(geometry.documentScrollWidth, `${label}: document remains contained`).toBe(geometry.documentClientWidth)
  return geometry
}

async function expectKeyboardLocalScroll(wrapper: Locator, label: string): Promise<Readonly<Record<string, number | boolean>>> {
  const page = wrapper.page()
  const reached = await tabUntilFocused(page, wrapper)
  expect.soft(reached, `${label}: wrapper is reachable with Tab`).toBe(true)
  const before = await wrapper.evaluate(element => {
    element.scrollLeft = 0
    return { clientWidth: element.clientWidth, scrollLeft: element.scrollLeft, scrollWidth: element.scrollWidth }
  })
  const focus = reached ? await expectVisibleFocus(wrapper, `${label} scroll wrapper`) : null
  expect.soft(before.scrollWidth, `${label}: local wrapper owns real horizontal overflow`).toBeGreaterThan(before.clientWidth)
  if (reached) {
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(50)
  }
  const after = await wrapper.evaluate(element => ({ scrollLeft: element.scrollLeft }))
  expect.soft(after.scrollLeft, `${label}: ArrowRight changes local scrollLeft`).toBeGreaterThan(before.scrollLeft)
  const documentContained = await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)
  expect.soft(documentContained, `${label}: local overflow does not widen the document`).toBe(true)
  return { ...before, afterScrollLeft: after.scrollLeft, documentContained, focus: Boolean(focus), reached }
}

async function openTeamAccess(page: Page, compact: boolean): Promise<void> {
  const trigger = page.getByRole('button', { name: /Atlas Agent/i }).first()
  await expect(trigger).toBeVisible()
  const reached = await tabUntilFocused(page, trigger)
  expect.soft(reached, 'Team Access trigger is keyboard reachable').toBe(true)
  if (!reached) return
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expectSemanticIntegrity(page, 'Team Access layer')
  await expectTeamAccessTabs(dialog, compact)
  await expectSemanticIntegrity(page, 'Team Access selected panel')
  await page.keyboard.press('/')
  await page.keyboard.press('Control+K')
  await expect.soft(page.getByTestId('command-center'), 'A live Team Access layer suppresses command-center shortcuts').toHaveCount(0)
  await expect.soft(page.getByRole('dialog'), 'Shortcuts do not stack another dialog').toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect.soft(trigger, 'Closing Team Access restores its trigger focus').toBeFocused()
}

async function expectPublicShortcutBoundary(page: Page, label: string): Promise<void> {
  const before = page.url()
  await page.keyboard.press('/')
  await page.keyboard.press('Control+K')
  await expect.soft(page.getByTestId('command-center-trigger'), `${label}: public route mounts no command trigger`).toHaveCount(0)
  expect.soft(page.url(), `${label}: public shortcuts do not navigate`).toBe(before)
}

test.describe('Task 6.6 desktop English keyboard and semantic journey', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('covers Home detail, Agents, Settings, Operations, tabs, tables, layers, and focus restore', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const fixture = new AccessibilityFixture()
    await fixture.install(page)
    await useLocale(page, 'en')
    const evidence: Record<string, unknown> = {}

    await page.goto('/?view=my-work&layout=list')
    const workItemTrigger = page.locator(`[data-work-item-id="${accessibilityIds.workItem}"] .wm-work-item-title`)
    await expect(workItemTrigger).toBeVisible()
    evidence.homeSkip = await expectSkipJourney(page, 'Home', 'en')
    evidence.home = await expectSemanticPage(page, 'Home')
    await expect.soft(page.locator('nav[aria-label]:visible'), 'Home exposes labelled navigation landmarks').not.toHaveCount(0)
    await expect.soft(page.locator('[data-hotkey-filter="true"]'), 'Home exposes one named filter').toHaveCount(1)
    const workCard = page.locator(`[data-work-item-id="${accessibilityIds.workItem}"]`)
    await expect.soft(workCard.locator('.wm-work-item-title'), 'Work card exposes title separately').toHaveText('Keyboard acceptance issue')
    await expect.soft(workCard.locator('.wm-work-item-project'), 'Work card exposes project separately').toContainText('Runtime reliability')
    await expect.soft(workCard.locator('.wm-work-item-status-pill'), 'Work card exposes status separately').toContainText('In progress')

    await page.keyboard.press('/')
    const commandCenter = page.getByTestId('command-center')
    await expect(commandCenter).toBeVisible()
    await expectSemanticIntegrity(page, 'Command Center layer')
    await page.keyboard.press('/')
    await page.keyboard.press('Control+K')
    await expect.soft(page.getByTestId('command-center'), 'Command-center shortcuts never stack a second layer').toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(commandCenter).toHaveCount(0)
    await expect.soft(page.locator('#workmesh-main'), 'Command Center returns focus to the keyboard origin').toBeFocused()

    expect.soft(await tabUntilFocused(page, workItemTrigger), 'Work Item is reachable from main with Tab').toBe(true)
    await page.keyboard.press('Enter')
    const detailDialog = page.getByRole('dialog')
    await expect(detailDialog).toBeVisible()
    await expectSemanticIntegrity(page, 'Work Item detail layer')
    const detailTabs = detailDialog.locator('.work-item-detail-layout > .wm-tabs > .wm-tab-list')
    await exerciseTablist(detailTabs, 'Work Item detail tabs')
    await page.keyboard.press('Escape')
    await expect(detailDialog).toHaveCount(0)
    await expect.soft(workItemTrigger, 'Closing Work Item detail restores the row trigger').toBeFocused()

    await page.goto('/agents?tab=agents')
    await expect(page.locator('.agent-registry-card')).toHaveCount(2)
    evidence.agentsSkip = await expectSkipJourney(page, 'Agents', 'en')
    evidence.agents = await expectSemanticPage(page, 'Agents')
    const agentOuterTabs = page.locator('.agent-center > .wm-tabs > .wm-tab-list')
    await exerciseTablist(agentOuterTabs, 'Agents primary tabs')

    const firstAgent = page.locator('[data-agent-roving-link="true"]').nth(0)
    const secondAgent = page.locator('[data-agent-roving-link="true"]').nth(1)
    expect.soft(await tabUntilFocused(page, firstAgent), 'First Agent is keyboard reachable').toBe(true)
    await page.keyboard.press('j')
    await expect.soft(secondAgent, 'J moves Agent focus forward').toBeFocused()
    await page.keyboard.press('k')
    await expect.soft(firstAgent, 'K moves Agent focus backward').toBeFocused()
    await page.keyboard.press('Space')
    const peekDialog = page.getByRole('dialog')
    await expect(peekDialog).toBeVisible()
    await expectSemanticIntegrity(page, 'Agent Peek layer')
    await page.keyboard.press('/')
    await page.keyboard.press('Control+K')
    await expect.soft(page.getByTestId('command-center'), 'Agent Peek suppresses command-center shortcuts').toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(peekDialog).toHaveCount(0)
    await expect.soft(firstAgent, 'Closing Agent Peek restores its Agent link').toBeFocused()
    await openTeamAccess(page, false)

    const primaryTabs = page.locator('.agent-center > .wm-tabs > .wm-tab-list')
    const primaryApprovalTab = primaryTabs.getByRole('tab', { name: 'Approvals' })
    const selectedPrimaryTab = primaryTabs.locator('[role="tab"][aria-selected="true"]')
    const primaryReached = await tabUntilFocused(page, selectedPrimaryTab)
    expect.soft(primaryReached, 'Selected primary Agent tab is keyboard reachable').toBe(true)
    if (primaryReached) {
      await primaryApprovalTab.focus()
      await page.keyboard.press('Enter')
    }
    await expect.soft(primaryApprovalTab, 'Selecting Approvals activates the approval workspace').toHaveAttribute('aria-selected', 'true')
    const approvalTabs = page.locator('.approval-inbox .wm-tab-list')
    await expect(approvalTabs).toBeVisible()
    const pendingGrid = page.locator('.approval-grid')
    await expect(pendingGrid).toBeVisible()
    await expect(pendingGrid.getByRole('row')).toHaveCount(2)
    await expect(pendingGrid.getByTestId(`approval-row-${accessibilityIds.approvalPending}`).getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(pendingGrid.getByTestId(`approval-row-${accessibilityIds.approvalPending}`).getByRole('button', { name: 'Reject' })).toBeVisible()
    await expect(pendingGrid.getByTestId(`approval-row-${accessibilityIds.approvalPending}`).getByRole('button', { name: 'Other feedback' })).toBeVisible()
    await expectSemanticIntegrity(page, 'Pending approvals panel')
    await exerciseTablist(approvalTabs, 'Approval Pending and History tabs')
    const historyWrap = page.locator('.approval-history-table-wrap')
    const historyTab = approvalTabs.getByRole('tab').last()
    await page.keyboard.press('End')
    await expect.soft(historyTab, 'Approval History is selected with End').toHaveAttribute('aria-selected', 'true')
    await expect(historyWrap).toBeVisible()
    await expectNativeTable(historyWrap, 7, 'Approval history')
    await expectSemanticIntegrity(page, 'Approval History panel')

    await page.goto('/settings?tab=workspace')
    await expect(page.locator('.settings-page')).toBeVisible()
    evidence.settingsSkip = await expectSkipJourney(page, 'Settings', 'en')
    evidence.settings = await expectSemanticPage(page, 'Settings')
    const deleteTrigger = page.getByRole('button', { name: 'Delete Team' })
    expect.soft(await tabUntilFocused(page, deleteTrigger), 'Delete Team is keyboard reachable').toBe(true)
    if (await deleteTrigger.evaluate(element => element === document.activeElement)) await page.keyboard.press('Enter')
    const deleteDialog = page.getByRole('dialog')
    await expect(deleteDialog).toBeVisible()
    await expectSemanticIntegrity(page, 'Delete Team layer')
    await page.keyboard.press('/')
    await page.keyboard.press('Control+K')
    await expect.soft(page.getByTestId('command-center'), 'Delete dialog suppresses command-center shortcuts').toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(deleteDialog).toHaveCount(0)
    await expect.soft(deleteTrigger, 'Canceling delete restores the destructive trigger').toBeFocused()
    const settingsTabs = page.locator('.settings-page > .wm-tabs > .wm-tab-list')
    await exerciseTablist(settingsTabs, 'Settings tabs')
    await page.keyboard.press('End')
    await expect.soft(page.locator('.settings-page > header h1'), 'Embedded Operations retains Settings h1').toHaveCount(1)
    await expect.soft(page.locator('.settings-tab-heading > h2'), 'Embedded Operations owns h2').toHaveCount(1)
    await expectSemanticIntegrity(page, 'Embedded Operations panel')

    await page.goto('/operations#operations-runs')
    const runsWrap = page.getByTestId('operations-table-scroll')
    await expect(runsWrap).toBeVisible()
    evidence.operationsSkip = await expectSkipJourney(page, 'Standalone Operations', 'en')
    evidence.operations = await expectSemanticPage(page, 'Standalone Operations')
    evidence.operationsGeometry = await expectStandaloneOperationsGeometry(page, '1920 Standalone Operations', 24)
    await expectNativeTable(runsWrap, 6, 'Operations Runs')
    await expect.soft(runsWrap.locator('caption'), 'Runs has a native caption').toHaveCount(1)
    const runRow = page.getByTestId(`run-row-${accessibilityIds.run}`)
    await expect.soft(runRow, 'Runs fixture is non-empty').toBeVisible()
    const errorReference = await runRow.getAttribute('aria-describedby')
    expect.soft(errorReference, 'Failed Run describes its error row').toBeTruthy()
    if (errorReference) await expect.soft(page.locator(`#${errorReference}`), 'Run error description ID resolves').toContainText('deterministic provider')
    await expect.soft(runRow.getByRole('link'), 'Run Session uses a native link').toHaveAttribute('href', `/agent-sessions/${accessibilityIds.session}`)

    fixture.expectNoUnexpected()
    evidence.requests = fixture.requests
    await attachScreenshot(testInfo, page, 'accessibility-desktop-english')
    await attachJson(testInfo, 'accessibility-desktop-english', evidence)
  })
})

test.describe('Task 6.6 phone Chinese keyboard and semantic journey', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('covers compact selectors, mobile navigation, local table scrolling, top layers, and containment', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const fixture = new AccessibilityFixture()
    await fixture.install(page)
    await useLocale(page, 'zh-CN')
    const evidence: Record<string, unknown> = {}

    await page.goto('/?view=my-work&layout=list')
    await expect(page.locator(`[data-work-item-id="${accessibilityIds.workItem}"]`)).toBeVisible()
    const mobileMenu = page.locator('.mobile-navigation > summary')
    const menuReached = await tabUntilFocused(page, mobileMenu, 20)
    expect.soft(menuReached, '390: real Tab navigation reaches mobile navigation').toBe(true)
    if (menuReached) {
      evidence.mobileNavigationFocus = await expectVisibleFocus(mobileMenu, '390 mobile navigation')
      await page.keyboard.press('Enter')
      await expect.soft(page.locator('.mobile-navigation[open] nav'), '390: Enter opens labelled mobile navigation').toBeVisible()
      await page.keyboard.press('Enter')
      await expect.soft(page.locator('.mobile-navigation[open]'), '390: Enter closes mobile navigation').toHaveCount(0)
    }
    await page.reload()
    await expect(page.locator(`[data-work-item-id="${accessibilityIds.workItem}"]`)).toBeVisible()
    evidence.homeSkip = await expectSkipJourney(page, '390 Home', 'zh-CN')
    evidence.home = await expectSemanticPage(page, '390 Home')
    const workItemTrigger = page.locator(`[data-work-item-id="${accessibilityIds.workItem}"] .wm-work-item-title`)
    expect.soft(await tabUntilFocused(page, workItemTrigger), '390 Work Item is keyboard reachable').toBe(true)
    if (await workItemTrigger.evaluate(element => element === document.activeElement)) await page.keyboard.press('Enter')
    const detailDialog = page.getByRole('dialog')
    await expect(detailDialog).toBeVisible()
    await expectSemanticIntegrity(page, '390 Work Item detail layer')
    await expectCompactTabs(detailDialog.locator('.work-item-detail-layout > .wm-tabs'), '390 Work Item detail')
    await page.keyboard.press('Escape')
    await expect(detailDialog).toHaveCount(0)
    await expect.soft(workItemTrigger, '390 closing Work Item detail restores focus').toBeFocused()

    await page.goto('/agents?tab=agents')
    await expect(page.locator('.agent-registry-card')).toHaveCount(2)
    evidence.agents = await expectSemanticPage(page, '390 Agents')
    const agentTabs = page.locator('.agent-center > .wm-tabs')
    await expectCompactTabs(agentTabs, '390 Agents primary tabs')
    const agentSelector = agentTabs.locator(':scope > .wm-tab-list-compact select.wm-tab-select')
    expect.soft(await tabUntilFocused(page, agentSelector), '390 Agents selector is keyboard reachable').toBe(true)
    await agentSelector.selectOption('approvals')
    const approvalTabs = page.locator('.approval-inbox > .wm-tabs')
    await expectCompactTabs(approvalTabs, '390 Approval views')
    const pendingGrid = page.locator('.approval-grid')
    await expect(pendingGrid).toBeVisible()
    await expect(pendingGrid.getByRole('row')).toHaveCount(2)
    const pendingRow = pendingGrid.getByTestId(`approval-row-${accessibilityIds.approvalPending}`)
    await expect(pendingRow.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(pendingRow.getByRole('button', { name: 'Reject' })).toBeVisible()
    await expect(pendingRow.getByRole('button', { name: 'Other feedback' })).toBeVisible()
    await expectSemanticIntegrity(page, '390 Pending approvals panel')
    evidence.pendingApprovalCard = await pendingRow.evaluate(element => {
      const actions = element.querySelector<HTMLElement>('.approval-row-actions')
      const bounds = actions?.getBoundingClientRect()
      return {
        actionBottom: bounds?.bottom ?? null,
        actionLeft: bounds?.left ?? null,
        actionRight: bounds?.right ?? null,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        gridClientWidth: element.parentElement?.clientWidth ?? null,
        gridScrollWidth: element.parentElement?.scrollWidth ?? null,
      }
    })
    expect(evidence.pendingApprovalCard).toMatchObject({ documentScrollWidth: 390, documentClientWidth: 390, gridScrollWidth: 390, gridClientWidth: 390 })
    const approvalSelector = approvalTabs.locator(':scope > .wm-tab-list-compact select.wm-tab-select')
    expect.soft(await tabUntilFocused(page, approvalSelector), '390 Approval selector is keyboard reachable').toBe(true)
    await approvalSelector.selectOption('history')
    const historyWrap = page.locator('.approval-history-table-wrap')
    await expect(historyWrap).toBeVisible()
    await expectNativeTable(historyWrap, 7, '390 Approval history')
    await expectSemanticIntegrity(page, '390 Approval History panel')
    evidence.historyScroll = await expectKeyboardLocalScroll(historyWrap, '390 Approval history')
    expect.soft(await tabUntilFocused(page, agentSelector), '390 Agents selector can return to Registry').toBe(true)
    if (await agentSelector.evaluate(element => element === document.activeElement)) await page.keyboard.press('Home')
    await expect(page.locator('.agent-registry-card')).toHaveCount(2)
    await openTeamAccess(page, true)

    await page.goto('/settings')
    await expect(page.locator('.settings-page')).toBeVisible()
    evidence.settings = await expectSemanticPage(page, '390 Settings')
    await expect(page.locator('.settings-page [role="tablist"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '团队' })).toBeVisible()
    await expectSemanticIntegrity(page, '390 Settings workspace')

    await page.goto('/operations#operations-runs')
    const runsWrap = page.getByTestId('operations-table-scroll')
    await expect(runsWrap).toBeVisible()
    evidence.operationsSkip = await expectSkipJourney(page, '390 Standalone Operations', 'zh-CN')
    evidence.operations = await expectSemanticPage(page, '390 Standalone Operations')
    evidence.operationsGeometry = await expectStandaloneOperationsGeometry(page, '390 Standalone Operations', 14)
    await expectNativeTable(runsWrap, 6, '390 Operations Runs')
    evidence.runsScroll = await expectKeyboardLocalScroll(runsWrap, '390 Operations Runs')

    fixture.expectNoUnexpected()
    evidence.requests = fixture.requests
    await attachScreenshot(testInfo, page, 'accessibility-phone-chinese')
    await attachJson(testInfo, 'accessibility-phone-chinese', evidence)
  })
})

const deepLinkCases = [
  { locale: 'en' as const, viewport: { width: 1920, height: 1080 } },
  { locale: 'zh-CN' as const, viewport: { width: 390, height: 844 } },
]

for (const entry of deepLinkCases) {
  test(`Agent and Session deep-link semantic smoke at ${entry.viewport.width}px ${entry.locale}`, async ({ page }, testInfo) => {
    test.setTimeout(60_000)
    await page.setViewportSize(entry.viewport)
    const fixture = new AccessibilityFixture()
    await fixture.install(page)
    await useLocale(page, entry.locale)
    const evidence: Record<string, unknown> = {}

    await page.goto(`/agents/${accessibilityIds.agentOne}`)
    await expect(page.locator('.agent-detail-panel')).toBeVisible()
    evidence.agentSkip = await expectSkipJourney(page, `${entry.viewport.width} Agent detail`, entry.locale)
    evidence.agent = await expectSemanticPage(page, `${entry.viewport.width} Agent detail`)
    const teamAccessLink = page.locator(`a[href*="teamAccessAgent=${accessibilityIds.agentOne}"]`)
    await expect.soft(teamAccessLink, 'Agent detail exposes one Team Access deep link').toHaveCount(1)
    await expect.soft(teamAccessLink, 'Agent detail Team Access deep link has an accessible name').toHaveAccessibleName(/\S/)
    await expect.soft(teamAccessLink, 'Agent detail Team Access deep link preserves the exact agent identity').toHaveAttribute('href', new RegExp(`teamAccessAgent=${accessibilityIds.agentOne}`))

    await page.goto(`/agent-sessions/${accessibilityIds.session}`)
    await expect(page.getByTestId('agent-session-detail')).toBeVisible()
    evidence.sessionSkip = await expectSkipJourney(page, `${entry.viewport.width} Session detail`, entry.locale)
    evidence.session = await expectSemanticPage(page, `${entry.viewport.width} Session detail`)
    await expect.soft(page.locator('.session-facts dt'), 'Session detail exposes native fact terms').not.toHaveCount(0)

    fixture.expectNoUnexpected()
    evidence.requests = fixture.requests
    await attachJson(testInfo, `accessibility-deep-links-${entry.viewport.width}-${entry.locale}`, evidence)
  })
}

const publicCases = [
  { locale: 'en' as const, viewport: { width: 1920, height: 1080 } },
  { locale: 'zh-CN' as const, viewport: { width: 390, height: 844 } },
]

for (const entry of publicCases) {
  test(`Login Install and Connect public semantic boundary at ${entry.viewport.width}px ${entry.locale}`, async ({ page }, testInfo) => {
    test.setTimeout(60_000)
    await page.setViewportSize(entry.viewport)
    const fixture = new AccessibilityFixture()
    await fixture.install(page)
    await useLocale(page, entry.locale)
    const evidence: Record<string, unknown> = {}

    fixture.installed = true
    await page.goto('/login')
    await expect(page.getByTestId('login-form')).toBeVisible()
    evidence.loginSkip = await expectSkipJourney(page, `${entry.viewport.width} Login`, entry.locale)
    evidence.login = await expectSemanticPage(page, `${entry.viewport.width} Login`)
    await expectPublicShortcutBoundary(page, 'Login')

    fixture.installed = false
    await page.goto('/install')
    await expect(page.getByTestId('install-form')).toBeVisible()
    evidence.installSkip = await expectSkipJourney(page, `${entry.viewport.width} Install`, entry.locale)
    evidence.install = await expectSemanticPage(page, `${entry.viewport.width} Install`)
    await expectPublicShortcutBoundary(page, 'Install')

    await page.goto('/connect#fixture')
    const configRegion = page.locator('.config-preview')
    await expect(configRegion).toBeVisible()
    evidence.connectSkip = await expectSkipJourney(page, `${entry.viewport.width} Connect`, entry.locale)
    evidence.connect = await expectSemanticPage(page, `${entry.viewport.width} Connect`)
    const clientPicker = page.getByRole('radiogroup')
    await expect.soft(clientPicker, 'Connect exposes one client picker').toHaveCount(1)
    if (await clientPicker.count() === 1) await expect.soft(clientPicker, 'Connect client picker has an accessible name').toHaveAccessibleName(/\S/)
    expect.soft(await page.getByRole('radio').count(), 'Connect advertises at least one selectable client').toBeGreaterThan(0)
    await expect.soft(configRegion, 'Connect configuration region has an accessible name').toHaveAccessibleName(/\S/)
    await expectPublicShortcutBoundary(page, 'Connect')

    const authenticatedPaths = ['/api/v1/auth/me', '/api/v1/teams', '/api/v1/projects', '/api/v1/work-items', '/api/v1/agents', '/api/v1/agent-sessions', '/api/v1/approvals']
    expect.soft(fixture.requests.filter(request => authenticatedPaths.includes(new URL(request.path, accessibilityWebUrl).pathname)), 'Public routes make no authenticated resource requests').toEqual([])
    fixture.expectNoUnexpected()
    evidence.requests = fixture.requests
    await attachJson(testInfo, `accessibility-public-${entry.viewport.width}-${entry.locale}`, evidence)
  })
}
