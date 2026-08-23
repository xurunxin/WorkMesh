// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog, Sheet } from '@workmesh/ui'
import { DeleteTeamDialog, type DeleteTeamDialogCopy } from './delete-team-dialog'

const copy: DeleteTeamDialogCopy = {
  cancel: 'Cancel',
  close: 'Close',
  confirm: 'Delete team',
  confirmAccessible: name => `Delete team ${name}`,
  constraint: 'At least one active Team must remain.',
  deleting: 'Deleting…',
  description: 'The Team leaves active navigation while its associated work is retained but unavailable.',
  keyLabel: 'Team key',
  nameLabel: 'Team name',
  title: 'Delete Team',
}

const team = { id: 'team-1', name: 'Runtime', key: 'RUN', revision: 7 }

afterEach(cleanup)

describe('DeleteTeamDialog', () => {
  it('cancels without confirmation and confirms the frozen Team snapshot once', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const view = render(<DeleteTeamDialog
      busy={false}
      copy={copy}
      error=""
      onCancel={onCancel}
      onConfirm={onConfirm}
      open
      team={team}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    view.rerender(<DeleteTeamDialog busy={false} copy={copy} error="" onCancel={onCancel} onConfirm={onConfirm} open team={team} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete team Runtime' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(team)
  })

  it('keeps the open snapshot and one local alert when the incoming Team changes', () => {
    const view = render(<DeleteTeamDialog busy={false} copy={copy} error="First failure" onCancel={() => undefined} onConfirm={() => undefined} open team={team} />)
    view.rerender(<DeleteTeamDialog
      busy={false}
      copy={copy}
      error="First failure"
      onCancel={() => undefined}
      onConfirm={() => undefined}
      open
      team={{ id: 'team-2', name: 'Platform', key: 'PLAT', revision: 9 }}
    />)

    expect(screen.getByRole('dialog')).toHaveTextContent('Runtime')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Platform')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('keeps idle dismissal paths mutation-free and restores focus to the trigger', () => {
    const onConfirm = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(false)
      return <><button onClick={() => setOpen(true)} type="button">Open delete</button><DeleteTeamDialog
        busy={false}
        copy={copy}
        error=""
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
        open={open}
        team={team}
      /></>
    }

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open delete' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeVisible()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('blocks dismissal, repeat activation, and Tab escape while busy', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const view = render(<DeleteTeamDialog busy={false} copy={copy} error="" onCancel={onCancel} onConfirm={onConfirm} open team={team} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete team Runtime' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    view.rerender(<DeleteTeamDialog busy copy={copy} error="" onCancel={onCancel} onConfirm={onConfirm} open team={team} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Close Delete Team' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete team Runtime' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete team Runtime' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Delete team Runtime' }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Delete team Runtime' }), { key: ' ' })
    expect(onConfirm).toHaveBeenCalledTimes(1)

    const escape = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
    dialog.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    fireEvent.mouseDown(dialog.parentElement!)
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(dialog).toHaveFocus()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('mounts a fresh snapshot and clears the old modal alert after a close', () => {
    const view = render(<DeleteTeamDialog busy={false} copy={copy} error="Old failure" onCancel={() => undefined} onConfirm={() => undefined} open team={team} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Old failure')
    view.rerender(<DeleteTeamDialog busy={false} copy={copy} error="Old failure" onCancel={() => undefined} onConfirm={() => undefined} open={false} team={team} />)
    view.rerender(<DeleteTeamDialog
      busy={false}
      copy={copy}
      error=""
      onCancel={() => undefined}
      onConfirm={() => undefined}
      open
      team={{ id: 'team-2', name: 'Platform', key: 'PLAT', revision: 9 }}
    />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Platform')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Runtime')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('shared Dialog rendered compatibility', () => {
  it('keeps default Dialog and Sheet Escape/backdrop dismissal behavior', () => {
    const onDialogClose = vi.fn()
    const dialogView = render(<Dialog onClose={onDialogClose} open title="Default dialog"><button type="button">Ready</button></Dialog>)
    const dialog = screen.getByRole('dialog', { name: 'Default dialog' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.mouseDown(dialog.parentElement!)
    fireEvent.click(screen.getByRole('button', { name: 'Close Default dialog' }))
    expect(onDialogClose).toHaveBeenCalledTimes(3)
    dialogView.unmount()

    const onSheetClose = vi.fn()
    render(<Sheet onClose={onSheetClose} open title="Default sheet"><button type="button">Ready</button></Sheet>)
    const sheet = screen.getByRole('dialog', { name: 'Default sheet' })
    fireEvent.keyDown(sheet, { key: 'Escape' })
    fireEvent.mouseDown(sheet.parentElement!)
    expect(onSheetClose).toHaveBeenCalledTimes(2)
  })

  it('focuses a direct Dialog root with no enabled control and contains real Tab directions', () => {
    const onClose = vi.fn()
    render(<Dialog dismissible={false} onClose={onClose} open title="Busy dialog"><button disabled type="button">Disabled</button></Dialog>)
    const dialog = screen.getByRole('dialog', { name: 'Busy dialog' })
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
