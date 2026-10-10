import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WorkMeshClient } from '@workmesh/agent-sdk';
import { type AdapterDiscovery, type QualifiedAgentCapabilityManifest } from '@workmesh/contracts';
export type PreparedDiscovery = {
    manifest: QualifiedAgentCapabilityManifest;
    projection: AdapterDiscovery;
};
/** 使用公开request handler接线，保留SDK输入校验和兼容callback。 */
export declare function installDiscovery(server: McpServer, options: {
    client: WorkMeshClient;
    mode?: 'read-only' | 'read-write';
    coordination?: boolean;
    transport?: 'http' | 'stdio' | 'embedded';
}, errorResult: (error: unknown) => Promise<Record<string, unknown>>): {
    current: () => PreparedDiscovery;
    prepare: () => Promise<PreparedDiscovery>;
};
export declare function registerResourceReadTools(server: McpServer, client: WorkMeshClient): void;
