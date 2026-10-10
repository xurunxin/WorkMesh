import type { FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { type RoutePolicyManifestEntry } from '@workmesh/contracts';
import { DomainError } from '@workmesh/domain';
export declare function policyForRequest(request: FastifyRequest): RoutePolicyManifestEntry;
export declare function sessionActiveForOperation(state: string, operationId: string): boolean;
export declare function authorizeRequest(db: Pool, request: FastifyRequest, policy?: RoutePolicyManifestEntry): Promise<void>;
export declare function recordAuthorizationDenial(input: {
    db: Pool;
    request: FastifyRequest;
    error: DomainError;
    auditSecret: string;
}): Promise<void>;
