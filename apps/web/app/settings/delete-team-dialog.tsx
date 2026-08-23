'use client'

import { Button, Dialog } from '@workmesh/ui'
import { useState } from 'react'

export type DeleteTeamSnapshot = Readonly<{
  id: string
  key: string
  name: string
  revision: number
}>

export type DeleteTeamDialogCopy = {
  cancel: string
  close: string
  confirm: string
  confirmAccessible: (name: string) => string
  constraint: string
  deleting: string
  description: string
  keyLabel: string
  nameLabel: string
  title: string
}

export type DeleteTeamDialogProps = {
  busy: boolean
  copy: DeleteTeamDialogCopy
  error: string
  onCancel: () => void
  onConfirm: (team: DeleteTeamSnapshot) => void
  open: boolean
  team: DeleteTeamSnapshot | null
}

type OpenDeleteTeamDialogProps = Omit<DeleteTeamDialogProps, 'open' | 'team'> & {
  initialTeam: DeleteTeamSnapshot
}

function OpenDeleteTeamDialog({ busy, copy, error, initialTeam, onCancel, onConfirm }: OpenDeleteTeamDialogProps) {
  const [snapshot] = useState<DeleteTeamSnapshot>(() => Object.freeze({ ...initialTeam }))

  return <Dialog
    className="delete-team-dialog"
    closeLabel={copy.close}
    description={copy.description}
    dismissible={!busy}
    onClose={onCancel}
    open
    title={copy.title}
  >
    <div aria-busy={busy || undefined} className="delete-team-dialog-body">
      <dl className="delete-team-facts">
        <div><dt>{copy.nameLabel}</dt><dd>{snapshot.name}</dd></div>
        <div><dt>{copy.keyLabel}</dt><dd>{snapshot.key}</dd></div>
      </dl>
      <p className="delete-team-constraint">{copy.constraint}</p>
      {error && <p className="delete-team-error" role="alert">{error}</p>}
      {busy && <p aria-live="polite" className="delete-team-busy" role="status">{copy.deleting}</p>}
      <div className="delete-team-actions">
        <Button disabled={busy} onClick={onCancel} type="button">{copy.cancel}</Button>
        <Button
          aria-label={copy.confirmAccessible(snapshot.name)}
          disabled={busy}
          onClick={() => onConfirm(snapshot)}
          type="button"
          variant="danger"
        >{copy.confirm}</Button>
      </div>
    </div>
  </Dialog>
}

export function DeleteTeamDialog({ open, team, ...props }: DeleteTeamDialogProps) {
  if (!open || team === null) return null
  return <OpenDeleteTeamDialog {...props} initialTeam={team} />
}
