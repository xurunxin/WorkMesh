"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { AgentEnrollmentPolicy, ListResponse } from "@workmesh/contracts";
import { Badge, Button } from "@workmesh/ui";
import { apiMutation, apiRequest, json } from "../lib/api";
import { useLocale } from "../lib/i18n";

type Team = Readonly<{ id: string; name: string }>;
type CreateResponse = Readonly<{ policy: AgentEnrollmentPolicy; enrollment_token: string }>;
type ClientType = "codex" | "opencode" | "pi" | "generic_mcp";

const capabilityOptions = ["work:read", "work:write", "comment:write", "plan:write", "message:write", "artifact:write", "repo:read", "repo:write_branch", "ci:run", "agent:delegate"] as const;

export function EnrollmentPoliciesPanel({ admin, teams }: { admin: boolean; teams: Team[] }) {
  const { locale } = useLocale();
  const copy = locale === "zh-CN" ? {
    eyebrow: "Agent 生命周期",
    title: "自动接入策略",
    intro: "创建一个限时、限次、能力受控的接入入口。令牌只显示一次。",
    name: "策略名称",
    team: "接入团队",
    client: "允许客户端",
    capabilities: "能力上限",
    delegate: "允许创建 Agent 委派",
    expires: "到期时间",
    uses: "最大使用次数",
    create: "创建接入策略",
    creating: "正在创建…",
    empty: "尚未创建自动接入策略。",
    remaining: "剩余",
    revoke: "撤销",
    tokenTitle: "一次性接入命令",
    tokenHint: "现在复制；离开后无法再次查看 wme_ 令牌。",
    copy: "复制命令",
    copied: "已复制",
    adminOnly: "仅工作区管理员可以创建和撤销策略。",
  } : {
    eyebrow: "Agent lifecycle",
    title: "Automatic enrollment policies",
    intro: "Create a time-limited, use-limited, capability-bounded enrollment path. The token is shown once.",
    name: "Policy name",
    team: "Enrollment team",
    client: "Allowed client",
    capabilities: "Capability ceiling",
    delegate: "Allow Agent delegations",
    expires: "Expires",
    uses: "Maximum uses",
    create: "Create enrollment policy",
    creating: "Creating…",
    empty: "No automatic enrollment policies yet.",
    remaining: "Remaining",
    revoke: "Revoke",
    tokenTitle: "One-time enrollment command",
    tokenHint: "Copy it now; the wme_ token cannot be shown again.",
    copy: "Copy command",
    copied: "Copied",
    adminOnly: "Only workspace admins can create or revoke policies.",
  };
  const [policies, setPolicies] = useState<AgentEnrollmentPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdCommand, setCreatedCommand] = useState("");
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [clientType, setClientType] = useState<ClientType>("codex");
  const [capabilities, setCapabilities] = useState<string[]>(["work:read", "work:write"]);
  const [grantDelegate, setGrantDelegate] = useState(false);
  const [expiresAt, setExpiresAt] = useState(() => new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 16));
  const [maxUses, setMaxUses] = useState(1);

  useEffect(() => { if (!teamId && teams[0]) setTeamId(teams[0].id); }, [teamId, teams]);
  const load = useCallback(async () => {
    if (!admin) { setLoading(false); return; }
    try {
      setError("");
      const page = await apiRequest<ListResponse<AgentEnrollmentPolicy>>("/api/v1/agent-enrollment-policies");
      setPolicies(page.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load enrollment policies.");
    } finally {
      setLoading(false);
    }
  }, [admin]);
  useEffect(() => { void load(); }, [load]);

  const toggleCapability = (capability: string) => {
    setCapabilities((current) => current.includes(capability) ? current.filter((value) => value !== capability) : [...current, capability]);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!teamId || !name.trim() || capabilities.length === 0) return;
    try {
      setBusy(true);
      setError("");
      const result = await apiMutation<CreateResponse>(
        `agent-enrollment-policy:${teamId}:${name.trim()}:${expiresAt}:${maxUses}`,
        "/api/v1/agent-enrollment-policies",
        {
          method: "POST",
          headers: json({}),
          body: JSON.stringify({
            name: name.trim(), teamId, allowedClientTypes: [clientType], capabilityCeiling: capabilities,
            grantAgentDelegate: grantDelegate, expiresAt: new Date(expiresAt).toISOString(), maxUses,
          }),
        },
      );
      const payload = JSON.stringify({
        enrollmentToken: result.enrollment_token,
        name: "my-agent",
        slug: "my-agent",
        client: { type: clientType, version: "current" },
        manifest: { provider: clientType, version: "current" },
        requestedCapabilities: capabilities,
      });
      setCreatedCommand(`curl -X POST \"$WORKMESH_URL/api/v1/agent-enrollments/redeem\" -H \"Content-Type: application/json\" -H \"Idempotency-Key: $(uuidgen)\" --data '${payload}'`);
      setPolicies((current) => [result.policy, ...current.filter((policy) => policy.id !== result.policy.id)]);
      setName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create enrollment policy.");
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (policy: AgentEnrollmentPolicy) => {
    try {
      setBusy(true);
      await apiMutation<void>(`agent-enrollment-policy-revoke:${policy.id}:${policy.revision}`, `/api/v1/agent-enrollment-policies/${encodeURIComponent(policy.id)}`, { method: "DELETE", headers: { "If-Match": `"revision-${policy.revision}"` } });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to revoke enrollment policy.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="surface-panel enrollment-policies" aria-label={copy.title}>
    <header className="surface-header"><div><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2><p>{copy.intro}</p></div></header>
    {!admin ? <p className="empty">{copy.adminOnly}</p> : <>
      <form className="enrollment-policy-form" onSubmit={submit}>
        <label><span>{copy.name}</span><input required maxLength={120} onChange={(event) => setName(event.currentTarget.value)} value={name} /></label>
        <label><span>{copy.team}</span><select required onChange={(event) => setTeamId(event.currentTarget.value)} value={teamId}><option value="" disabled>{copy.team}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label><span>{copy.client}</span><select onChange={(event) => setClientType(event.currentTarget.value as ClientType)} value={clientType}>{(["codex", "opencode", "pi", "generic_mcp"] as const).map((client) => <option key={client} value={client}>{client}</option>)}</select></label>
        <label><span>{copy.expires}</span><input required min={new Date().toISOString().slice(0, 16)} onChange={(event) => setExpiresAt(event.currentTarget.value)} type="datetime-local" value={expiresAt} /></label>
        <label><span>{copy.uses}</span><input min={1} max={10000} onChange={(event) => setMaxUses(Number(event.currentTarget.value))} type="number" value={maxUses} /></label>
        <fieldset><legend>{copy.capabilities}</legend><div className="enrollment-capabilities">{capabilityOptions.map((capability) => <label key={capability}><input checked={capabilities.includes(capability)} onChange={() => toggleCapability(capability)} type="checkbox" />{capability}</label>)}</div></fieldset>
        <label className="enrollment-delegate"><input checked={grantDelegate} onChange={(event) => { const checked = event.currentTarget.checked; setGrantDelegate(checked); if (!checked) setCapabilities((current) => current.filter((value) => value !== "agent:delegate")); }} type="checkbox" />{copy.delegate}</label>
        <Button disabled={busy || capabilities.length === 0 || !teamId} type="submit">{busy ? copy.creating : copy.create}</Button>
      </form>
      {createdCommand && <section className="enrollment-token" role="status"><div><strong>{copy.tokenTitle}</strong><p>{copy.tokenHint}</p></div><pre><code>{createdCommand}</code></pre><Button onClick={() => { void navigator.clipboard.writeText(createdCommand); setCopied(true); }} type="button" variant="secondary">{copied ? copy.copied : copy.copy}</Button></section>}
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p>{copy.creating}</p> : policies.length === 0 ? <p className="empty">{copy.empty}</p> : <div className="enrollment-policy-table" role="table" aria-label={copy.title}>{policies.map((policy) => <article key={policy.id} role="row"><div><strong>{policy.name}</strong><span>{teams.find((team) => team.id === policy.team_id)?.name ?? policy.team_id}</span></div><Badge tone={policy.status === "active" ? "success" : "neutral"}>{policy.status}</Badge><span>{copy.remaining}: {policy.remaining_uses}/{policy.max_uses}</span><time>{new Date(policy.expires_at).toLocaleString(locale)}</time>{policy.status === "active" && <Button disabled={busy} onClick={() => void revoke(policy)} type="button" variant="danger">{copy.revoke}</Button>}</article>)}</div>}
    </>}
  </section>;
}
