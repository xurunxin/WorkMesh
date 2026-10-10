import type { FastifyRequest } from "fastify";
export declare function normalizeIp(address: string | undefined): string;
export declare function requestNetworkIdentity(request: FastifyRequest): {
    socketPeer: string;
    clientIp: string;
};
