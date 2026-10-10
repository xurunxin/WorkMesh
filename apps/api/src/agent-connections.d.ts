import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { type AgentConnectionCurrentIdentity } from '@workmesh/contracts';
import { DomainError } from '@workmesh/domain';
import type { RequestMeta } from './agent/types.js';
import type { Paginator } from './pagination.js';
export type CoordinationIdentityDiagnosticReason = 'pairing_code_not_credential' | 'credential_unknown' | 'credential_inactive' | 'connection_inactive' | 'agent_inactive' | 'agent_capability_inactive' | 'agent_actor_inactive' | 'principal_inactive' | 'team_inactive' | 'team_grant_inactive' | 'delegation_inactive' | 'delegation_binding_invalid';
export declare class CoordinationIdentityResolutionError extends DomainError {
    readonly diagnosticReason: CoordinationIdentityDiagnosticReason;
    readonly credentialAuditFingerprint: string;
    readonly recognizedCredentialFingerprintPrefix?: string | undefined;
    readonly diagnosticId: `${string}-${string}-${string}-${string}-${string}`;
    constructor(diagnosticReason: CoordinationIdentityDiagnosticReason, credentialAuditFingerprint: string, recognizedCredentialFingerprintPrefix?: string | undefined);
}
export declare const resolveAgentConnectionEndpointUrls: (input: {
    webOrigin: string;
    publicMcpOrigin: string;
}) => {
    connectUrl: (code: string) => string;
    mcpUrl: string;
    skillDownloadUrl: string;
    wellKnownUrl: string;
};
export declare function registerAgentConnectionRoutes(app: FastifyInstance, input: {
    db: Pool;
    webOrigin: string;
    publicMcpOrigin: string;
    meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta;
    header: (request: FastifyRequest, name: string) => string | undefined;
    paginator: Paginator;
}): void;
export declare function resolveCoordinationIdentity(db: Pool, installationToken: string, options: {
    auditSecret: string;
}): Promise<AgentConnectionCurrentIdentity>;
