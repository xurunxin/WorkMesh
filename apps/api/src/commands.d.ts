import type { Pool, PoolClient } from "pg";
import type { ApiActor } from "./agent/types.js";
export type Actor = ApiActor;
export type CommandContext = {
    actor: Actor;
    idempotencyKey: string;
    correlationId: string;
    operation: string;
    requestHash: string;
    clientContext?: Record<string, string | null>;
};
export type MutationOptions = {
    beforeReserve?: (tx: PoolClient) => Promise<void>;
    authorizeReplay?: (tx: PoolClient) => Promise<void>;
};
export declare function authorizeTeamMutation(tx: PoolClient, context: CommandContext, teamId: string): Promise<void>;
/** Reserve first so concurrent requests with the same key serialize on the PK.
 * A failed command rolls the reservation back together with all its writes. */
export declare function mutate<T>(db: Pool, context: CommandContext, handler: (tx: PoolClient) => Promise<T>, options?: MutationOptions): Promise<T>;
export declare const commands: {
    updateWorkspace: (db: Pool, c: CommandContext, revision: number, input: {
        name?: string;
        slug?: string;
    }) => Promise<{
        id: string;
        revision: number;
    }>;
    createTeam: (db: Pool, c: CommandContext, input: {
        name: string;
        key: string;
    }) => Promise<{
        id: string;
        revision: number;
    }>;
    updateTeam: (db: Pool, c: CommandContext, id: string, revision: number, input: {
        name?: string;
        key?: string;
    }) => Promise<{
        id: string;
        revision: number;
    }>;
    deleteTeam: (db: Pool, c: CommandContext, id: string, revision: number) => Promise<{
        id: string;
        revision: number;
    }>;
    createState: (db: Pool, c: CommandContext, teamId: string, input: {
        name: string;
        category: string;
        color?: string;
        position?: number;
    }) => Promise<{
        id: string;
        revision: number;
    }>;
    updateState: (db: Pool, c: CommandContext, teamId: string, stateId: string, revision: number, input: {
        name?: string;
        color?: string;
    }) => Promise<{
        id: string;
        revision: number;
    }>;
    createProject: (db: Pool, c: CommandContext, input: {
        teamId: string;
        name: string;
        summary?: string;
        description?: string | null;
        status?: string;
        leadActorId?: string | null;
        targetDate?: Date | null;
    }) => Promise<{
        id: string;
        revision: number;
    }>;
    updateProject: (db: Pool, c: CommandContext, id: string, revision: number, input: Record<string, unknown>) => Promise<{
        id: string;
        revision: number;
    }>;
    deleteProject: (db: Pool, c: CommandContext, id: string, revision: number) => Promise<{
        id: string;
        revision: number;
    }>;
    createWorkItem: (db: Pool, c: CommandContext, input: {
        teamId: string;
        title: string;
        description?: string;
        statusId: string;
        priority: string;
        dueDate?: Date;
        responsibleHumanActorId?: string;
        labels: string[];
        projectId?: string;
        milestoneId?: string;
        parentId?: string;
    }) => Promise<{
        id: string;
        revision: number;
        number: number;
    }>;
    updateWorkItem: (db: Pool, c: CommandContext, id: string, revision: number, input: Record<string, unknown>) => Promise<{
        id: string;
        revision: number;
    }>;
    deleteWorkItem: (db: Pool, c: CommandContext, id: string, revision: number) => Promise<{
        id: string;
        revision: number;
    }>;
    createComment: (db: Pool, c: CommandContext, workItemId: string, input: {
        body: string;
        parentCommentId?: string;
        replyToCommentId?: string;
        mentions: string[];
    }) => Promise<{
        id: string;
        revision: number;
    }>;
    updateComment: (db: Pool, c: CommandContext, id: string, revision: number, input: {
        body?: string;
        isResolved?: boolean;
        deleted?: boolean;
    }) => Promise<{
        id: string;
        revision: number;
    }>;
};
