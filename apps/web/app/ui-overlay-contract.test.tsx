// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog, Popover, Sheet, WorkItemCard, type WorkItemCardData } from '@workmesh/ui'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
  Object.defineProperty(window, 'scrollX', { configurable: true, value: 0 })
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  vi.restoreAllMocks()
})

function cancelableEscape(target: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
  target.dispatchEvent(event)
  return event
}

describe('shared modal stack', () => {
  it('focuses close first, supports an explicit initial target, and wraps only eligible controls', () => {
    function Harness({ explicit }: { explicit: boolean }) {
      const initialFocusRef = useRef<HTMLInputElement | null>(null)
      return <Dialog initialFocusRef={explicit ? initialFocusRef : undefined} onClose={() => undefined} open title="Focus contract">
        <button aria-hidden="true" type="button">Aria hidden</button>
        <button disabled type="button">Disabled</button>
        <input hidden defaultValue="Hidden" />
        <input aria-label="Explicit search" ref={initialFocusRef} />
        <details><summary>Summary target</summary></details>
        <div aria-label="Editable target" contentEditable role="textbox" suppressContentEditableWarning tabIndex={0}>Editable target</div>
        <button tabIndex={-2} type="button">Negative tab index</button>
      </Dialog>
    }

    const view = render(<Harness explicit={false} />)
    const close = screen.getByRole('button', { name: 'Close Focus contract' })
    const editable = screen.getByRole('textbox', { name: 'Editable target' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(editable).toHaveFocus()
    fireEvent.keyDown(editable, { key: 'Tab' })
    expect(close).toHaveFocus()

    view.unmount()
    render(<Harness explicit />)
    expect(screen.getByRole('textbox', { name: 'Explicit search' })).toHaveFocus()
  })

  it('lets only the top nested modal handle Escape/backdrop/Tab and restores focus inside its parent', () => {
    const outerClose = vi.fn()
    const innerClose = vi.fn()
    function Harness() {
      const [sheetOpen, setSheetOpen] = useState(true)
      const [dialogOpen, setDialogOpen] = useState(true)
      return <>
        <main id="workmesh-main" tabIndex={-1}>Main</main>
        <Sheet onClose={() => { outerClose(); setSheetOpen(false) }} open={sheetOpen} title="Parent sheet">
          <button onClick={() => setDialogOpen(true)} type="button">Open child</button>
          <button type="button">Parent last</button>
          <Dialog onClose={() => { innerClose(); setDialogOpen(false) }} open={dialogOpen} title="Child dialog">
            <button type="button">Child action</button>
          </Dialog>
        </Sheet>
      </>
    }

    render(<Harness />)
    const child = screen.getByRole('dialog', { name: 'Child dialog' })
    const parent = screen.getByRole('dialog', { name: 'Parent sheet' })
    fireEvent.mouseDown(child)
    expect(innerClose).not.toHaveBeenCalled()
    fireEvent.keyDown(child, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Child action' })).toHaveFocus()
    fireEvent.keyDown(child, { key: 'Escape' })
    expect(innerClose).toHaveBeenCalledTimes(1)
    expect(outerClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Child dialog' })).toBeNull()
    expect(parent).toBeVisible()
    expect(parent.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(parent, { key: 'Escape' })
    expect(outerClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('preserves the pre-modal opener when one click mounts a parent and child in the same commit', () => {
    function Harness() {
      const [sheetOpen, setSheetOpen] = useState(false)
      const [dialogOpen, setDialogOpen] = useState(false)
      return <>
        <button onClick={() => { setSheetOpen(true); setDialogOpen(true) }} type="button">Open both layers</button>
        <main id="workmesh-main" tabIndex={-1}>Main fallback</main>
        <Sheet onClose={() => setSheetOpen(false)} open={sheetOpen} title="Same-commit parent">
          <Dialog onClose={() => setDialogOpen(false)} open={dialogOpen} title="Same-commit child">
            <button type="button">Child control</button>
          </Dialog>
        </Sheet>
      </>
    }

    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open both layers' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Same-commit child' }), { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Same-commit parent' })).toBeVisible()
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Same-commit parent' }), { key: 'Escape' })
    expect(opener).toHaveFocus()
  })

  it('rejects background focus and restores invalid triggers to the parent layer, then main', () => {
    function Harness() {
      const [sheetOpen, setSheetOpen] = useState(false)
      const [dialogOpen, setDialogOpen] = useState(false)
      const [childTriggerPresent, setChildTriggerPresent] = useState(true)
      return <>
        {!sheetOpen && <button onClick={() => setSheetOpen(true)} type="button">Open sheet</button>}
        <main id="workmesh-main" tabIndex={-1}><button type="button">Background action</button></main>
        <Sheet onClose={() => setSheetOpen(false)} open={sheetOpen} title="Parent">
          {childTriggerPresent && <button onClick={() => { setDialogOpen(true); setChildTriggerPresent(false) }} type="button">Open nested</button>}
          <Dialog onClose={() => setDialogOpen(false)} open={dialogOpen} title="Nested"><button type="button">Nested action</button></Dialog>
        </Sheet>
      </>
    }

    render(<Harness />)
    const outerTrigger = screen.getByRole('button', { name: 'Open sheet' })
    outerTrigger.focus()
    fireEvent.click(outerTrigger)
    fireEvent.click(screen.getByRole('button', { name: 'Open nested' }))
    const child = screen.getByRole('dialog', { name: 'Nested' })
    const parent = screen.getByRole('dialog', { name: 'Parent' })
    screen.getByRole('button', { name: 'Background action' }).focus()
    expect(child.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(child, { key: 'Escape' })
    expect(parent.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(parent, { key: 'Escape' })
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('reference-counts inert and scroll locks in StrictMode and restores pre-existing state exactly', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 11 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 237 })
    document.documentElement.setAttribute('style', 'overflow: clip; color-scheme: dark;')
    document.body.setAttribute('style', 'overflow: auto; position: relative; padding-right: 7px;')
    const htmlStyle = document.documentElement.getAttribute('style')
    const bodyStyle = document.body.getAttribute('style')

    function Harness() {
      const [parentOpen, setParentOpen] = useState(true)
      const [childOpen, setChildOpen] = useState(true)
      return <StrictMode>
        <main data-testid="background" id="workmesh-main" tabIndex={-1}>Background</main>
        <aside data-testid="pre-inert" inert>Already inert</aside>
        <Sheet onClose={() => setParentOpen(false)} open={parentOpen} title="Locked parent">
          <Dialog onClose={() => setChildOpen(false)} open={childOpen} title="Locked child"><button type="button">Ready</button></Dialog>
        </Sheet>
      </StrictMode>
    }

    render(<Harness />)
    expect(screen.getByTestId('background')).toHaveAttribute('inert')
    expect(screen.getByTestId('pre-inert')).toHaveAttribute('inert')
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.top).toBe('-237px')

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Locked child' }), { key: 'Escape' })
    expect(document.body.style.position).toBe('fixed')
    expect(screen.getByTestId('background')).toHaveAttribute('inert')
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Locked parent' }), { key: 'Escape' })

    expect(screen.getByTestId('background')).not.toHaveAttribute('inert')
    expect(screen.getByTestId('pre-inert')).toHaveAttribute('inert')
    expect(document.documentElement.getAttribute('style')).toBe(htmlStyle)
    expect(document.body.getAttribute('style')).toBe(bodyStyle)
    expect(scrollTo).toHaveBeenLastCalledWith(11, 237)
  })

  it('inerts dynamically inserted background siblings and restores their original inert state', async () => {
    function Harness() {
      const [open, setOpen] = useState(true)
      return <>
        <main id="workmesh-main" tabIndex={-1}>Background</main>
        <Dialog onClose={() => setOpen(false)} open={open} title="Observed modal">
          <button type="button">Ready</button>
        </Dialog>
      </>
    }

    render(<Harness />)
    const dynamic = document.createElement('aside')
    dynamic.dataset.testid = 'dynamic-background'
    const dynamicPreInert = document.createElement('aside')
    dynamicPreInert.dataset.testid = 'dynamic-pre-inert'
    dynamicPreInert.setAttribute('inert', '')
    document.body.append(dynamic, dynamicPreInert)

    await waitFor(() => expect(dynamic).toHaveAttribute('inert'))
    expect(dynamicPreInert).toHaveAttribute('inert')

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Observed modal' }), { key: 'Escape' })
    await waitFor(() => expect(dynamic).not.toHaveAttribute('inert'))
    expect(dynamicPreInert).toHaveAttribute('inert')
  })

  it('respects defaultPrevented and keeps a nondismissible zero-control dialog on its root until idle', () => {
    const onClose = vi.fn()
    const view = render(<Dialog dismissible={false} onClose={onClose} open title="Busy"><button disabled type="button">Disabled</button></Dialog>)
    const busy = screen.getByRole('dialog', { name: 'Busy' })
    expect(busy).toHaveFocus()
    fireEvent.keyDown(busy, { key: 'Tab' })
    fireEvent.keyDown(busy, { key: 'Tab', shiftKey: true })
    expect(busy).toHaveFocus()
    const blockedEscape = cancelableEscape(busy)
    expect(blockedEscape.defaultPrevented).toBe(true)
    fireEvent.mouseDown(busy.parentElement!)
    expect(onClose).not.toHaveBeenCalled()

    view.rerender(<Dialog onClose={onClose} open title="Busy"><button type="button">Retry</button></Dialog>)
    const prevented = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
    prevented.preventDefault()
    screen.getByRole('dialog', { name: 'Busy' }).dispatchEvent(prevented)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Busy' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('shared dismissal stack', () => {
  it('orders initially open nested dismissals by DOM ownership and restores focus one layer at a time', () => {
    function Harness() {
      const [parentOpen, setParentOpen] = useState(true)
      const [childOpen, setChildOpen] = useState(true)
      return <Sheet onClose={() => undefined} open title="Nested dismissal owner">
        <Popover label="Parent dismissal" onOpenChange={setParentOpen} open={parentOpen} trigger="Parent dismissal trigger">
          <Popover label="Child dismissal" onOpenChange={setChildOpen} open={childOpen} trigger="Child dismissal trigger">
            <button type="button">Deep action</button>
          </Popover>
        </Popover>
      </Sheet>
    }

    render(<Harness />)
    const deepAction = screen.getByRole('button', { name: 'Deep action' })
    deepAction.focus()
    fireEvent.keyDown(deepAction, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Child dismissal' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Parent dismissal' })).toBeVisible()
    const childTrigger = screen.getByRole('button', { name: 'Child dismissal trigger' })
    expect(childTrigger).toHaveFocus()

    fireEvent.keyDown(childTrigger, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Parent dismissal' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Parent dismissal trigger' })).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Nested dismissal owner' })).toBeVisible()
  })

  it('closes a Popover before its parent Sheet, restores focus inside, and never owns inert or scroll lock', () => {
    const sheetClose = vi.fn()
    function Harness() {
      const [sheetOpen, setSheetOpen] = useState(true)
      const [popoverOpen, setPopoverOpen] = useState(true)
      return <>
        <main data-testid="background" id="workmesh-main" tabIndex={-1}>Background</main>
        <Sheet onClose={() => { sheetClose(); setSheetOpen(false) }} open={sheetOpen} title="Sheet with menu">
          <Popover label="Labels" onOpenChange={setPopoverOpen} open={popoverOpen} trigger="Open labels">
            <button type="button">Menu action</button>
          </Popover>
          <button type="button">Outside menu</button>
        </Sheet>
      </>
    }

    render(<Harness />)
    const sheet = screen.getByRole('dialog', { name: 'Sheet with menu' })
    const backdrop = sheet.parentElement!
    expect(fireEvent.pointerDown(backdrop)).toBe(false)
    fireEvent.mouseDown(backdrop)
    expect(fireEvent.click(backdrop)).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Labels' })).toBeNull()
    expect(sheet).toBeVisible()
    expect(sheetClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Open labels' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Open labels' }))
    const menuAction = screen.getByRole('button', { name: 'Menu action' })
    menuAction.focus()
    fireEvent.keyDown(menuAction, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Labels' })).toBeNull()
    expect(sheet).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open labels' })).toHaveFocus()
    expect(sheetClose).not.toHaveBeenCalled()
    expect(document.body.style.position).toBe('fixed')

    fireEvent.keyDown(sheet, { key: 'Escape' })
    expect(sheetClose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('background')).not.toHaveAttribute('inert')
    expect(document.body.style.position).toBe('')
  })

  it('dismisses only the top outside layer and a standalone Popover never locks or inerts the page', () => {
    const onOpenChange = vi.fn()
    render(<>
      <main data-testid="plain-background">Background</main>
      <Popover label="Standalone" onOpenChange={onOpenChange} open trigger="Toggle"><button type="button">Inside</button></Popover>
      <button type="button">Outside</button>
    </>)
    expect(screen.getByTestId('plain-background')).not.toHaveAttribute('inert')
    expect(document.body.style.position).toBe('')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: 'Toggle' })).toHaveFocus()
  })

  it('respects a downstream React pointerdown preventDefault before deciding outside dismissal', () => {
    function Harness() {
      const [open, setOpen] = useState(true)
      return <Sheet onClose={() => undefined} open title="Prevented owner">
        <Popover label="Protected menu" onOpenChange={setOpen} open={open} trigger="Protected trigger">
          <button type="button">Protected action</button>
        </Popover>
        <button onPointerDown={event => event.preventDefault()} type="button">Prevent outside dismissal</button>
      </Sheet>
    }

    render(<Harness />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Prevent outside dismissal' }))
    expect(screen.getByRole('dialog', { name: 'Protected menu' })).toBeVisible()
  })

  it('dismisses a controlled layer exactly once when bubble and capture fallback observe the same marker event', async () => {
    const firstChange = vi.fn()
    render(<Sheet onClose={() => undefined} open title="Controlled siblings">
      <Popover label="Controlled first" onOpenChange={firstChange} open trigger="Controlled first trigger">
        <button type="button">First action</button>
      </Popover>
      <Popover label="Controlled second" onOpenChange={() => undefined} open={false} trigger="Controlled second trigger">
        <button type="button">Second action</button>
      </Popover>
    </Sheet>)

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Controlled second trigger' }))
    await Promise.resolve()
    expect(firstChange).toHaveBeenCalledTimes(1)
    expect(firstChange).toHaveBeenCalledWith(false)
  })

  it('coordinates keyboard and assistive-technology activation across sibling Popovers', () => {
    const firstChange = vi.fn()
    const secondChange = vi.fn()
    function Harness() {
      const [firstOpen, setFirstOpen] = useState(false)
      const [secondOpen, setSecondOpen] = useState(false)
      return <Sheet onClose={() => undefined} open title="Keyboard siblings">
        <Popover label="Keyboard first" onOpenChange={next => { firstChange(next); setFirstOpen(next) }} open={firstOpen} trigger="Keyboard first trigger">
          <button type="button">First action</button>
        </Popover>
        <Popover label="Keyboard second" onOpenChange={next => { secondChange(next); setSecondOpen(next) }} open={secondOpen} trigger="Keyboard second trigger">
          <button type="button">Second action</button>
        </Popover>
      </Sheet>
    }

    render(<Harness />)
    const firstTrigger = screen.getByRole('button', { name: 'Keyboard first trigger' })
    const secondTrigger = screen.getByRole('button', { name: 'Keyboard second trigger' })
    fireEvent.keyDown(firstTrigger, { key: 'Enter' })
    fireEvent.click(firstTrigger, { detail: 0 })
    expect(screen.getByRole('dialog', { name: 'Keyboard first' })).toBeVisible()

    secondTrigger.focus()
    fireEvent.keyDown(secondTrigger, { key: 'Enter' })
    fireEvent.click(secondTrigger, { detail: 0 })
    expect(screen.queryByRole('dialog', { name: 'Keyboard first' })).toBeNull()
    expect(screen.getAllByRole('dialog').filter(dialog => dialog.getAttribute('aria-label')?.startsWith('Keyboard '))).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Keyboard second' })).toBeVisible()
    expect(secondTrigger).toHaveFocus()
    expect(firstChange.mock.calls).toEqual([[true], [false]])
    expect(secondChange).toHaveBeenCalledOnce()
  })

  it('clears a pending compatibility suppression when the last layer unmounts before remount', () => {
    function RemountHarness() {
      const [open, setOpen] = useState(false)
      return <StrictMode>
        <Popover label="Fresh menu" onOpenChange={setOpen} open={open} trigger="Fresh trigger">
          <button type="button">Fresh action</button>
        </Popover>
      </StrictMode>
    }

    const first = render(<Sheet onClose={() => undefined} open title="Transient owner">
      <Popover label="Transient menu" onOpenChange={() => undefined} open trigger="Transient trigger">
        <button type="button">Transient action</button>
      </Popover>
    </Sheet>)
    const backdrop = screen.getByRole('dialog', { name: 'Transient owner' }).parentElement!
    expect(fireEvent.pointerDown(backdrop)).toBe(false)
    first.unmount()

    render(<RemountHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Fresh trigger' }))
    expect(screen.getByRole('dialog', { name: 'Fresh menu' })).toBeVisible()
  })

  it('coordinates the public Work Item label menu as a dismissal layer inside a Sheet', () => {
    const sheetClose = vi.fn()
    const item: WorkItemCardData = {
      id: 'work-1',
      identifier: 'WM-1',
      labels: ['runtime', 'reliability'],
      statusId: 'open',
      statusName: 'Open',
      title: 'Overlay work',
    }
    render(<Sheet onClose={sheetClose} open title="Work sheet">
      <WorkItemCard
        availableLabels={['runtime', 'reliability', 'frontend']}
        item={item}
        layout="list"
        maxVisibleLabels={1}
        onLabelsChange={() => undefined}
      />
    </Sheet>)
    const trigger = document.querySelector<HTMLButtonElement>('.wm-work-item-label-more')
    expect(trigger).not.toBeNull()
    fireEvent.click(trigger!)
    const menu = screen.getByRole('dialog', { name: 'Labels for Overlay work' })
    const input = menu.querySelector('input')
    expect(input).not.toBeNull()
    input?.focus()
    fireEvent.keyDown(input!, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Labels for Overlay work' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Work sheet' })).toBeVisible()
    expect(trigger).toHaveFocus()
    expect(sheetClose).not.toHaveBeenCalled()
  })

  it('dismisses a sibling Work Item label menu before opening the next without leaking card drag pointerdown', async () => {
    const items: WorkItemCardData[] = [
      {
        id: 'work-a',
        identifier: 'WM-A',
        labels: ['runtime', 'reliability'],
        statusId: 'open',
        statusName: 'Open',
        title: 'First overlay work',
      },
      {
        id: 'work-b',
        identifier: 'WM-B',
        labels: ['frontend', 'accessibility'],
        statusId: 'open',
        statusName: 'Open',
        title: 'Second overlay work',
      },
    ]
    const cardPointerDown = vi.fn()
    render(<Sheet onClose={() => undefined} open title="Sibling menus">
      {items.map(item => <WorkItemCard
        availableLabels={['runtime', 'reliability', 'frontend', 'accessibility']}
        item={item}
        key={item.id}
        layout="list"
        maxVisibleLabels={1}
        onLabelsChange={() => undefined}
        onPointerDown={cardPointerDown}
      />)}
    </Sheet>)
    const triggers = [...document.querySelectorAll<HTMLButtonElement>('.wm-work-item-label-more')]
    expect(triggers).toHaveLength(2)
    const firstTrigger = triggers[0]!
    const secondTrigger = triggers[1]!
    fireEvent.click(firstTrigger)
    expect(screen.getByRole('dialog', { name: 'Labels for First overlay work' })).toBeVisible()

    fireEvent.pointerDown(secondTrigger)
    await Promise.resolve()
    fireEvent.click(secondTrigger)

    expect(screen.queryByRole('dialog', { name: 'Labels for First overlay work' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Labels for Second overlay work' })).toBeVisible()
    expect(cardPointerDown).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Second overlay work' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Labels for Second overlay work' })).toBeNull())
    expect(cardPointerDown).not.toHaveBeenCalled()
  })

  it('coordinates Space activation from sibling visible label chips and restores the actual chip', () => {
    const items: WorkItemCardData[] = [
      { id: 'keyboard-a', identifier: 'WM-KA', labels: ['runtime', 'reliability'], statusId: 'open', statusName: 'Open', title: 'Keyboard first work' },
      { id: 'keyboard-b', identifier: 'WM-KB', labels: ['frontend', 'accessibility'], statusId: 'open', statusName: 'Open', title: 'Keyboard second work' },
    ]
    render(<Sheet onClose={() => undefined} open title="Keyboard label menus">
      {items.map(item => <WorkItemCard
        availableLabels={['runtime', 'reliability', 'frontend', 'accessibility']}
        item={item}
        key={item.id}
        layout="list"
        maxVisibleLabels={1}
        onLabelsChange={() => undefined}
      />)}
    </Sheet>)
    const chips = [...document.querySelectorAll<HTMLButtonElement>('.wm-work-item-label')]
    expect(chips).toHaveLength(2)
    fireEvent.keyDown(chips[0]!, { key: ' ' })
    fireEvent.click(chips[0]!, { detail: 0 })
    expect(screen.getByRole('dialog', { name: 'Labels for Keyboard first work' })).toBeVisible()

    chips[1]!.focus()
    fireEvent.keyDown(chips[1]!, { key: ' ' })
    fireEvent.click(chips[1]!, { detail: 0 })
    expect(screen.queryByRole('dialog', { name: 'Labels for Keyboard first work' })).toBeNull()
    const secondMenu = screen.getByRole('dialog', { name: 'Labels for Keyboard second work' })
    expect(secondMenu).toBeVisible()
    expect(document.querySelectorAll('.wm-work-item-label-menu-panel')).toHaveLength(1)

    fireEvent.keyDown(secondMenu, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Labels for Keyboard second work' })).toBeNull()
    expect(chips[1]).toHaveFocus()
  })

  it('keeps a single editable label menu reachable by click, Enter, and Space without phantom open state', () => {
    const item: WorkItemCardData = {
      id: 'single-label',
      identifier: 'WM-SINGLE',
      labels: ['runtime'],
      statusId: 'open',
      statusName: 'Open',
      title: 'Single label work',
    }
    render(<Sheet onClose={() => undefined} open title="Single label owner">
      <WorkItemCard
        availableLabels={['runtime', 'frontend']}
        item={item}
        layout="list"
        maxVisibleLabels={4}
        onLabelsChange={() => undefined}
      />
    </Sheet>)
    const chip = document.querySelector<HTMLButtonElement>('.wm-work-item-label')
    expect(chip).not.toBeNull()
    expect(document.querySelector('.wm-work-item-label-more')).toBeNull()
    expect(chip).toHaveAttribute('aria-expanded', 'false')

    const openAndClose = (reactivationKey: 'Enter' | ' ') => {
      fireEvent.click(chip!, { detail: 1 })
      expect(chip).toHaveAttribute('aria-expanded', 'true')
      let menu = screen.getByRole('dialog', { name: 'Labels for Single label work' })
      expect(document.querySelectorAll('.wm-work-item-label-menu-panel')).toHaveLength(1)
      chip!.focus()
      fireEvent.keyDown(chip!, { key: reactivationKey })
      fireEvent.click(chip!, { detail: 0 })
      expect(chip).toHaveAttribute('aria-expanded', 'true')
      menu = screen.getByRole('dialog', { name: 'Labels for Single label work' })
      expect(document.querySelectorAll('.wm-work-item-label-menu-panel')).toHaveLength(1)
      fireEvent.keyDown(menu, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'Labels for Single label work' })).toBeNull()
      expect(chip).toHaveAttribute('aria-expanded', 'false')
      expect(chip).toHaveFocus()
    }

    openAndClose('Enter')
    openAndClose(' ')
  })

  it('re-anchors one open menu between visible labels on the same card and returns to the latest chip', () => {
    const item: WorkItemCardData = {
      id: 'two-labels',
      identifier: 'WM-TWO',
      labels: ['runtime', 'frontend'],
      statusId: 'open',
      statusName: 'Open',
      title: 'Two label work',
    }
    render(<Sheet onClose={() => undefined} open title="Two label owner">
      <WorkItemCard
        availableLabels={['runtime', 'frontend', 'accessibility']}
        item={item}
        layout="list"
        maxVisibleLabels={2}
        onLabelsChange={() => undefined}
      />
    </Sheet>)
    const chips = [...document.querySelectorAll<HTMLButtonElement>('.wm-work-item-label')]
    expect(chips).toHaveLength(2)
    fireEvent.click(chips[0]!, { detail: 1 })
    expect(screen.getByRole('dialog', { name: 'Labels for Two label work' })).toBeVisible()

    chips[1]!.focus()
    fireEvent.keyDown(chips[1]!, { key: 'Enter' })
    fireEvent.click(chips[1]!, { detail: 0 })
    const menu = screen.getByRole('dialog', { name: 'Labels for Two label work' })
    expect(document.querySelectorAll('.wm-work-item-label-menu-panel')).toHaveLength(1)
    expect(chips[0]).toHaveAttribute('aria-expanded', 'true')
    expect(chips[1]).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Labels for Two label work' })).toBeNull()
    expect(chips[1]).toHaveFocus()
  })

  it('retires a parent dismissal when a child modal opens so Escape and depth belong to the child', () => {
    const childClose = vi.fn()
    const sheetClose = vi.fn()
    function Harness() {
      const [childOpen, setChildOpen] = useState(false)
      const [menuOpen, setMenuOpen] = useState(true)
      return <Sheet onClose={sheetClose} open title="Parent owner">
        <Popover label="Parent menu" onOpenChange={setMenuOpen} open={menuOpen} trigger="Parent trigger">
          <button onClick={() => setChildOpen(true)} type="button">Open child from menu</button>
        </Popover>
        <Dialog onClose={() => { childClose(); setChildOpen(false) }} open={childOpen} title="Owned child">
          <button type="button">Child action</button>
        </Dialog>
      </Sheet>
    }

    render(<Harness />)
    expect(screen.getByRole('dialog', { name: 'Parent menu' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Open child from menu' }))

    const child = screen.getByRole('dialog', { name: 'Owned child' })
    const parent = screen.getByRole('dialog', { name: 'Parent owner' })
    expect(screen.queryByRole('dialog', { name: 'Parent menu' })).toBeNull()
    fireEvent.keyDown(child, { key: 'Escape' })
    expect(childClose).toHaveBeenCalledTimes(1)
    expect(sheetClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Owned child' })).toBeNull()
    expect(parent).toBeVisible()
    expect(parent.contains(document.activeElement)).toBe(true)
  })

  it('retires a keyboard-replaced sibling exactly once when the same activation opens a child Dialog', () => {
    const firstChange = vi.fn()
    const childClose = vi.fn()
    function Harness() {
      const [firstOpen, setFirstOpen] = useState(true)
      const [secondOpen, setSecondOpen] = useState(false)
      const [childOpen, setChildOpen] = useState(false)
      return <Sheet onClose={() => undefined} open title="Replacement owner">
        <Popover label="Replacement first" onOpenChange={next => { firstChange(next); setFirstOpen(next) }} open={firstOpen} trigger="Replacement first trigger">
          <button type="button">First action</button>
        </Popover>
        <Popover
          label="Replacement second"
          onOpenChange={next => { setSecondOpen(next); if (next) setChildOpen(true) }}
          open={secondOpen}
          trigger="Replacement second trigger"
        >
          <button type="button">Second action</button>
        </Popover>
        <Dialog onClose={() => { childClose(); setChildOpen(false) }} open={childOpen} title="Replacement child">
          <button type="button">Child action</button>
        </Dialog>
      </Sheet>
    }

    render(<Harness />)
    const secondTrigger = screen.getByRole('button', { name: 'Replacement second trigger' })
    secondTrigger.focus()
    fireEvent.keyDown(secondTrigger, { key: 'Enter' })
    fireEvent.click(secondTrigger, { detail: 0 })

    expect(firstChange.mock.calls).toEqual([[false]])
    expect(screen.queryByRole('dialog', { name: 'Replacement first' })).toBeNull()
    const child = screen.getByRole('dialog', { name: 'Replacement child' })
    expect(child).toBeVisible()
    expect(child.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(child, { key: 'Escape' })
    expect(childClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: 'Replacement owner' })).toBeVisible()
  })
})
