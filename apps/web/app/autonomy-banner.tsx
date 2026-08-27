"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApprovalAutonomyPolicy,
  BrowserPushSubscription,
  ListResponse,
} from "@workmesh/contracts";
import { Badge, Button } from "@workmesh/ui";
import { apiMutation, apiRequest, json } from "./lib/api";
import { useLocale } from "./lib/i18n";
import { useRealtimeSubscription } from "./lib/realtime";

type Actor = Readonly<{
  id: string;
  workspace_id?: string;
  workspace_role: "admin" | "member";
}>;

type PushConfig = Readonly<{ configured: boolean; public_key: string | null }>;

const applicationServerKey = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const bytes = atob(padded);
  const buffer = new ArrayBuffer(bytes.length);
  const result = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1)
    result[index] = bytes.charCodeAt(index);
  return result;
};

const deviceId = (): string => {
  const key = "workmesh.browser-push.device-id";
  const current = window.localStorage.getItem(key);
  if (current) return current;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
};

export function AutonomyBanner({ actor }: { actor: Actor }) {
  const { locale } = useLocale();
  const copy = locale === "zh-CN" ? {
    eyebrow: "工作区自主策略",
    title: "YOLO 自主推进",
    description: "开启后，未排除项目的有效审批会自动通过；身份、授权、资源范围、revision 与 Stop 校验始终生效。",
    on: "已开启",
    off: "已关闭",
    readonly: "仅管理员可修改",
    exclusions: (count: number) => `${count} 个项目排除`,
    sync: "同步",
    noSync: "无待同步任务",
    push: "浏览器审批推送",
    pushOn: "本设备已开启",
    pushOff: "在新审批需要处理时提醒我",
    pushUnavailable: "服务端尚未配置 Web Push，站内审批不受影响。",
    pushDenied: "浏览器已拒绝通知。可在站点设置中恢复后重试。",
    saving: "正在保存…",
    failed: "无法更新控制策略，请刷新后重试。",
  } : {
    eyebrow: "Workspace autonomy policy",
    title: "YOLO autonomous progress",
    description: "When enabled, valid approvals outside excluded projects are approved automatically. Identity, authority, resource scope, revision, and Stop checks always remain enforced.",
    on: "Enabled",
    off: "Disabled",
    readonly: "Only admins can change this",
    exclusions: (count: number) => `${count} excluded projects`,
    sync: "Sync",
    noSync: "No reconciliation pending",
    push: "Browser approval notifications",
    pushOn: "Enabled on this device",
    pushOff: "Notify me when a new approval needs attention",
    pushUnavailable: "Web Push is not configured on the server. In-app approvals are unaffected.",
    pushDenied: "Notifications are blocked in this browser. Restore permission in site settings and retry.",
    saving: "Saving…",
    failed: "The control policy could not be updated. Refresh and try again.",
  };
  const [policy, setPolicy] = useState<ApprovalAutonomyPolicy | null>(null);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [subscriptions, setSubscriptions] = useState<BrowserPushSubscription[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [nextPolicy, nextConfig, nextSubscriptions] = await Promise.all([
        apiRequest<ApprovalAutonomyPolicy>("/api/v1/approval-autonomy-policy"),
        apiRequest<PushConfig>("/api/v1/browser-push/config"),
        apiRequest<ListResponse<BrowserPushSubscription>>("/api/v1/browser-push/subscriptions"),
      ]);
      setPolicy(nextPolicy);
      setConfig(nextConfig);
      setSubscriptions(Array.isArray(nextSubscriptions?.items) ? nextSubscriptions.items : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.failed);
    }
  }, [copy.failed]);

  useEffect(() => { void load(); }, [load]);
  useRealtimeSubscription(actor.workspace_id ? [{ type: "workspace", id: actor.workspace_id }] : [], () => load());
  const currentDeviceId = typeof window === "undefined" ? "" : deviceId();
  const activeSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.device_id === currentDeviceId && subscription.status === "active") ?? null,
    [currentDeviceId, subscriptions],
  );

  const toggleYolo = async () => {
    if (!policy || actor.workspace_role !== "admin") return;
    try {
      setBusy(true);
      setError("");
      const nextMode = policy.mode === "yolo" ? "human_required" : "yolo";
      const next = await apiMutation<ApprovalAutonomyPolicy>(
        `approval-autonomy:${policy.workspace_id}:${policy.revision}:${nextMode}`,
        "/api/v1/approval-autonomy-policy",
        {
          method: "PUT",
          headers: { ...json({}), "If-Match": `"revision-${policy.revision}"` },
          body: JSON.stringify({ mode: nextMode, excludedProjectIds: policy.excluded_project_ids }),
        },
      );
      setPolicy(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.failed);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const togglePush = async () => {
    if (!config?.configured || !config.public_key) return;
    try {
      setBusy(true);
      setError("");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const browserSubscription = await registration.pushManager.getSubscription();
      if (activeSubscription) {
        await apiMutation<void>(
          `browser-push-revoke:${activeSubscription.id}:${activeSubscription.revision}`,
          `/api/v1/browser-push/subscriptions/${encodeURIComponent(activeSubscription.id)}`,
          { method: "DELETE", headers: { "If-Match": `"revision-${activeSubscription.revision}"` } },
        );
        await browserSubscription?.unsubscribe();
        await load();
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(copy.pushDenied);
        return;
      }
      const subscription = browserSubscription ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(config.public_key),
      });
      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth)
        throw new Error("The browser returned an incomplete Push subscription.");
      await apiMutation<BrowserPushSubscription>(
        `browser-push-subscribe:${currentDeviceId}:${serialized.endpoint}`,
        "/api/v1/browser-push/subscriptions",
        {
          method: "POST",
          headers: json({}),
          body: JSON.stringify({ endpoint: serialized.endpoint, keys: serialized.keys, deviceId: currentDeviceId }),
        },
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.failed);
    } finally {
      setBusy(false);
    }
  };

  const reconciliation = policy?.reconciliation;
  return (
    <section className={`autonomy-banner${policy?.mode === "yolo" ? " yolo" : ""}`} data-testid="autonomy-banner">
      <div className="autonomy-banner-copy">
        <p className="eyebrow">{copy.eyebrow}</p>
        <div className="autonomy-banner-title"><h3>{copy.title}</h3><Badge tone={policy?.mode === "yolo" ? "warning" : "neutral"}>{policy?.mode === "yolo" ? copy.on : copy.off}</Badge></div>
        <p>{copy.description}</p>
      </div>
      <div className="autonomy-banner-facts">
        <span>{copy.exclusions(policy?.excluded_project_ids?.length ?? 0)}</span>
        <span>{reconciliation ? `${copy.sync}: ${reconciliation.status} · ${reconciliation.completed_count}/${reconciliation.pending_count + reconciliation.completed_count + reconciliation.skipped_count}` : copy.noSync}</span>
        {actor.workspace_role !== "admin" && <span>{copy.readonly}</span>}
      </div>
      <div className="autonomy-banner-actions">
        <label className="autonomy-switch">
          <input checked={policy?.mode === "yolo"} disabled={busy || !policy || actor.workspace_role !== "admin"} onChange={() => void toggleYolo()} role="switch" type="checkbox" />
          <span>{busy ? copy.saving : policy?.mode === "yolo" ? copy.on : copy.off}</span>
        </label>
        <Button disabled={busy || !config?.configured} onClick={() => void togglePush()} type="button" variant="secondary">
          {activeSubscription ? copy.pushOn : copy.pushOff}
        </Button>
        {!config?.configured && config && <span className="autonomy-push-help">{copy.pushUnavailable}</span>}
      </div>
      {error && <p className="autonomy-banner-error" role="alert">{error}</p>}
    </section>
  );
}
