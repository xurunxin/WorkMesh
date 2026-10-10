import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { FeatureConfig } from '@workmesh/config';
import { type ConfigurationReadinessQuery, type ConfigurationReadinessResponse } from '@workmesh/contracts';
import type { ApiActor } from './agent/types.js';
export declare function loadConfigurationReadiness(db: Pool, current: ApiActor, query: ConfigurationReadinessQuery, features: FeatureConfig): Promise<ConfigurationReadinessResponse>;
export declare function registerConfigurationReadinessRoutes(app: FastifyInstance, h: {
    db: Pool;
    features: FeatureConfig;
}): void;
