export async function recoverFailedDeployment({ journal, failedAction, stopRuntime, recoverPrevious, persist }) {
  if (failedAction === 'verify-health-and-ledger') {
    const entry = { name: 'stop-unvalidated-runtime', status: 'intent', startedAt: new Date().toISOString() }
    journal.actions.push(entry)
    await persist()
    try {
      await stopRuntime()
      entry.status = 'completed'
    } catch (error) {
      entry.status = 'failed'
      const known = ['INSTALL_DEPLOYMENT_MISSING', 'INSTALL_DEPLOYMENT_OWNERSHIP_MISMATCH',
        'INSTALL_RUNTIME_STOP_FAILED', 'INSTALL_DOCKER_COMMAND_FAILED']
      entry.failureCode = known.includes(error.message) ? error.message : 'unknown'
      if (error.diagnostics) entry.diagnostics = error.diagnostics
      journal.recovery = { status: 'runtime-stop-failed' }
      entry.finishedAt = new Date().toISOString()
      await persist()
      return
    }
    entry.finishedAt = new Date().toISOString()
    await persist()
  }
  if (recoverPrevious) {
    try { await recoverPrevious() }
    catch {
      // Only a verified successful stop permits a stopped claim. Earlier
      // admission/backup failures may leave the old runtime partially running.
      journal.recovery = failedAction === 'verify-health-and-ledger'
        ? { status: 'stopped-restore-required' } : { status: 'restore-required' }
      await persist()
    }
  }
}
