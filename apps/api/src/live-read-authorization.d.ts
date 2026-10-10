import type { ApiActor } from './agent/types.js';
/**
 * Produces a correlated predicate that revalidates the authenticated human
 * credential and current Team authority in the same statement that returns
 * protected rows.
 */
export declare function liveHumanTeamReadPredicate(current: ApiActor, workspaceSql: string, teamSql: string, values: unknown[]): string;
/**
 * Revalidates a session-scoped read in the final SELECT. Human readers retain
 * admin-or-Team semantics; Agent readers are limited to their exact live
 * session, credential, delegation, definition, Team grant, capability, and
 * resource scope.
 */
export declare function liveSessionReadPredicate(current: ApiActor, sessionSql: string, workspaceSql: string, values: unknown[], requiredCapability?: 'work:read' | 'repo:read'): string;
