import { routePolicyManifest } from "@workmesh/contracts";

export type AuthRateLimitEndpointClass =
  "install" | "login" | "agent_token" | "handoff_target" | "pairing";
export type AuthRateLimitSubject = "none" | "email" | "session" | "handoff" | "pairing";

export type AuthRateLimitRoute = Readonly<{
  method: "GET" | "POST";
  path: string;
  operationId: string;
  endpointClass: AuthRateLimitEndpointClass;
  subject: AuthRateLimitSubject;
}>;

type RuntimeBinding = Readonly<{
  endpointClass: AuthRateLimitEndpointClass;
  subject: AuthRateLimitSubject;
}>;

const runtimeBindings: Readonly<Record<string, RuntimeBinding>> = Object.freeze({
  installWorkspace: { endpointClass: "install", subject: "none" },
  login: { endpointClass: "login", subject: "email" },
  exchangeAgentSessionToken: {
    endpointClass: "agent_token",
    subject: "session",
  },
  refreshAgentSessionToken: {
    endpointClass: "agent_token",
    subject: "session",
  },
  inspectExactTargetHandoff: {
    endpointClass: "handoff_target",
    subject: "handoff",
  },
  rejectHandoff: { endpointClass: "handoff_target", subject: "handoff" },
  redeemAgentConnection: { endpointClass: "pairing", subject: "pairing" },
  redeemAgentEnrollment: { endpointClass: "pairing", subject: "pairing" },
});

const declaredCredentialRoutes = routePolicyManifest.filter(
  (route) => route.credentialRateLimit === "shared_redis",
);

const fastifyPath = (path: string) =>
  path.replace(/\{([^}]+)\}/g, ":$1");

function classForPath(path: string): RuntimeBinding {
  if (path === "/api/v1/auth/install")
    return { endpointClass: "install", subject: "none" };
  if (path === "/api/v1/auth/login")
    return { endpointClass: "login", subject: "email" };
  if (/^\/api\/v1\/agent-sessions\/\{[^}]+\}\/token\/(?:exchange|refresh)$/.test(path))
    return { endpointClass: "agent_token", subject: "session" };
  if (/^\/api\/v1\/handoffs\/\{[^}]+\}\/(?:inspect|reject)$/.test(path))
    return { endpointClass: "handoff_target", subject: "handoff" };
  if (path === "/api/v1/agent-connections/redeem")
    return { endpointClass: "pairing", subject: "pairing" };
  if (path === "/api/v1/agent-enrollments/redeem")
    return { endpointClass: "pairing", subject: "pairing" };
  throw new Error(
    `Authentication rate-limit route has no endpoint-class rule: ${path}`,
  );
}

export const authRateLimitInventory: readonly AuthRateLimitRoute[] =
  Object.freeze(
    declaredCredentialRoutes.flatMap((route) => {
      const binding = runtimeBindings[route.operationId];
      if (!binding) return [];
      return [{
        method: route.method as "GET" | "POST",
        path: fastifyPath(route.path),
        operationId: route.operationId,
        ...binding,
      }];
    }),
  );

const key = (method: string, path: string) => `${method.toUpperCase()} ${path}`;
const byRoute = new Map(
  authRateLimitInventory.map((route) => [key(route.method, route.path), route]),
);

export function authRateLimitRoute(
  method: string,
  path: string,
): AuthRateLimitRoute | undefined {
  return byRoute.get(key(method, path));
}

export function assertAuthRateLimitInventory(): void {
  const declaredOperations = new Set(
    declaredCredentialRoutes.map((route) => route.operationId),
  );
  const missingBindings = [...declaredOperations].filter(
    (operationId) => !runtimeBindings[operationId],
  );
  const extraBindings = Object.keys(runtimeBindings).filter(
    (operationId) => !declaredOperations.has(operationId),
  );
  const actual = new Set(
    authRateLimitInventory.map(
      (route) =>
        `${route.method} ${route.path} ${route.operationId} ${route.endpointClass} ${route.subject}`,
    ),
  );
  const expected = new Set(
    declaredCredentialRoutes.map((route) => {
      const expectedBinding = classForPath(route.path);
      return `${route.method} ${fastifyPath(route.path)} ${route.operationId} ${expectedBinding.endpointClass} ${expectedBinding.subject}`;
    }),
  );
  const missing = [...expected].filter((entry) => !actual.has(entry));
  const extra = [...actual].filter((entry) => !expected.has(entry));
  if (
    missingBindings.length ||
    extraBindings.length ||
    missing.length ||
    extra.length
  ) {
    throw new Error(
      `Authentication rate-limit inventory mismatch; missingBindings=[${missingBindings.join(",")}], extraBindings=[${extraBindings.join(",")}], missing=[${missing.join(",")}], extra=[${extra.join(",")}]`,
    );
  }
}
