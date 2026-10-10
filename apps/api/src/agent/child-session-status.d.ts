import type { FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Paginator } from '../pagination.js';
export declare function listChildSessionStatus(db: Pool, paginator: Paginator, request: FastifyRequest, parentId: string): Promise<{
    items: {
        planStepId: string;
        planVersionId: string;
        id: string;
        parentSessionId: string;
        requiredForParent: boolean;
        state: "queued" | "acknowledged" | "planning" | "executing" | "awaiting_input" | "awaiting_approval" | "blocked" | "paused" | "stopping" | "stale" | "completed" | "failed" | "canceled";
        revision: number;
        resultArtifactIds: string[];
    }[];
    nextCursor: string | null;
}>;
