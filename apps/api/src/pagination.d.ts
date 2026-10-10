import type { FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { Config } from '@workmesh/config';
import { type ListResponse } from '@workmesh/contracts';
type CursorScalar = string | number | boolean | null;
export type PageSortField = {
    key: string;
    sql: string;
    direction: 'ASC' | 'DESC';
    value?: (row: Record<string, unknown>) => CursorScalar;
};
type CursorPayload = {
    v: 1;
    kid: string;
    iat: number;
    exp: number;
    route: string;
    workspaceId: string;
    actorId: string;
    filterHash: string;
    sort: string;
    values: CursorScalar[];
};
export type PaginationBinding = {
    route: string;
    filters?: unknown;
    sort: readonly PageSortField[];
};
export type PreparedPage = {
    limit: number;
    values: unknown[];
    predicate: string;
    orderBy: string;
    beforeQuery: () => Promise<void>;
    cursorFor: <T extends Record<string, unknown>>(row: T) => string;
    finish: <T extends Record<string, unknown>>(rows: T[]) => ListResponse<T>;
};
type Queryable = Pick<Pool | PoolClient, 'query'>;
export declare function createPaginator(config: Pick<Config, 'paginationCursorKeys' | 'paginationCursorActiveKid' | 'PAGINATION_CURSOR_TTL_SECONDS'>, clock?: () => number, beforePagedQuery?: (route: string) => Promise<void> | void): {
    prepare: (request: FastifyRequest, rawQuery: unknown, binding: PaginationBinding, baseValues?: readonly unknown[]) => PreparedPage;
    query: <T extends Record<string, unknown>>(db: Queryable, request: FastifyRequest, rawQuery: unknown, binding: PaginationBinding, sql: string, baseValues?: readonly unknown[], beforeOrder?: string) => Promise<ListResponse<T>>;
    encode: (payload: Omit<CursorPayload, "v" | "kid" | "iat" | "exp">) => string;
    decode: (token: string) => CursorPayload;
};
export type Paginator = ReturnType<typeof createPaginator>;
export {};
