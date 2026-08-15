export function matchesPreviewWorkItem(item, searchParams) {
  const search = searchParams.get('search')?.trim().toLocaleLowerCase()
  const responsibleHumanActorId = searchParams.get('responsibleHumanActorId') || searchParams.get('ownerId')
  const identifier = `${item.team_key}-${item.number}`.toLocaleLowerCase()
  return (!search || item.title.toLocaleLowerCase().includes(search) || identifier.includes(search))
    && (!searchParams.get('statusId') || item.status_id === searchParams.get('statusId'))
    && (!searchParams.get('priority') || item.priority === searchParams.get('priority'))
    && (!responsibleHumanActorId || item.responsible_human_actor_id === responsibleHumanActorId)
    && (!searchParams.get('projectId') || item.project_id === searchParams.get('projectId'))
    && (!searchParams.get('milestoneId') || item.milestone_id === searchParams.get('milestoneId'))
    && (!searchParams.get('statusCategory') || item.status_category === searchParams.get('statusCategory'))
    && (!searchParams.get('label') || item.labels.includes(searchParams.get('label')))
}
