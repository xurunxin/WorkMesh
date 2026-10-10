import type { PoolClient } from 'pg';
import type { FastifyRequest } from 'fastify';
import type { FeatureConfig } from '@workmesh/config';
import type { ApiActor } from '../agent/types.js';
import type { Paginator } from '../pagination.js';
export declare function loadRepositoryConfiguration(tx: PoolClient, request: FastifyRequest, current: ApiActor, features: FeatureConfig, paginator: Paginator): Promise<{
    items: {
        [x: string]: unknown;
    }[];
    nextCursor: string | null;
}>;
