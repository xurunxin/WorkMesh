import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  FakeGitProvider,
  GitHubAppProvider,
  normalizeGitHubWebhook,
  verifyGitHubWebhookSignature,
} from "./index.js";

let githubTestPrivateKey: string;

beforeAll(() => {
  githubTestPrivateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
    .export({ type: "pkcs8", format: "pem" }).toString();
}, 15_000);

describe("provider-neutral git boundary", () => {
  it("runs branch, commit, PR and exact-head merge through the fake provider", async () => {
    const provider = new FakeGitProvider();
    provider.seedRepository("c", "repo", "main", "base");
    await provider.createBranch({ provider: "fake", connectionId: "c", repositoryId: "repo", name: "wm/42", baseSha: "base" });
    const commitRequest = { provider: "fake" as const, connectionId: "c", repositoryId: "repo", idempotencyKey: "commit-intent", branch: "wm/42", expectedHeadSha: "base", message: "change", files: [{ path: "a.ts", content: "ok" }] };
    const commit = await provider.createCommit(commitRequest);
    await expect(provider.createCommit(commitRequest)).resolves.toEqual(commit);
    const prRequest = { provider: "fake" as const, connectionId: "c", repositoryId: "repo", idempotencyKey: "pr-intent", baseBranch: "main", headBranch: "wm/42", title: "Change", body: "Evidence", draft: false };
    const pr = await provider.openPullRequest(prRequest);
    await expect(provider.openPullRequest(prRequest)).resolves.toEqual(pr);
    await expect(provider.mergePullRequest({ provider: "fake", connectionId: "c", repositoryId: "repo", pullRequestId: pr.id, expectedHeadSha: "base", method: "squash" })).rejects.toThrow("PROVIDER_HEAD_SHA_MISMATCH");
    const mergeRequest = { provider: "fake" as const, connectionId: "c", repositoryId: "repo", pullRequestId: pr.id, expectedHeadSha: commit.sha, method: "squash" as const };
    const merged = await provider.mergePullRequest(mergeRequest);
    await expect(provider.mergePullRequest(mergeRequest)).resolves.toEqual(merged);
  });

  it("discovers pinned AGENTS guidance root-to-leaf and retries CI through the fake provider", async () => {
    const provider = new FakeGitProvider();
    provider.seedRepository("c", "repo", "main", "base");
    provider.seedRepositoryFiles("c", "repo", "base", {
      "AGENTS.md": "root guidance",
      "apps/AGENTS.md": "apps guidance",
      "apps/api/AGENTS.md": "api guidance",
      "apps/web/AGENTS.md": "unrelated guidance",
    });
    const guidance = await provider.resolveRepositoryGuidance({
      provider: "fake",
      connectionId: "c",
      repositoryId: "repo",
      commitSha: "base",
      scopedPaths: ["apps/api/src/**"],
    });
    expect(guidance.map(entry => entry.path)).toEqual([
      "AGENTS.md",
      "apps/AGENTS.md",
      "apps/api/AGENTS.md",
    ]);
    expect(guidance.every(entry => entry.contentHash.startsWith("sha256:"))).toBe(true);
    await expect(provider.retryCheck({
      provider: "fake",
      connectionId: "c",
      repositoryId: "repo",
      checkRunId: "check-42",
    })).resolves.toEqual({ requested: true, checkRunId: "check-42" });
    expect(provider.retriedChecks).toEqual(["c:repo:check-42"]);
  });

  it("verifies the exact raw GitHub body in constant-time-compatible form", () => {
    const body = Buffer.from('{"action":"opened"}');
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyGitHubWebhookSignature("secret", body, signature)).toBe(true);
    expect(verifyGitHubWebhookSignature("secret", Buffer.from("{}"), signature)).toBe(false);
  });

  it("normalizes a GitHub pull request without exposing provider credentials", () => {
    expect(normalizeGitHubWebhook("pull_request", {
      action: "opened",
      number: 7,
      pull_request: { id: 99, state: "open", draft: false, html_url: "https://example/pr/7", base: { ref: "main", sha: "b" }, head: { ref: "wm/7", sha: "h" } },
    })).toEqual(expect.objectContaining({ kind: "pull_request", number: 7, headSha: "h" }));
  });

  it("binds provider reviews to the provider author and reviewed head", () => {
    expect(normalizeGitHubWebhook("pull_request_review", {
      pull_request: { number: 7, head: { sha: "current-head" } },
      review: { id: 88, state: "approved", commit_id: "reviewed-head", html_url: "https://example/review/88", user: { id: 42, login: "octocat" } },
    })).toEqual(expect.objectContaining({
      kind: "review", externalId: "88", pullRequestNumber: 7, headSha: "reviewed-head",
      authorExternalId: "42", authorLogin: "octocat",
    }));
  });

  it("preserves pull-request identity when a check arrives before its PR projection", () => {
    expect(normalizeGitHubWebhook("check_run", {
      check_run: {
        id: 501,
        name: "test",
        status: "completed",
        conclusion: "success",
        head_sha: "reviewed-head",
        pull_requests: [{ number: 7 }],
      },
    })).toEqual(expect.objectContaining({
      kind: "check",
      externalId: "501",
      pullRequestNumber: 7,
      headSha: "reviewed-head",
    }));
  });

  it("matches GitHub create-branch recovery by rejecting an existing branch at another head", async () => {
    const provider = new FakeGitProvider();
    provider.seedRepository("c", "repo", "main", "base");
    await provider.createBranch({ provider: "fake", connectionId: "c", repositoryId: "repo", name: "wm/42", baseSha: "base" });
    provider.branches.set("c:repo:wm/42", { name: "wm/42", headSha: "drifted" });
    await expect(provider.createBranch({
      provider: "fake", connectionId: "c", repositoryId: "repo", name: "wm/42", baseSha: "base",
    })).rejects.toThrow("PROVIDER_HEAD_SHA_MISMATCH");
  });

  it("isolates branches, intents and open-PR deduplication by connection and repository", async () => {
    const provider = new FakeGitProvider();
    for (const [connectionId, repositoryId] of [["connection-a", "repo"], ["connection-b", "repo"], ["connection-a", "other"]]) {
      provider.seedRepository(connectionId!, repositoryId!, "main", "base");
      await provider.createBranch({
        provider: "fake", connectionId: connectionId!, repositoryId: repositoryId!,
        name: "wm/42", baseSha: "base",
      });
    }
    const request = {
      provider: "fake" as const, idempotencyKey: "same-intent", baseBranch: "main",
      headBranch: "wm/42", title: "Change", body: "Evidence", draft: false,
    };
    const first = await provider.openPullRequest({ ...request, connectionId: "connection-a", repositoryId: "repo" });
    const second = await provider.openPullRequest({ ...request, connectionId: "connection-b", repositoryId: "repo" });
    const third = await provider.openPullRequest({ ...request, connectionId: "connection-a", repositoryId: "other" });
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    await expect(provider.getPullRequest({
      provider: "fake", connectionId: "connection-b", repositoryId: "repo", pullRequestId: first.id,
    })).rejects.toThrow("PROVIDER_PULL_REQUEST_NOT_FOUND");
  });

  it("mints an installation token in memory before GitHub REST operations", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, authorization: headers.get("authorization") });
      if (url.endsWith("/access_tokens"))
        return Response.json({ token: "installation-token", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
      if (init?.method === "GET") return Response.json({ sha: "base", tree: { sha: "tree" } });
      return Response.json({ ref: "refs/heads/workmesh/test", object: { sha: "base" } }, { status: 201 });
    };
    const provider = new GitHubAppProvider({
      appId: "123", installationId: "456", privateKey: githubTestPrivateKey, fetch, apiBaseUrl: "https://github.test",
    });
    await provider.createBranch({
      provider: "github", connectionId: "c", repositoryId: "99", repositoryFullName: "acme/workmesh",
      name: "workmesh/test", baseSha: "base",
    });
    expect(calls[0]?.authorization).toMatch(/^Bearer eyJ/);
    expect(calls[1]?.authorization).toBe("Bearer installation-token");
    expect(calls.filter(call => call.url.endsWith("/access_tokens"))).toHaveLength(1);
  });

  it("uses GitHub commit/tree/blob reads for guidance and the check re-request endpoint", async () => {
    const calls: string[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method}:${url}`);
      if (url.endsWith("/access_tokens"))
        return Response.json({ token: "installation-token", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
      if (url.endsWith("/git/commits/pinned")) return Response.json({ tree: { sha: "root-tree" } });
      if (url.includes("/git/trees/root-tree?recursive=1"))
        return Response.json({ truncated: false, tree: [
          { path: "AGENTS.md", type: "blob", sha: "root-blob" },
          { path: "apps/api/AGENTS.md", type: "blob", sha: "api-blob" },
          { path: "apps/web/AGENTS.md", type: "blob", sha: "web-blob" },
        ] });
      if (url.endsWith("/git/blobs/root-blob"))
        return Response.json({ encoding: "base64", content: Buffer.from("root").toString("base64") });
      if (url.endsWith("/git/blobs/api-blob"))
        return Response.json({ encoding: "base64", content: Buffer.from("api").toString("base64") });
      if (url.endsWith("/check-runs/42/rerequest")) return new Response(null, { status: 201 });
      return Response.json({});
    };
    const provider = new GitHubAppProvider({
      appId: "123", installationId: "456", privateKey: githubTestPrivateKey, fetch, apiBaseUrl: "https://github.test",
    });
    const identity = {
      provider: "github" as const,
      connectionId: "c",
      repositoryId: "99",
      repositoryFullName: "acme/workmesh",
    };
    await expect(provider.resolveRepositoryGuidance({
      ...identity,
      commitSha: "pinned",
      scopedPaths: ["apps/api/src/**"],
    })).resolves.toEqual([
      expect.objectContaining({ path: "AGENTS.md", blobSha: "root-blob", content: "root" }),
      expect.objectContaining({ path: "apps/api/AGENTS.md", blobSha: "api-blob", content: "api" }),
    ]);
    await expect(provider.retryCheck({ ...identity, checkRunId: "42" }))
      .resolves.toEqual({ requested: true, checkRunId: "42" });
    expect(calls.some(call => call.includes("/check-runs/42/rerequest"))).toBe(true);
  });

  it("recovers GitHub commit, pull-request, and merge results after a worker crash", async () => {
    const mutations: string[] = [];
    const pullRequest = {
      number: 7, html_url: "https://github.test/acme/workmesh/pull/7",
      base: { ref: "main", sha: "base" }, head: { ref: "workmesh/test", sha: "already" },
      state: "open", draft: false, body: "Evidence\n\n<!-- workmesh-intent:pr-action -->",
    };
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/access_tokens"))
        return Response.json({ token: "installation-token", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
      if (init?.method !== "GET") {
        mutations.push(`${init?.method}:${url}`);
        return Response.json({});
      }
      if (url.includes("/git/ref/heads/")) return Response.json({ object: { sha: "already" } });
      if (url.endsWith("/git/commits/already"))
        return Response.json({ sha: "already", message: "change\n\nWorkMesh-Intent: commit-action", html_url: "https://github.test/commit/already" });
      if (url.includes("/pulls?")) return Response.json([pullRequest]);
      if (url.endsWith("/pulls/7"))
        return Response.json({ ...pullRequest, state: "closed", merged: true, merge_commit_sha: "merged" });
      return Response.json({});
    };
    const provider = new GitHubAppProvider({
      appId: "123", installationId: "456", privateKey: githubTestPrivateKey, fetch, apiBaseUrl: "https://github.test",
    });
    const identity = {
      provider: "github" as const, connectionId: "c", repositoryId: "99", repositoryFullName: "acme/workmesh",
    };
    await expect(provider.createCommit({
      ...identity, idempotencyKey: "commit-action", branch: "workmesh/test",
      expectedHeadSha: "base", message: "change", files: [{ path: "a.ts", content: "ok" }],
    })).resolves.toMatchObject({ sha: "already" });
    const replayedPr = await provider.openPullRequest({
      ...identity, idempotencyKey: "pr-action", baseBranch: "main",
      headBranch: "workmesh/test", title: "Change", body: "Evidence", draft: false,
    });
    await expect(provider.mergePullRequest({
      ...identity, pullRequestId: replayedPr.id, expectedHeadSha: "already", method: "squash",
    })).resolves.toEqual({ merged: true, mergeSha: "merged" });
    expect(mutations).toEqual([]);
  });

  it("recreates the identical GitHub commit object after a crash before the ref update", async () => {
    let refSha = "base";
    let failFirstPatch = true;
    const commitBodies: string[] = [];
    const commitShas: string[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/access_tokens"))
        return Response.json({ token: "installation-token", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
      if (url.includes("/git/ref/heads/")) return Response.json({ object: { sha: refSha } });
      if (url.endsWith("/git/commits/base")) return Response.json({ tree: { sha: "base-tree" } });
      if (url.endsWith("/git/trees") && init?.method === "POST")
        return Response.json({ sha: "deterministic-tree" }, { status: 201 });
      if (url.endsWith("/git/commits") && init?.method === "POST") {
        const body = String(init.body);
        commitBodies.push(body);
        const sha = createHash("sha1").update(body).digest("hex");
        commitShas.push(sha);
        return Response.json({ sha, html_url: `https://github.test/commit/${sha}` }, { status: 201 });
      }
      if (url.includes("/git/refs/heads/") && init?.method === "PATCH") {
        const sha = String((JSON.parse(String(init.body)) as { sha: string }).sha);
        if (failFirstPatch) {
          failFirstPatch = false;
          throw new Error("simulated worker crash before ref update");
        }
        refSha = sha;
        return Response.json({ object: { sha } });
      }
      return Response.json({});
    };
    const provider = new GitHubAppProvider({
      appId: "123", installationId: "456", privateKey: githubTestPrivateKey, fetch, apiBaseUrl: "https://github.test",
    });
    const request = {
      provider: "github" as const,
      connectionId: "c",
      repositoryId: "99",
      repositoryFullName: "acme/workmesh",
      idempotencyKey: "durable-action-id",
      branch: "workmesh/test",
      expectedHeadSha: "base",
      message: "change",
      files: [{ path: "a.ts", content: "ok" }],
    };
    await expect(provider.createCommit(request)).rejects.toThrow("simulated worker crash");
    const recovered = await provider.createCommit(request);
    expect(commitBodies).toHaveLength(2);
    expect(commitBodies[0]).toBe(commitBodies[1]);
    expect(new Set(commitShas).size).toBe(1);
    expect(recovered.sha).toBe(commitShas[0]);
    expect(refSha).toBe(recovered.sha);
  });
});
