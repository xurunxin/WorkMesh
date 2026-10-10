import { type Server } from 'node:http';
import { type McpMode } from './index.js';
export type WorkMeshMcpHttpServer = Server & {
    workmeshRuntime: {
        accepting: boolean;
    };
};
export declare function createWorkMeshMcpHttpServer(options: {
    baseUrl: string;
    sessionToken?: string;
    accessToken?: string;
    coordination?: boolean;
    mode?: McpMode;
    browserOrigin?: string;
    readinessProbe?: () => Promise<void>;
}): Promise<WorkMeshMcpHttpServer>;
