import type { FastifyInstance } from 'fastify';
import { type RoutePolicyManifestEntry } from '@workmesh/contracts';
declare module 'fastify' {
    interface FastifyContextConfig {
        workmeshOperationId?: string;
        workmeshPolicyId?: string;
    }
}
export type RoutePolicyInventory = Readonly<{
    registeredRoutes: () => readonly string[];
}>;
export declare function installRoutePolicyInventory(app: FastifyInstance, manifest?: readonly RoutePolicyManifestEntry[]): RoutePolicyInventory;
