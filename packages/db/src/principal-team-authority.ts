/** Current Human authority; delegation/lease alone cannot retain Team access. */
export function principalTeamAuthorityPredicate(principalIdSql: string, workspaceSql: string, teamSql: string): string {
  return `EXISTS(SELECT 1 FROM actors authority_principal
    WHERE authority_principal.id=${principalIdSql} AND authority_principal.workspace_id=${workspaceSql}
      AND authority_principal.kind='human' AND authority_principal.is_active
      AND (authority_principal.workspace_role='admin' OR EXISTS(SELECT 1 FROM memberships authority_membership
        WHERE authority_membership.workspace_id=${workspaceSql} AND authority_membership.team_id=${teamSql}
          AND authority_membership.actor_id=authority_principal.id)))`
}
