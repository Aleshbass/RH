"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { Eye, Key, ListChecks, Plus, RefreshCw, Send, Terminal, Trash2, Webhook } from "lucide-react";
import {
  API_BASE_URL,
  Busy,
  CodeBlock,
  DASH,
  Drawer,
  EmptyState,
  EnvBadge,
  LoadingBlock,
  Modal,
  Pill,
  SIGNATURE_DOCS_URL,
  SecretModal,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_RETRY_SCHEDULE,
  btnDanger,
  btnLink,
  btnPrimary,
  btnSecondary,
  cardCls,
  errorMessage,
  fmtDateTime,
  fmtTime,
  humanize,
  inputCls,
  labelCls,
  prettyJson,
  selectCls,
  tdCls,
  thCls,
  useConfirm,
  type PortalContext,
} from "./shared";
import type { TabId } from "./PartnerDashboard";

type Section = "keys" | "webhooks" | "logs" | "quickstart";

export function DevelopersTab({ ctx, onNavigate }: { ctx: PortalContext; onNavigate: (tab: TabId) => void }) {
  const [section, setSection] = useState<Section>("keys");
  const sections: Array<{ id: Section; label: string; icon: typeof Key }> = [
    { id: "keys", label: "API keys", icon: Key },
    { id: "webhooks", label: "Webhooks", icon: Webhook },
    { id: "logs", label: "Activity log", icon: ListChecks },
    { id: "quickstart", label: "Quickstart", icon: Terminal },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                section === s.id ? "bg-[#002e2c] text-[#FAF6E7] border-[#002e2c]" : "bg-white text-[#52706e] border-[#002e2c]/10 hover:text-[#002e2c]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
        <EnvBadge env={ctx.environment} className="self-center ml-1" />
      </div>
      {!ctx.envWritable && (section === "keys" || section === "webhooks") && (
        <div className="p-4 rounded-2xl bg-white border border-[#002e2c]/15 text-xs text-[#52706e] flex items-center justify-between gap-3 flex-wrap">
          <span>Live keys and the live webhook endpoint become available once Rehabify approves your production access.</span>
          <button type="button" className={btnSecondary} onClick={() => onNavigate("golive")}>
            Go-live checklist
          </button>
        </div>
      )}
      {section === "keys" && <ApiKeysSection ctx={ctx} />}
      {section === "webhooks" && <WebhooksSection ctx={ctx} />}
      {section === "logs" && <ActivityLogSection ctx={ctx} />}
      {section === "quickstart" && <QuickstartSection ctx={ctx} />}
    </div>
  );
}

// ─── API keys ────────────────────────────────────────────────────────────────

type KeyRow = {
  _id: Id<"partnerApiKeys">;
  name: string;
  keyPrefix: string;
  last4: string | null;
  status: "active" | "revoked";
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

function ApiKeysSection({ ctx }: { ctx: PortalContext }) {
  const keys = useQuery(api.partners.listPartnerApiKeys, { partnerCode: ctx.partnerCode, environment: ctx.environment }) as KeyRow[] | undefined;
  const createKey = useAction(api.partners.createPartnerApiKey);
  const rotateKey = useAction(api.partners.rotatePartnerApiKey);
  const revokeKey = useMutation(api.partners.revokePartnerApiKey);
  const { confirm, element: confirmElement } = useConfirm();
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const active = (keys ?? []).filter((k) => k.status === "active");
  const revoked = (keys ?? []).filter((k) => k.status === "revoked");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create");
    try {
      const result = (await createKey({ partnerCode: ctx.partnerCode, environment: ctx.environment, name: name.trim() || `${ctx.environment === "live" ? "Live" : "Sandbox"} key` })) as { key: string };
      setNewOpen(false);
      setName("");
      setSecret(result.key);
    } catch (err) {
      toast.error(errorMessage(err, "Could not create the key"));
    } finally {
      setBusy(null);
    }
  };

  const handleRotate = async (key: KeyRow) => {
    const ok = await confirm({
      title: `Rotate "${key.name}"?`,
      body: "A new key is created and the current key stops working immediately. Update your servers right away.",
      confirmLabel: "Rotate key",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(key._id);
    try {
      const result = (await rotateKey({ partnerCode: ctx.partnerCode, keyId: key._id })) as { key: string };
      setSecret(result.key);
    } catch (err) {
      toast.error(errorMessage(err, "Could not rotate the key"));
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async (key: KeyRow) => {
    const ok = await confirm({
      title: `Revoke "${key.name}"?`,
      body: "Requests using this key will fail with 401 invalid_api_key immediately. This cannot be undone.",
      confirmLabel: "Revoke key",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(key._id);
    try {
      await revokeKey({ partnerCode: ctx.partnerCode, keyId: key._id });
      toast.success("Key revoked");
    } catch (err) {
      toast.error(errorMessage(err, "Could not revoke the key"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#002e2c]/10">
        <div>
          <h3 className="text-sm font-semibold">{ctx.environment === "live" ? "Live" : "Sandbox"} secret keys</h3>
          <p className="text-xs text-[#52706e] mt-0.5 leading-relaxed max-w-2xl">
            Send as <code className="font-mono">Authorization: Bearer {ctx.environment === "live" ? "sk_live_…" : "sk_test_…"}</code>. Keys are shown once at
            creation and stored only as a hash. Server-side use only — never in browsers or mobile apps. Up to 10 active keys per environment.
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setNewOpen(true)} disabled={!ctx.envWritable}>
          <Plus className="w-3.5 h-3.5" />
          Create key
        </button>
      </div>
      {keys === undefined ? (
        <LoadingBlock />
      ) : active.length === 0 && revoked.length === 0 ? (
        <EmptyState icon={<Key className="w-8 h-8" />} title="No keys yet" body="Create a key to start calling the API from your server." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[#52706e] bg-[#FAF6E7]/60">
              <tr>
                <th className={thCls}>Name</th>
                <th className={thCls}>Key</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Created</th>
                <th className={thCls}>Last used</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#002e2c]/5">
              {[...active, ...revoked].map((key) => (
                <tr key={key._id} className={key.status === "revoked" ? "opacity-60" : undefined}>
                  <td className={`${tdCls} font-medium`}>{key.name}</td>
                  <td className={`${tdCls} font-mono`}>{key.keyPrefix}</td>
                  <td className={tdCls}>{key.status === "active" ? <Pill tone="green">Active</Pill> : <Pill tone="gray">Revoked {key.revokedAt ? fmtDateTime(key.revokedAt) : ""}</Pill>}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(key.createdAt)}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{key.lastUsedAt ? fmtDateTime(key.lastUsedAt) : "Never"}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {key.status === "active" && (
                      <div className="flex items-center gap-3">
                        <button type="button" className={btnLink} onClick={() => handleRotate(key)} disabled={busy === key._id || !ctx.envWritable}>
                          <RefreshCw className="w-3 h-3" /> Rotate
                        </button>
                        <button type="button" className={`${btnLink} text-red-700`} onClick={() => handleRevoke(key)} disabled={busy === key._id}>
                          <Trash2 className="w-3 h-3" /> Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title={`Create a ${ctx.environment} key`}
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setNewOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="new-key" className={btnPrimary} disabled={busy === "create"}>
              <Busy busy={busy === "create"} label="Create key" busyLabel="Creating…" />
            </button>
          </>
        }
      >
        <form id="new-key" onSubmit={handleCreate}>
          <label className={labelCls}>Key name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Production server, EMR worker" className={inputCls} />
        </form>
      </Modal>
      <SecretModal secret={secret} title="Your new API key" description={`This ${ctx.environment} key is shown only once.`} onClose={() => setSecret(null)} />
      {confirmElement}
    </div>
  );
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

type Delivery = {
  _id: Id<"partnerWebhookDeliveries">;
  eventId: string;
  eventType: string;
  status: "pending" | "delivering" | "succeeded" | "failed" | "skipped";
  attempts: number;
  maxAttempts: number;
  trackingCode: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  lastResponseSnippet: string | null;
  lastLatencyMs: number | null;
  lastTargetUrl: string | null;
  nextAttemptAt: number | null;
  deliveredAt: number | null;
  createdAt: number;
  payload: string;
};

function deliveryTone(status: Delivery["status"]) {
  return status === "succeeded" ? "green" : status === "failed" ? "red" : status === "skipped" ? "gray" : "amber";
}

function WebhooksSection({ ctx }: { ctx: PortalContext }) {
  const saveEndpoint = useAction(api.partners.saveWebhookEndpoint);
  const removeEndpoint = useMutation(api.partners.removeWebhookEndpoint);
  const revealSecret = useMutation(api.partners.revealWebhookSecret);
  const rotateSecret = useAction(api.partners.rotateWebhookSecret);
  const sendTest = useMutation(api.partnerWebhooks.sendTestWebhook);
  const resend = useMutation(api.partnerWebhooks.resendWebhookDelivery);
  const [statusFilter, setStatusFilter] = useState("all");
  const deliveries = useQuery(api.partnerWebhooks.listWebhookDeliveries, {
    partnerCode: ctx.partnerCode,
    environment: ctx.environment,
    status: statusFilter,
    limit: 100,
  }) as Delivery[] | undefined;
  const { confirm, element: confirmElement } = useConfirm();

  const configuredUrl = ctx.environment === "live" ? ctx.info.liveWebhookUrl : ctx.info.testWebhookUrl;
  const [url, setUrl] = useState(configuredUrl ?? "");
  useEffect(() => setUrl(configuredUrl ?? ""), [configuredUrl, ctx.environment]);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ value: string; oneTime: boolean; title: string } | null>(null);
  const [testType, setTestType] = useState<string>("ping");
  const [inspect, setInspect] = useState<Delivery | null>(null);

  const run = async (key: string, fn: () => Promise<void>, failure: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err, failure));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-5 space-y-4`}>
        <div>
          <h3 className="text-sm font-semibold">{ctx.environment === "live" ? "Live" : "Sandbox"} webhook endpoint</h3>
          <p className="text-xs text-[#52706e] mt-0.5 leading-relaxed max-w-3xl">
            We POST signed JSON events to this HTTPS URL. Each environment has its own endpoint and signing secret — sandbox events never reach your
            live endpoint. Verify <code className="font-mono">X-Rehabify-Signature: t=…,v1=…</code> (HMAC-SHA256 of <code className="font-mono">&quot;t.body&quot;</code>
            ) — see{" "}
            <a href={SIGNATURE_DOCS_URL} target="_blank" rel="noreferrer" className="text-[#005b57] font-semibold underline">
              signature verification
            </a>
            . Respond 2xx within 10 s; failures are retried after {WEBHOOK_RETRY_SCHEDULE}.
          </p>
        </div>
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              "save",
              async () => {
                const result = (await saveEndpoint({ partnerCode: ctx.partnerCode, environment: ctx.environment, url: url.trim() })) as { webhookUrl: string; secret: string | null };
                toast.success("Webhook endpoint saved");
                if (result.secret) setSecret({ value: result.secret, oneTime: false, title: "Your webhook signing secret" });
              },
              "Could not save the endpoint"
            );
          }}
        >
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.yourcompany.com/rehabify/webhooks"
            className={`${inputCls} font-mono`}
            disabled={!ctx.envWritable}
            aria-label="Webhook endpoint URL"
          />
          <button type="submit" className={btnPrimary} disabled={!ctx.envWritable || busy === "save" || !url.trim()}>
            <Busy busy={busy === "save"} label="Save endpoint" busyLabel="Saving…" />
          </button>
          {configuredUrl && (
            <button
              type="button"
              className={btnDanger}
              disabled={busy === "remove"}
              onClick={async () => {
                if (!(await confirm({ title: "Remove this endpoint?", body: "Events will be recorded but not delivered until you add an endpoint again.", confirmLabel: "Remove", tone: "danger" }))) return;
                await run("remove", async () => {
                  await removeEndpoint({ partnerCode: ctx.partnerCode, environment: ctx.environment });
                  toast.success("Endpoint removed");
                }, "Could not remove the endpoint");
              }}
            >
              Remove
            </button>
          )}
        </form>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            className={btnSecondary}
            disabled={!ctx.info.hasWebhookSecret || busy === "reveal"}
            onClick={() =>
              run("reveal", async () => {
                const result = (await revealWebhookSecretWrapper(revealSecret, ctx)) as { secret: string };
                setSecret({ value: result.secret, oneTime: false, title: "Webhook signing secret" });
              }, "Could not reveal the secret")
            }
          >
            <Eye className="w-3.5 h-3.5" /> Reveal signing secret
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={!ctx.envWritable || busy === "rotate" || !ctx.info.hasWebhookSecret}
            onClick={async () => {
              if (!(await confirm({ title: "Rotate the signing secret?", body: "New deliveries are signed with the new secret immediately. Update your verifier first or accept failures until you do.", confirmLabel: "Rotate secret", tone: "danger" }))) return;
              await run("rotate", async () => {
                const result = (await rotateSecret({ partnerCode: ctx.partnerCode, environment: ctx.environment })) as { secret: string };
                setSecret({ value: result.secret, oneTime: false, title: "New webhook signing secret" });
              }, "Could not rotate the secret");
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Rotate secret
          </button>
          <span className="w-px h-6 bg-[#002e2c]/10 mx-1" />
          <select value={testType} onChange={(e) => setTestType(e.target.value)} className={selectCls} aria-label="Test event type">
            {WEBHOOK_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btnPrimary}
            disabled={!configuredUrl || !ctx.envWritable || busy === "test"}
            onClick={() =>
              run("test", async () => {
                await sendTest({ partnerCode: ctx.partnerCode, environment: ctx.environment, type: testType });
                toast.success("Test event queued — watch the deliveries below");
              }, "Could not send the test event")
            }
          >
            <Send className="w-3.5 h-3.5" /> Send test event
          </button>
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="p-5 flex items-center justify-between gap-3 border-b border-[#002e2c]/10">
          <div>
            <h3 className="text-sm font-semibold">Deliveries</h3>
            <p className="text-[11px] text-[#52706e]">Every event with its delivery attempts. Event ids are stable across retries.</p>
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls} aria-label="Filter deliveries">
            <option value="all">All</option>
            <option value="succeeded">Delivered</option>
            <option value="pending">Retrying / pending</option>
            <option value="failed">Failed</option>
            <option value="skipped">Not sent (no endpoint)</option>
          </select>
        </div>
        {deliveries === undefined ? (
          <LoadingBlock />
        ) : deliveries.length === 0 ? (
          <EmptyState icon={<Webhook className="w-8 h-8" />} title="No events yet" body="Events appear here as referrals change status, or when you send a test event." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[#52706e] bg-[#FAF6E7]/60">
                <tr>
                  <th className={thCls}>Event</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Attempts</th>
                  <th className={thCls}>Last response</th>
                  <th className={thCls}>Created</th>
                  <th className={thCls} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#002e2c]/5">
                {deliveries.map((d) => (
                  <tr key={d._id}>
                    <td className={tdCls}>
                      <div className="font-mono font-semibold">{d.eventType}</div>
                      <div className="font-mono text-[10px] text-[#52706e]">{d.eventId}</div>
                    </td>
                    <td className={tdCls}>
                      <Pill tone={deliveryTone(d.status)}>{d.status === "pending" && d.attempts > 0 ? "retrying" : d.status}</Pill>
                      {d.status === "pending" && d.nextAttemptAt && <div className="text-[10px] text-[#52706e] mt-1">next {fmtTime(d.nextAttemptAt)}</div>}
                    </td>
                    <td className={tdCls}>
                      {d.attempts}/{d.maxAttempts}
                    </td>
                    <td className={`${tdCls} max-w-[220px]`}>
                      {d.lastStatusCode ? <span className="font-mono">HTTP {d.lastStatusCode}</span> : DASH}
                      {d.lastLatencyMs ? <span className="text-[#52706e]"> · {d.lastLatencyMs} ms</span> : null}
                      {d.lastError && <div className="text-red-700 truncate" title={d.lastError}>{d.lastError}</div>}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(d.createdAt)}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      <div className="flex items-center gap-3">
                        <button type="button" className={btnLink} onClick={() => setInspect(d)}>
                          Inspect
                        </button>
                        {(d.status === "failed" || d.status === "succeeded" || d.status === "skipped") && (
                          <button
                            type="button"
                            className={btnLink}
                            disabled={busy === d._id || !configuredUrl}
                            onClick={() =>
                              run(d._id, async () => {
                                await resend({ partnerCode: ctx.partnerCode, deliveryId: d._id });
                                toast.success("Event re-queued (same event id)");
                              }, "Could not resend the event")
                            }
                          >
                            Resend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer open={inspect !== null} onClose={() => setInspect(null)} title={<span className="font-mono">{inspect?.eventType}</span>} subtitle={<span className="font-mono">{inspect?.eventId}</span>}>
        {inspect && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[#52706e]">Status</div>
                <Pill tone={deliveryTone(inspect.status)}>{inspect.status}</Pill>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[#52706e]">Endpoint</div>
                <div className="font-mono break-all">{inspect.lastTargetUrl ?? DASH}</div>
              </div>
            </div>
            <CodeBlock label="Request body (signed)" code={prettyJson(inspect.payload)} maxHeight="max-h-96" />
            {inspect.lastResponseSnippet && <CodeBlock label="Last response (first 2 KB)" code={inspect.lastResponseSnippet} />}
            {inspect.lastError && <p className="text-red-700">{inspect.lastError}</p>}
          </>
        )}
      </Drawer>
      <SecretModal secret={secret?.value ?? null} title={secret?.title ?? ""} oneTime={secret?.oneTime ?? false} description="Use this secret to verify X-Rehabify-Signature on your server." onClose={() => setSecret(null)} />
      {confirmElement}
    </div>
  );
}

function revealWebhookSecretWrapper(reveal: (args: { partnerCode: string; environment: "sandbox" | "live" }) => Promise<unknown>, ctx: PortalContext) {
  return reveal({ partnerCode: ctx.partnerCode, environment: ctx.environment });
}

// ─── Activity log ────────────────────────────────────────────────────────────

const LOG_FILTERS = [
  { value: "all", label: "All events" },
  { value: "api", label: "API requests" },
  { value: "referral", label: "Webhook deliveries (referral.*)" },
  { value: "ping", label: "Test events (ping)" },
  { value: "api_key", label: "API key changes" },
  { value: "webhook", label: "Webhook settings" },
  { value: "production", label: "Go-live" },
  { value: "payout", label: "Payout settings" },
  { value: "security", label: "Security" },
];

function ActivityLogSection({ ctx }: { ctx: PortalContext }) {
  const [eventType, setEventType] = useState("all");
  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const logs = useQuery(api.partners.listPartnerActivityLogs, {
    partnerCode: ctx.partnerCode,
    environment: ctx.environment,
    eventType,
    status,
    direction,
    limit: 100,
  }) as any[] | undefined;
  const [selected, setSelected] = useState<any | null>(null);

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#002e2c]/10">
        <div>
          <h3 className="text-sm font-semibold">Activity log</h3>
          <p className="text-[11px] text-[#52706e]">Your API requests (with request ids for support), webhook deliveries and account changes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={selectCls} aria-label="Event type">
            {LOG_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className={selectCls} aria-label="Direction">
            <option value="all">Inbound + outbound</option>
            <option value="inbound">Inbound (your calls)</option>
            <option value="outbound">Outbound (webhooks)</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} aria-label="Result">
            <option value="all">Any result</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>
      {logs === undefined ? (
        <LoadingBlock />
      ) : logs.length === 0 ? (
        <EmptyState title="No activity matches these filters" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[#52706e] bg-[#FAF6E7]/60">
              <tr>
                <th className={thCls}>Time</th>
                <th className={thCls}>Event</th>
                <th className={thCls}>Request</th>
                <th className={thCls}>Result</th>
                <th className={thCls}>Request id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#002e2c]/5">
              {logs.map((log) => (
                <tr key={log._id} className="hover:bg-[#FAF6E7]/40 cursor-pointer" onClick={() => setSelected(log)}>
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtTime(log.occurredAt)}</td>
                  <td className={tdCls}>
                    <span className="font-mono">{log.eventType}</span>
                    <div className="text-[10px] text-[#52706e]">{log.direction}</div>
                  </td>
                  <td className={`${tdCls} max-w-[240px] truncate font-mono`}>
                    {log.method} {log.url}
                  </td>
                  <td className={tdCls}>
                    <Pill tone={log.status === "success" ? "green" : "red"}>{log.statusCode || log.status}</Pill>
                    {log.latencyMs ? <span className="text-[#52706e] ml-1">{log.latencyMs} ms</span> : null}
                  </td>
                  <td className={`${tdCls} font-mono text-[10px]`}>{log.requestId ?? log.eventId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Drawer open={selected !== null} onClose={() => setSelected(null)} title={<span className="font-mono">{selected?.eventType}</span>} subtitle={selected ? fmtDateTime(selected.occurredAt) : undefined}>
        {selected && (
          <>
            <p className="font-mono break-all">
              {selected.method} {selected.url} → {selected.statusCode}
            </p>
            {selected.errorMessage && <p className="text-red-700">{selected.errorMessage}</p>}
            {selected.requestHeaders && <CodeBlock label="Headers" code={prettyJson(selected.requestHeaders)} />}
            {selected.requestPayload && <CodeBlock label="Payload" code={prettyJson(selected.requestPayload)} maxHeight="max-h-96" />}
            {selected.responsePayload && <CodeBlock label="Response" code={prettyJson(selected.responsePayload)} />}
          </>
        )}
      </Drawer>
    </div>
  );
}

// ─── Quickstart ──────────────────────────────────────────────────────────────

function QuickstartSection({ ctx }: { ctx: PortalContext }) {
  const [lang, setLang] = useState<"curl" | "node" | "python">("curl");
  const keyVar = ctx.environment === "live" ? "sk_live_…" : "sk_test_…";
  const phone = ctx.environment === "sandbox" ? "+2348000000003" : "+2348012345678";
  const body = `{
  "partner_reference": "HMO-REF-2026-0091",
  "patient": { "first_name": "Adeola", "last_name": "Balogun", "phone": "${phone}" },
  "clinical": { "condition": "Lower back pain", "recommended_sessions": 6 },
  "care": { "preferred_mode": "patient_choice" },
  "consent": { "granted": true, "method": "electronic" }
}`;
  const snippets = {
    curl: `curl -X POST ${API_BASE_URL}/partners/referrals \\
  -H "Authorization: Bearer $REHABIFY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: HMO-REF-2026-0091" \\
  -d '${body.replace(/\n/g, "\n  ")}'`,
    node: `const response = await fetch("${API_BASE_URL}/partners/referrals", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.REHABIFY_API_KEY}\`, // ${keyVar}
    "Content-Type": "application/json",
    "Idempotency-Key": "HMO-REF-2026-0091",
  },
  body: JSON.stringify(${body.replace(/\n/g, "\n  ")}),
});
const referral = await response.json();
if (!response.ok) throw new Error(\`\${referral.error.code}: \${referral.error.message}\`);
console.log(referral.tracking_code, referral.links.whatsapp_intake_url);`,
    python: `import os, requests

response = requests.post(
    "${API_BASE_URL}/partners/referrals",
    headers={
        "Authorization": f"Bearer {os.environ['REHABIFY_API_KEY']}",  # ${keyVar}
        "Idempotency-Key": "HMO-REF-2026-0091",
    },
    json=${body.replace(/\n/g, "\n    ").replace(/true/g, "True")},
    timeout=15,
)
response.raise_for_status()
referral = response.json()
print(referral["tracking_code"], referral["links"]["whatsapp_intake_url"])`,
  };
  return (
    <div className={`${cardCls} p-5 space-y-4`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Create your first referral</h3>
          <p className="text-xs text-[#52706e] mt-0.5">
            Base URL <code className="font-mono">{API_BASE_URL}</code>. Full reference, error codes and webhooks at{" "}
            <a href="https://docs.physioaroundme.com" target="_blank" rel="noreferrer" className="text-[#005b57] font-semibold underline">
              docs.physioaroundme.com
            </a>{" "}
            · OpenAPI:{" "}
            <a href="https://physioaroundme.com/openapi.json" target="_blank" rel="noreferrer" className="text-[#005b57] font-semibold underline">
              openapi.json
            </a>
          </p>
        </div>
        <div className="inline-flex p-0.5 bg-[#002e2c]/5 border border-[#002e2c]/10 rounded-xl">
          {(["curl", "node", "python"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={`px-3 py-1 rounded-lg text-xs font-semibold ${lang === l ? "bg-white shadow-xs" : "text-[#52706e]"}`}>
              {l === "node" ? "Node.js" : l === "python" ? "Python" : "cURL"}
            </button>
          ))}
        </div>
      </div>
      <CodeBlock label={humanize(lang)} code={snippets[lang]} maxHeight="max-h-[28rem]" />
      {ctx.environment === "sandbox" && (
        <p className="text-xs text-[#52706e]">
          <strong>{phone}</strong> runs the full simulated journey (contacted → booked → in treatment → completed within ~35 s), firing a webhook at each step.
        </p>
      )}
    </div>
  );
}
