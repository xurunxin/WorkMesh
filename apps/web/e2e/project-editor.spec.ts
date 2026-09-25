import { expect, test } from '@playwright/test'

test('Project creation and revisioned edit keep Markdown and the selected URL after reload', async ({ page }) => {
  const originalName = `WebPi project ${Date.now()}`
  const updatedName = `${originalName} updated`
  await page.goto('/?view=projects')
  await page.locator('.project-rail header').getByRole('button', { name: /新建项目|New project/ }).click()
  const create = page.getByTestId('create-project')
  await create.locator('input[name="name"]').fill(originalName)
  await create.locator('input[name="summary"]').fill('Project summary')
  await create.locator('textarea[name="description"]').fill('## First revision\n\nReal Markdown description.')
  await create.getByRole('button', { name: /创建项目|Create project/ }).click()
  await expect(page.locator('.hcp-project-heading h1')).toHaveText(originalName)
  await expect(page).toHaveURL(/view=projects.*project=/)

  const milestoneName = `Milestone ${Date.now()}`
  await page.locator('.project-detail-pane').getByRole('button', { name: /里程碑|Milestones/ }).click()
  const milestones = page.getByTestId('project-milestones')
  await milestones.getByRole('button', { name: /新建里程碑|New milestone/ }).click()
  const milestoneForm = page.getByTestId('milestone-form')
  await milestoneForm.locator('input[name="name"]').fill(milestoneName)
  await milestoneForm.locator('textarea[name="description"]').fill('## First milestone\n\nTracked with the project.')
  await milestoneForm.getByRole('button', { name: /保存里程碑|Save milestone/ }).click()
  await expect(milestones.locator('strong').filter({ hasText: milestoneName })).toBeVisible()
  await milestones.getByRole('button', { name: new RegExp(`(?:编辑|Edit) ${milestoneName}`) }).click()
  await milestoneForm.locator('input[name="targetDate"]').fill('2026-10-15')
  await milestoneForm.getByRole('button', { name: /保存里程碑|Save milestone/ }).click()
  await expect(milestones.getByText('2026-10-15')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(milestones).toBeHidden()

  await page.locator('.project-detail-pane').getByRole('button', { name: /新建 Issue|New issue/ }).click()
  const issue = page.getByTestId('create-work-item')
  const issueTitle = `Project issue ${Date.now()}`
  await issue.locator('input[name="title"]').fill(issueTitle)
  await issue.locator('textarea[name="description"]').fill('## Project issue\n\nCreated from the selected Project.')
  await expect(issue.locator('select[name="projectId"]')).toHaveValue(new URL(page.url()).searchParams.get('project') ?? '')
  let issueCreateRequests = 0
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/work-items') issueCreateRequests += 1
  })
  await issue.evaluate(form => {
    const target = form as HTMLFormElement
    target.requestSubmit()
    target.requestSubmit()
  })
  await expect(issue).toBeHidden()
  expect(issueCreateRequests).toBe(1)
  await page.getByTestId('project-control-view-work').click()
  await expect(page.locator('.project-detail-pane').getByRole('button', { name: issueTitle, exact: true })).toBeVisible()

  await page.getByRole('button', { name: /编辑项目|Edit project/ }).click()
  const edit = page.getByTestId('edit-project')
  await edit.locator('input[name="name"]').fill(updatedName)
  await edit.locator('textarea[name="description"]').fill('## Second revision\n\nPersisted after reload.')
  await edit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  await expect(page.locator('.hcp-project-heading h1')).toHaveText(updatedName)
  await expect(page.locator('.hcp-project-heading h2')).toContainText('Second revision')

  await page.reload()
  await expect(page.locator('.hcp-project-heading h1')).toHaveText(updatedName)
  await expect(page.locator('.hcp-project-heading')).toContainText('Persisted after reload.')

  await page.getByRole('button', { name: /编辑项目|Edit project/ }).click()
  const staleEdit = page.getByTestId('edit-project')
  const other = await page.context().newPage()
  await other.goto(page.url())
  await expect(other.locator('.hcp-project-heading h1')).toHaveText(updatedName)
  await other.getByRole('button', { name: /编辑项目|Edit project/ }).click()
  const otherEdit = other.getByTestId('edit-project')
  await otherEdit.locator('input[name="name"]').fill(`${updatedName} by another editor`)
  await otherEdit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  await expect(other.locator('.hcp-project-heading h1')).toHaveText(`${updatedName} by another editor`)
  await other.close()

  const pendingMarkdown = '## Reviewed after conflict\n\nMy draft survives a stale revision.'
  await staleEdit.locator('textarea[name="description"]').fill(pendingMarkdown)
  await staleEdit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  await expect(staleEdit.getByRole('alert')).toBeVisible()
  await expect(staleEdit.locator('textarea[name="description"]')).toHaveValue(pendingMarkdown)
  await staleEdit.getByRole('button', { name: /重新加载最新数据|Reload latest work/ }).click()
  const reconciliation = staleEdit.getByTestId('draft-reconciliation')
  await expect(reconciliation).toBeVisible()
  await reconciliation.getByRole('button', { name: /恢复并检查|Restore for review/ }).click()
  await expect(staleEdit.locator('textarea[name="description"]')).toHaveValue(pendingMarkdown)
  await staleEdit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  await expect(page.locator('.hcp-project-heading h1')).toHaveText(`${updatedName} by another editor`)
  await expect(page.locator('.hcp-project-heading')).toContainText('My draft survives a stale revision.')
})
