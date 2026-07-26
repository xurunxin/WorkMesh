import { createHash, createHmac, createSign, timingSafeEqual } from "node:crypto";

export type ProviderKind = "fake" | "github" | "gitea";
export type ProviderCheckConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "neutral"
  | "timed_out"
  | "action_required"
  | null;

export type RepositoryIdentity = {
  provider: ProviderKind;
  connectionId: string;
  repositoryId: string;
  repositoryFullName?: string;
};

export type BranchRequest = RepositoryIdentity & {
  name: string;
  baseSha: string;
};
export type CommitRequest = RepositoryIdentity & {
  idempotencyKey: string;
  branch: string;
  expectedHeadSha: string;
  message: string;
  files: Array<{ path: string; content: string }>;
};
export type PullRequestRequest = RepositoryIdentity & {
  idempotencyKey: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
  draft: boolean;
};
export type MergeRequest = RepositoryIdentity & {
  pullRequestId: string;
  expectedHeadSha: string;
  method: "merge" | "squash" | "rebase";
};
export type RepositoryGuidanceRequest = RepositoryIdentity & {
  commitSha: string;
  scopedPaths: string[];
};
export type RepositoryGuidanceEntry = {
  path: string;
  blobSha: string;
  contentHash: string;
  content: string;
};
export type RetryCheckRequest = RepositoryIdentity & {
  checkRunId: string;
};

export type ProviderBranch = { name: string; headSha: string };
export type ProviderCommit = { id: string; sha: string; branch: string; uri: string };
export type ProviderPullRequest = {
  id: string;
  number: number;
  uri: string;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  headSha: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  mergeSha?: string;
};

export interface GitProvider {
  createBranch(input: BranchRequest): Promise<ProviderBranch>;
  createCommit(input: CommitRequest): Promise<ProviderCommit>;
  openPullRequest(input: PullRequestRequest): Promise<ProviderPullRequest>;
  getPullRequest(input: RepositoryIdentity & { pullRequestId: string }): Promise<ProviderPullRequest>;
  mergePullRequest(input: MergeRequest): Promise<{ merged: true; mergeSha: string }>;
  resolveRepositoryGuidance(input: RepositoryGuidanceRequest): Promise<RepositoryGuidanceEntry[]>;
  retryCheck(input: RetryCheckRequest): Promise<{ requested: true; checkRunId: string }>;
}

type Fetch = typeof globalThis.fetch;
type GitHubAppProviderOptions = {
  appId: string;
  privateKey: string;
  installationId: string;
  apiBaseUrl?: string;
  fetch?: Fetch;
};

const base64Url = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64url");

/**
 * GitHub App installation adapter. App JWTs and installation tokens exist only
 * in memory; callers persist the private key encrypted and construct this
 * adapter after the worker has decrypted it.
 */
export class GitHubAppProvider implements GitProvider {
  readonly #appId: string;
  readonly #privateKey: string;
  readonly #installationId: string;
  readonly #apiBaseUrl: string;
  readonly #fetch: Fetch;
  #installationToken?: { value: string; expiresAt: number };

  constructor(options: GitHubAppProviderOptions) {
    this.#appId = options.appId;
    this.#privateKey = options.privateKey;
    this.#installationId = options.installationId;
    this.#apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  #appJwt(): string {
    const now = Math.floor(Date.now() / 1_000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(JSON.stringify({ iat: now - 30, exp: now + 540, iss: this.#appId }));
    const unsigned = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    return `${unsigned}.${signer.sign(this.#privateKey).toString("base64url")}`;
  }

  async #token(): Promise<string> {
    if (this.#installationToken && this.#installationToken.expiresAt > Date.now() + 60_000)
      return this.#installationToken.value;
    const response = await this.#fetch(
      `${this.#apiBaseUrl}/app/installations/${encodeURIComponent(this.#installationId)}/access_tokens`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${this.#appJwt()}`,
          "x-github-api-version": "2022-11-28",
        },
      },
    );
    if (!response.ok) throw new Error(`GITHUB_INSTALLATION_AUTH_FAILED:${response.status}`);
    const body = await response.json() as { token?: unknown; expires_at?: unknown };
    if (typeof body.token !== "string" || typeof body.expires_at !== "string")
      throw new Error("GITHUB_INSTALLATION_AUTH_INVALID_RESPONSE");
    this.#installationToken = { value: body.token, expiresAt: new Date(body.expires_at).getTime() };
    return body.token;
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.#fetch(`${this.#apiBaseUrl}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${await this.#token()}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`GITHUB_API_ERROR:${method}:${path}:${response.status}`);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return text.length === 0 ? undefined as T : JSON.parse(text) as T;
  }

  #repo(input: RepositoryIdentity): string {
    if (!input.repositoryFullName || !/^[^/]+\/[^/]+$/.test(input.repositoryFullName))
      throw new Error("GITHUB_REPOSITORY_FULL_NAME_REQUIRED");
    return input.repositoryFullName.split("/").map(encodeURIComponent).join("/");
  }

  async createBranch(input: BranchRequest): Promise<ProviderBranch> {
    const repo = this.#repo(input);
    await this.#request("GET", `/repos/${repo}/git/commits/${encodeURIComponent(input.baseSha)}`);
    try {
      await this.#request("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${input.name}`, sha: input.baseSha });
    } catch (error) {
      const existing = await this.#request<{ object: { sha: string } }>(
        "GET", `/repos/${repo}/git/ref/heads/${input.name.split("/").map(encodeURIComponent).join("/")}`,
      );
      if (existing.object.sha !== input.baseSha) throw error;
    }
    return { name: input.name, headSha: input.baseSha };
  }

  async createCommit(input: CommitRequest): Promise<ProviderCommit> {
    const repo = this.#repo(input);
    const branchPath = input.branch.split("/").map(encodeURIComponent).join("/");
    const reference = await this.#request<{ object: { sha: string } }>("GET", `/repos/${repo}/git/ref/heads/${branchPath}`);
    const marker = `WorkMesh-Intent: ${input.idempotencyKey}`;
    if (reference.object.sha !== input.expectedHeadSha) {
      const current = await this.#request<{ sha: string; message: string; html_url?: string }>(
        "GET", `/repos/${repo}/git/commits/${encodeURIComponent(reference.object.sha)}`,
      );
      if (!current.message.includes(marker)) throw new Error("PROVIDER_HEAD_SHA_MISMATCH");
      return {
        id: current.sha, sha: current.sha, branch: input.branch,
        uri: current.html_url ?? `https://github.com/${input.repositoryFullName}/commit/${current.sha}`,
      };
    }
    const parent = await this.#request<{ tree: { sha: string } }>("GET", `/repos/${repo}/git/commits/${encodeURIComponent(reference.object.sha)}`);
    const tree = await this.#request<{ sha: string }>("POST", `/repos/${repo}/git/trees`, {
      base_tree: parent.tree.sha,
      tree: input.files.map(file => ({ path: file.path, mode: "100644", type: "blob", content: file.content })),
    });
    // Git commit objects are content-addressed only when author/committer
    // metadata is stable. Deriving the timestamp from the durable intent makes
    // a retry after commit-object creation converge to the same SHA even when
    // the branch ref was not updated before a worker crash.
    const deterministicSeconds =
      Number.parseInt(digest(input.idempotencyKey).slice(0, 8), 16) % 315_532_800;
    const deterministicDate = new Date(Date.UTC(2020, 0, 1) + deterministicSeconds * 1_000).toISOString();
    const identity = {
      name: "WorkMesh",
      email: "workmesh@users.noreply.github.com",
      date: deterministicDate,
    };
    const commit = await this.#request<{ sha: string; html_url?: string }>("POST", `/repos/${repo}/git/commits`, {
      message: `${input.message}\n\n${marker}`,
      tree: tree.sha,
      parents: [reference.object.sha],
      author: identity,
      committer: identity,
    });
    try {
      await this.#request("PATCH", `/repos/${repo}/git/refs/heads/${branchPath}`, { sha: commit.sha, force: false });
    } catch (error) {
      const after = await this.#request<{ object: { sha: string } }>(
        "GET", `/repos/${repo}/git/ref/heads/${branchPath}`,
      );
      if (after.object.sha !== commit.sha) throw error;
    }
    return {
      id: commit.sha, sha: commit.sha, branch: input.branch,
      uri: commit.html_url ?? `https://github.com/${input.repositoryFullName}/commit/${commit.sha}`,
    };
  }

  async openPullRequest(input: PullRequestRequest): Promise<ProviderPullRequest> {
    const repo = this.#repo(input);
    const owner = input.repositoryFullName!.split("/")[0]!;
    const marker = `<!-- workmesh-intent:${input.idempotencyKey} -->`;
    const query = new URLSearchParams({
      state: "open",
      head: `${owner}:${input.headBranch}`,
      base: input.baseBranch,
      per_page: "100",
    });
    const existing = await this.#request<Array<Record<string, unknown>>>("GET", `/repos/${repo}/pulls?${query}`);
    const replay = existing.find(value => typeof value.body === "string" && value.body.includes(marker));
    if (replay) return this.#pullRequest(replay);
    const pr = await this.#request<Record<string, unknown>>("POST", `/repos/${repo}/pulls`, {
      title: input.title, body: `${input.body}\n\n${marker}`, base: input.baseBranch, head: input.headBranch, draft: input.draft,
    });
    return this.#pullRequest(pr);
  }

  async getPullRequest(input: RepositoryIdentity & { pullRequestId: string }): Promise<ProviderPullRequest> {
    const pr = await this.#request<Record<string, unknown>>(
      "GET", `/repos/${this.#repo(input)}/pulls/${encodeURIComponent(input.pullRequestId)}`,
    );
    return this.#pullRequest(pr);
  }

  async mergePullRequest(input: MergeRequest): Promise<{ merged: true; mergeSha: string }> {
    const current = await this.getPullRequest(input);
    if (current.headSha !== input.expectedHeadSha) throw new Error("PROVIDER_HEAD_SHA_MISMATCH");
    if (current.state === "merged") {
      if (!current.mergeSha) throw new Error("PROVIDER_MERGE_SHA_MISSING");
      return { merged: true, mergeSha: current.mergeSha };
    }
    if (current.state !== "open") throw new Error("PROVIDER_PULL_REQUEST_NOT_OPEN");
    const result = await this.#request<{ merged: boolean; sha: string }>(
      "PUT", `/repos/${this.#repo(input)}/pulls/${encodeURIComponent(input.pullRequestId)}/merge`,
      { sha: input.expectedHeadSha, merge_method: input.method },
    );
    if (!result.merged) throw new Error("PROVIDER_PULL_REQUEST_NOT_MERGED");
    return { merged: true, mergeSha: result.sha };
  }

  async resolveRepositoryGuidance(input: RepositoryGuidanceRequest): Promise<RepositoryGuidanceEntry[]> {
    const repo = this.#repo(input);
    const commit = await this.#request<{ tree: { sha: string } }>(
      "GET", `/repos/${repo}/git/commits/${encodeURIComponent(input.commitSha)}`,
    );
    const tree = await this.#request<{
      truncated?: boolean;
      tree?: Array<{ path?: unknown; type?: unknown; sha?: unknown }>;
    }>("GET", `/repos/${repo}/git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`);
    if (tree.truncated) throw new Error("PROVIDER_REPOSITORY_TREE_TRUNCATED");
    const candidates = new Set(guidanceCandidatePaths(input.scopedPaths));
    const blobs = (tree.tree ?? [])
      .filter(entry => entry.type === "blob" && typeof entry.path === "string"
        && typeof entry.sha === "string" && candidates.has(entry.path))
      .sort((left, right) => guidanceOrdinal(String(left.path)) - guidanceOrdinal(String(right.path))
        || String(left.path).localeCompare(String(right.path)));
    const resolved: RepositoryGuidanceEntry[] = [];
    for (const entry of blobs) {
      const blob = await this.#request<{ content?: unknown; encoding?: unknown }>(
        "GET", `/repos/${repo}/git/blobs/${encodeURIComponent(String(entry.sha))}`,
      );
      if (blob.encoding !== "base64" || typeof blob.content !== "string")
        throw new Error("PROVIDER_GUIDANCE_BLOB_INVALID");
      const content = Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString("utf8");
      resolved.push({
        path: String(entry.path),
        blobSha: String(entry.sha),
        contentHash: `sha256:${createHash("sha256").update(content).digest("hex")}`,
        content,
      });
    }
    return resolved;
  }

  async retryCheck(input: RetryCheckRequest): Promise<{ requested: true; checkRunId: string }> {
    await this.#request(
      "POST",
      `/repos/${this.#repo(input)}/check-runs/${encodeURIComponent(input.checkRunId)}/rerequest`,
    );
    return { requested: true, checkRunId: input.checkRunId };
  }

  #pullRequest(value: Record<string, unknown>): ProviderPullRequest {
    const base = object(value.base);
    const head = object(value.head);
    return {
      id: String(value.number ?? value.id ?? ""),
      number: integer(value.number),
      uri: text(value.html_url),
      baseBranch: text(base.ref),
      headBranch: text(head.ref),
      baseSha: text(base.sha),
      headSha: text(head.sha),
      state: value.merged === true ? "merged" : text(value.state) as "open" | "closed",
      draft: value.draft === true,
      mergeSha: typeof value.merge_commit_sha === "string" ? value.merge_commit_sha : undefined,
    };
  }
}

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/**
 * Deterministic provider used by integration and E2E tests. It implements the
 * same opaque-ID interface as hosted providers and enforces expected-head
 * checks, so tests cannot accidentally rely on a permissive mock path.
 */
export class FakeGitProvider implements GitProvider {
  readonly branches = new Map<string, ProviderBranch>();
  readonly commits = new Map<string, ProviderCommit>();
  readonly pullRequests = new Map<string, ProviderPullRequest>();
  readonly commitIntents = new Map<string, ProviderCommit>();
  readonly pullRequestIntents = new Map<string, ProviderPullRequest>();
  readonly repositoryFiles = new Map<string, Map<string, { blobSha: string; content: string }>>();
  readonly retriedChecks: string[] = [];
  private sequence = 0;

  private scope(input: Pick<RepositoryIdentity, "connectionId" | "repositoryId">): string {
    return `${input.connectionId}:${input.repositoryId}`;
  }

  seedRepository(connectionId: string, repositoryId: string, defaultBranch = "main", headSha = digest("initial")): void {
    this.branches.set(`${connectionId}:${repositoryId}:${defaultBranch}`, { name: defaultBranch, headSha });
  }

  seedRepositoryFiles(
    connectionId: string,
    repositoryId: string,
    commitSha: string,
    files: Record<string, string>,
  ): void {
    this.repositoryFiles.set(`${connectionId}:${repositoryId}:${commitSha}`, new Map(
      Object.entries(files).map(([path, content]) => [path, { blobSha: digest(content), content }]),
    ));
  }

  async createBranch(input: BranchRequest): Promise<ProviderBranch> {
    const scope = this.scope(input);
    const base = [...this.branches.entries()].find(
      ([key, value]) => key.startsWith(`${scope}:`) && value.headSha === input.baseSha,
    );
    if (!base) throw new Error("PROVIDER_BASE_SHA_MISMATCH");
    const key = `${scope}:${input.name}`;
    const existing = this.branches.get(key);
    if (existing) {
      if (existing.headSha !== input.baseSha) throw new Error("PROVIDER_HEAD_SHA_MISMATCH");
      return existing;
    }
    const branch = { name: input.name, headSha: input.baseSha };
    this.branches.set(key, branch);
    return branch;
  }

  async createCommit(input: CommitRequest): Promise<ProviderCommit> {
    const scope = this.scope(input);
    const intentKey = `${scope}:${input.idempotencyKey}`;
    const replay = this.commitIntents.get(intentKey);
    if (replay) return replay;
    const key = `${scope}:${input.branch}`;
    const branch = this.branches.get(key);
    if (!branch) throw new Error("PROVIDER_BRANCH_NOT_FOUND");
    if (branch.headSha !== input.expectedHeadSha) throw new Error("PROVIDER_HEAD_SHA_MISMATCH");
    const sha = digest(JSON.stringify({
      parent: branch.headSha,
      message: input.message,
      files: [...input.files].sort((a, b) => a.path.localeCompare(b.path)),
    }));
    const commit = {
      id: `fake-commit-${++this.sequence}`,
      sha,
      branch: input.branch,
      uri: `fake://connections/${input.connectionId}/repositories/${input.repositoryId}/commits/${sha}`,
    };
    this.commits.set(`${scope}:${commit.id}`, commit);
    this.commitIntents.set(intentKey, commit);
    this.branches.set(key, { ...branch, headSha: sha });
    return commit;
  }

  async openPullRequest(input: PullRequestRequest): Promise<ProviderPullRequest> {
    const scope = this.scope(input);
    const intentKey = `${scope}:${input.idempotencyKey}`;
    const replay = this.pullRequestIntents.get(intentKey);
    if (replay) return replay;
    const base = this.branches.get(`${scope}:${input.baseBranch}`);
    const head = this.branches.get(`${scope}:${input.headBranch}`);
    if (!base || !head) throw new Error("PROVIDER_BRANCH_NOT_FOUND");
    const existing = [...this.pullRequests.entries()].find(
      ([key, pr]) => key.startsWith(`${scope}:`) && pr.headBranch === input.headBranch
        && pr.baseBranch === input.baseBranch && pr.state === "open",
    );
    if (existing) return existing[1];
    const number = ++this.sequence;
    const pullRequest: ProviderPullRequest = {
      id: `fake-pr-${number}`,
      number,
      uri: `fake://connections/${input.connectionId}/repositories/${input.repositoryId}/pulls/${number}`,
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
      baseSha: base.headSha,
      headSha: head.headSha,
      state: "open",
      draft: input.draft,
    };
    this.pullRequests.set(`${scope}:${pullRequest.id}`, pullRequest);
    this.pullRequestIntents.set(intentKey, pullRequest);
    return pullRequest;
  }

  async getPullRequest(input: RepositoryIdentity & { pullRequestId: string }): Promise<ProviderPullRequest> {
    const scope = this.scope(input);
    const pullRequest = this.pullRequests.get(`${scope}:${input.pullRequestId}`);
    if (!pullRequest) throw new Error("PROVIDER_PULL_REQUEST_NOT_FOUND");
    const head = this.branches.get(`${scope}:${pullRequest.headBranch}`);
    return head ? { ...pullRequest, headSha: head.headSha } : pullRequest;
  }

  async mergePullRequest(input: MergeRequest): Promise<{ merged: true; mergeSha: string }> {
    const current = await this.getPullRequest(input);
    if (current.headSha !== input.expectedHeadSha) throw new Error("PROVIDER_HEAD_SHA_MISMATCH");
    if (current.state === "merged") {
      if (!current.mergeSha) throw new Error("PROVIDER_MERGE_SHA_MISSING");
      return { merged: true, mergeSha: current.mergeSha };
    }
    if (current.state !== "open") throw new Error("PROVIDER_PULL_REQUEST_NOT_OPEN");
    const mergeSha = digest(`${current.baseSha}:${current.headSha}:${input.method}`);
    const scope = this.scope(input);
    this.pullRequests.set(`${scope}:${current.id}`, { ...current, state: "merged", mergeSha });
    this.branches.set(`${scope}:${current.baseBranch}`, {
      name: current.baseBranch,
      headSha: mergeSha,
    });
    return { merged: true, mergeSha };
  }

  async resolveRepositoryGuidance(input: RepositoryGuidanceRequest): Promise<RepositoryGuidanceEntry[]> {
    const files = this.repositoryFiles.get(`${input.connectionId}:${input.repositoryId}:${input.commitSha}`);
    if (!files) throw new Error("PROVIDER_COMMIT_NOT_FOUND");
    const candidates = new Set(guidanceCandidatePaths(input.scopedPaths));
    return [...files.entries()]
      .filter(([path]) => candidates.has(path))
      .sort(([left], [right]) => guidanceOrdinal(left) - guidanceOrdinal(right) || left.localeCompare(right))
      .map(([path, file]) => ({
        path,
        blobSha: file.blobSha,
        contentHash: `sha256:${digest(file.content)}`,
        content: file.content,
      }));
  }

  async retryCheck(input: RetryCheckRequest): Promise<{ requested: true; checkRunId: string }> {
    const key = `${this.scope(input)}:${input.checkRunId}`;
    this.retriedChecks.push(key);
    return { requested: true, checkRunId: input.checkRunId };
  }
}

const normalizeRepositoryPath = (value: string): string =>
  value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/\*\*?$|\/[^/]*\*[^/]*$/g, "");

const guidanceOrdinal = (path: string): number =>
  path === "AGENTS.md" ? 0 : path.split("/").length;

export function guidanceCandidatePaths(scopedPaths: readonly string[]): string[] {
  const paths = new Set<string>(["AGENTS.md"]);
  for (const scopedPath of scopedPaths) {
    const normalized = normalizeRepositoryPath(scopedPath);
    const segments = normalized.split("/").filter(Boolean);
    const leafSegments = scopedPath.endsWith("/") || scopedPath.includes("*")
      ? segments
      : segments.slice(0, -1);
    for (let index = 1; index <= leafSegments.length; index += 1)
      paths.add(`${leafSegments.slice(0, index).join("/")}/AGENTS.md`);
  }
  return [...paths].sort((left, right) =>
    guidanceOrdinal(left) - guidanceOrdinal(right) || left.localeCompare(right));
}

export function verifyGitHubWebhookSignature(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string,
): boolean {
  if (!/^sha256=[a-f0-9]{64}$/.test(signatureHeader)) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
    "ascii",
  );
  const received = Buffer.from(signatureHeader, "ascii");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type NormalizedProviderEvent =
  | { kind: "pull_request"; action: string; externalId: string; number: number; baseBranch: string; headBranch: string; baseSha: string; headSha: string; state: string; draft: boolean; uri: string; observedAt: string; observationRank: number }
  | { kind: "push"; branch: string; beforeSha: string; afterSha: string }
  | { kind: "check"; externalId: string; pullRequestNumber?: number; name: string; status: string; conclusion: ProviderCheckConclusion; headSha: string; uri?: string; observedAt: string; observationRank: number }
  | { kind: "review"; externalId: string; pullRequestNumber: number; state: string; headSha: string; authorExternalId: string; authorLogin?: string; uri?: string; observedAt: string; observationRank: number };

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject =>
  value && typeof value === "object" ? value as JsonObject : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const integer = (value: unknown): number => typeof value === "number" ? value : Number(value);
const observedAt = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const milliseconds = Date.parse(value);
    if (Number.isFinite(milliseconds)) return new Date(milliseconds).toISOString();
  }
  // Provider projections may be created by an action before a webhook arrives.
  // Epoch is deterministic and never lets receipt order masquerade as provider order.
  return new Date(0).toISOString();
};

export function normalizeGitHubWebhook(eventName: string, payload: unknown): NormalizedProviderEvent | null {
  const body = object(payload);
  if (eventName === "pull_request") {
    const pr = object(body.pull_request);
    const base = object(pr.base);
    const head = object(pr.head);
    return {
      kind: "pull_request",
      action: text(body.action),
      externalId: String(body.number ?? ""),
      number: integer(body.number),
      baseBranch: text(base.ref),
      headBranch: text(head.ref),
      baseSha: text(base.sha),
      headSha: text(head.sha),
      state: pr.merged === true ? "merged" : text(pr.state),
      draft: pr.draft === true,
      uri: text(pr.html_url),
      observedAt: observedAt(pr.updated_at),
      observationRank: text(body.action) === "closed" ? 3 : text(body.action) === "reopened" ? 2 : 1,
    };
  }
  if (eventName === "push") {
    return {
      kind: "push",
      branch: text(body.ref).replace(/^refs\/heads\//, ""),
      beforeSha: text(body.before),
      afterSha: text(body.after),
    };
  }
  if (eventName === "check_run") {
    const check = object(body.check_run);
    const suite = object(check.check_suite);
    const pullRequests = Array.isArray(check.pull_requests)
      ? check.pull_requests
      : Array.isArray(body.pull_requests)
        ? body.pull_requests
        : [];
    const pullRequest = object(pullRequests[0]);
    const pullRequestNumber = integer(pullRequest.number);
    return {
      kind: "check",
      externalId: String(check.id ?? ""),
      pullRequestNumber: Number.isInteger(pullRequestNumber) && pullRequestNumber > 0
        ? pullRequestNumber
        : undefined,
      name: text(check.name),
      status: text(check.status),
      conclusion: (check.conclusion ?? null) as ProviderCheckConclusion,
      headSha: text(check.head_sha) || text(suite.head_sha),
      uri: text(check.html_url) || undefined,
      observedAt: observedAt(check.updated_at, check.completed_at, check.started_at),
      observationRank: text(check.status) === "completed" ? 3 : text(check.status) === "in_progress" ? 2 : 1,
    };
  }
  if (eventName === "pull_request_review") {
    const review = object(body.review);
    const pr = object(body.pull_request);
    const head = object(pr.head);
    const author = object(review.user);
    return {
      kind: "review",
      externalId: String(review.id ?? ""),
      pullRequestNumber: integer(pr.number),
      state: text(review.state),
      headSha: text(review.commit_id) || text(head.sha),
      authorExternalId: String(author.id ?? author.login ?? ""),
      authorLogin: text(author.login) || undefined,
      uri: text(review.html_url) || undefined,
      observedAt: observedAt(review.updated_at, review.submitted_at),
      observationRank: text(body.action) === "dismissed" || text(review.state) === "dismissed" ? 2 : 1,
    };
  }
  return null;
}

export type GitProviderCapability =
  | "create_branch"
  | "create_commit"
  | "multi_file_commit"
  | "open_pull_request"
  | "read_pull_request"
  | "merge_pull_request"
  | "repository_guidance"
  | "retry_check";

export class UnsupportedProviderCapability extends Error {
  readonly code = "PROVIDER_CAPABILITY_UNSUPPORTED";
  constructor(
    readonly provider: ProviderKind,
    readonly capability: GitProviderCapability,
  ) {
    super(`${provider} does not support ${capability}`);
  }
}

export const giteaCapabilityMatrix: Readonly<Record<GitProviderCapability, boolean>> = {
  create_branch: true,
  create_commit: true,
  multi_file_commit: false,
  open_pull_request: true,
  read_pull_request: true,
  merge_pull_request: true,
  repository_guidance: true,
  retry_check: false,
};

type GiteaProviderOptions = {
  baseUrl: string;
  accessToken: string;
  fetch?: Fetch;
};

/**
 * Gitea is an adapter behind the existing GitProvider port. Domain commands,
 * approvals, repository contexts, claims, and projections remain provider
 * independent.
 */
export class GiteaProvider implements GitProvider {
  readonly #baseUrl: string;
  readonly #accessToken: string;
  readonly #fetch: Fetch;

  constructor(options: GiteaProviderOptions) {
    const base = new URL(options.baseUrl);
    if (base.protocol !== "https:" || base.username || base.password)
      throw new Error("GITEA_BASE_URL_INVALID");
    this.#baseUrl = base.toString().replace(/\/$/, "");
    this.#accessToken = options.accessToken;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  #repo(input: RepositoryIdentity): string {
    if (!input.repositoryFullName || !/^[^/]+\/[^/]+$/.test(input.repositoryFullName))
      throw new Error("GITEA_REPOSITORY_FULL_NAME_REQUIRED");
    return input.repositoryFullName.split("/").map(encodeURIComponent).join("/");
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}/api/v1${path}`, {
      method,
      headers: {
        accept: "application/json",
        authorization: `token ${this.#accessToken}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`GITEA_API_ERROR:${method}:${path}:${response.status}`);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return text.length === 0 ? undefined as T : JSON.parse(text) as T;
  }

  async createBranch(input: BranchRequest): Promise<ProviderBranch> {
    const branch = await this.#request<{ name: string; commit: { id: string } }>(
      "POST",
      `/repos/${this.#repo(input)}/branches`,
      { new_branch_name: input.name, old_ref_name: input.baseSha },
    );
    return { name: branch.name, headSha: branch.commit.id };
  }

  async createCommit(input: CommitRequest): Promise<ProviderCommit> {
    if (input.files.length !== 1)
      throw new UnsupportedProviderCapability("gitea", "multi_file_commit");
    const file = input.files[0]!;
    const repo = this.#repo(input);
    let sha: string | undefined;
    try {
      const existing = await this.#request<{ sha?: string }>(
        "GET",
        `/repos/${repo}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(input.branch)}`,
      );
      sha = existing.sha;
    } catch (error) {
      if (!String(error).endsWith(":404")) throw error;
    }
    const response = await this.#request<{
      commit: { sha: string; html_url?: string };
      content?: { html_url?: string };
    }>(
      sha ? "PUT" : "POST",
      `/repos/${repo}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}`,
      {
        branch: input.branch,
        message: input.message,
        content: Buffer.from(file.content).toString("base64"),
        sha,
        author: undefined,
      },
    );
    return {
      id: response.commit.sha,
      sha: response.commit.sha,
      branch: input.branch,
      uri: response.commit.html_url ?? response.content?.html_url ?? `${this.#baseUrl}/${input.repositoryFullName}/commit/${response.commit.sha}`,
    };
  }

  async openPullRequest(input: PullRequestRequest): Promise<ProviderPullRequest> {
    const pull = await this.#request<{
      id: number;
      number: number;
      html_url: string;
      base: { ref: string; sha: string };
      head: { ref: string; sha: string };
      state: string;
      merged: boolean;
      merge_commit_sha?: string;
    }>(
      "POST",
      `/repos/${this.#repo(input)}/pulls`,
      {
        base: input.baseBranch,
        head: input.headBranch,
        title: input.title,
        body: input.body,
        draft: input.draft,
      },
    );
    return this.#pull(pull);
  }

  async getPullRequest(input: RepositoryIdentity & { pullRequestId: string }): Promise<ProviderPullRequest> {
    const pull = await this.#request<{
      id: number;
      number: number;
      html_url: string;
      base: { ref: string; sha: string };
      head: { ref: string; sha: string };
      state: string;
      merged: boolean;
      merge_commit_sha?: string;
    }>("GET", `/repos/${this.#repo(input)}/pulls/${encodeURIComponent(input.pullRequestId)}`);
    return this.#pull(pull);
  }

  #pull(pull: {
    id: number;
    number: number;
    html_url: string;
    base: { ref: string; sha: string };
    head: { ref: string; sha: string };
    state: string;
    merged: boolean;
    merge_commit_sha?: string;
  }): ProviderPullRequest {
    return {
      id: String(pull.number ?? pull.id),
      number: pull.number,
      uri: pull.html_url,
      baseBranch: pull.base.ref,
      headBranch: pull.head.ref,
      baseSha: pull.base.sha,
      headSha: pull.head.sha,
      state: pull.merged ? "merged" : pull.state === "closed" ? "closed" : "open",
      draft: false,
      mergeSha: pull.merge_commit_sha,
    };
  }

  async mergePullRequest(input: MergeRequest): Promise<{ merged: true; mergeSha: string }> {
    const current = await this.getPullRequest(input);
    if (current.headSha !== input.expectedHeadSha) throw new Error("GITEA_PULL_REQUEST_HEAD_CHANGED");
    await this.#request(
      "POST",
      `/repos/${this.#repo(input)}/pulls/${encodeURIComponent(input.pullRequestId)}/merge`,
      {
        Do: input.method === "squash" ? "squash" : input.method === "rebase" ? "rebase" : "merge",
        merge_when_checks_succeed: false,
      },
    );
    const merged = await this.getPullRequest(input);
    if (merged.state !== "merged" || !merged.mergeSha) throw new Error("GITEA_MERGE_NOT_CONFIRMED");
    return { merged: true, mergeSha: merged.mergeSha };
  }

  async resolveRepositoryGuidance(input: RepositoryGuidanceRequest): Promise<RepositoryGuidanceEntry[]> {
    const repo = this.#repo(input);
    const entries: RepositoryGuidanceEntry[] = [];
    for (const path of guidanceCandidatePaths(input.scopedPaths)) {
      try {
        const file = await this.#request<{ sha: string; content: string; encoding: string }>(
          "GET",
          `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(input.commitSha)}`,
        );
        if (file.encoding !== "base64") throw new Error("GITEA_GUIDANCE_ENCODING_UNSUPPORTED");
        const content = Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
        entries.push({
          path,
          blobSha: file.sha,
          contentHash: `sha256:${createHash("sha256").update(content).digest("hex")}`,
          content,
        });
      } catch (error) {
        if (!String(error).endsWith(":404")) throw error;
      }
    }
    return entries;
  }

  async retryCheck(_input: RetryCheckRequest): Promise<{ requested: true; checkRunId: string }> {
    throw new UnsupportedProviderCapability("gitea", "retry_check");
  }
}
