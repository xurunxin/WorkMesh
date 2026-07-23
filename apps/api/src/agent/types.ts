export type ApiActor = {
  id: string;
  workspaceId: string;
  displayName: string;
  workspaceRole: "admin" | "member";
  csrfToken: string;
  kind: "human" | "agent";
  agentSessionId?: string;
};

export type RequestMeta = {
  actor: ApiActor;
  correlationId: string;
  idempotencyKey: string;
  operation: string;
  requestHash: string;
};
