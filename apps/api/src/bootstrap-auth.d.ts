import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from '@workmesh/config';
export type BootstrapAuthorization = Readonly<{
    credentialBinding: string;
    mode: 'token' | 'loopback';
}>;
declare module 'fastify' {
    interface FastifyInstance {
        auditBootstrapSuccess(request: FastifyRequest, mode: BootstrapAuthorization['mode']): void;
    }
    interface FastifyRequest {
        bootstrapAuthorization?: BootstrapAuthorization;
    }
}
export declare function verifyBootstrapRequest(request: FastifyRequest, config: Config): BootstrapAuthorization;
export declare function installBootstrapAuthentication(app: FastifyInstance, config: Config): void;
