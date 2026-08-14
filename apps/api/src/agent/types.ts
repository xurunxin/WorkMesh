export type ApiActor = {
  id: string;
  workspaceId: string;
  displayName: string;
  workspaceRole: "admin" | "member";
  csrfToken: string;
  kind: "human" | "agent";
  agentSessionId?: string;
  humanSessionId?: string;
  authentication?: "human_session" | "agent_session" | "installation_target";
  credentialHash?: string;
};

export type RequestMeta = {
  actor: ApiActor;
  correlationId: string;
  idempotencyKey: string;
  operation: string;
  requestHash: string;
  clientContext?: Record<string, string | null>;
};
