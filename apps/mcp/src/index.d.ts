import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WorkMeshClient } from '@workmesh/agent-sdk';
import { mcpPolicyBindings } from '@workmesh/contracts';
export type McpMode = 'read-only' | 'read-write';
export { mcpPolicyBindings };
export interface WorkMeshMcpOptions {
    client: WorkMeshClient;
    mode?: McpMode;
    coordination?: boolean;
    transport?: 'http' | 'stdio' | 'embedded';
}
export declare function createWorkMeshMcpServer(options: WorkMeshMcpOptions): McpServer;
