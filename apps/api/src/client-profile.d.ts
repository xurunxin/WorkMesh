import type { FastifyInstance } from 'fastify';
import type { Db } from '@workmesh/db';
import type { FeatureConfig } from '@workmesh/config';
export declare function registerClientProfileRoutes(app: FastifyInstance, options: {
    db: Db;
    features: FeatureConfig;
}): void;
