import { type Db } from '@workmesh/db';
import type { AgentWebhookDelivery } from './agent-webhook.js';
/** Commit a bounded send authorization before HTTP; never hold SQL locks over I/O. */
export declare function authorizeSessionWebhook(db: Db, delivery: AgentWebhookDelivery, workerId: string): Promise<boolean>;
