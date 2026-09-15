"use client";

import { useEffect, useState } from "react";
import {
  CloseIcon,
  ComputerIcon,
  ProviderIcon,
  SettingsIcon,
  UpdatesIcon,
  UsageIcon,
} from "./icons";
import type { ProviderPublic } from "../../shared/providers.ts";

export type AppSettingsTab = "general" | "providers" | "computer" | "usage" | "updates";

const TABS: Array<{ id: AppSettingsTab; label: string; icon: typeof SettingsIcon }> = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "providers", label: "Providers", icon: ProviderIcon },
  { id: "computer", label: "Computer", icon: ComputerIcon },
  { id: "usage", label: "Usage", icon: UsageIcon },
  { id: "updates", label: "Updates", icon: UpdatesIcon },
];

type UsagePayload = {
  observed_input_tokens: number;
  observed_output_tokens: number;
  requests: number;
  window_start: string;
  activeProviderId?: string;
  charged?: { input_tokens: number; output_tokens: number };
  week?: { observed_input_tokens: number; observed_output_tokens: number; requests: number; window_start: string };
  by_model: Array<{ provider: string; model: string; requests: number; inputTokens: number; outputTokens: number }>;
  caps: { requests24h: number; input24h: number; output24h: number };
};

async function csrfHeaders(): Promise<Record<string, string>> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  const session = await res.json() as { csrfToken?: string };
  return { "content-type": "application/json", "x-ub-csrf": session.csrfToken ?? "" };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export function AppSettingsDialog({
  initialTab = "general",
  onClose,
  operator,
}: {
  initialTab?: AppSettingsTab;
  onClose: () => void;
  operator: { name: string; initials: string };
}) {
  const [tab, setTab] = useState<AppSettingsTab>(initialTab);
  const [meta, setMeta] = useState<{ version: string; theme: string }>({ version: "", theme: "light" });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const host = typeof navigator !== "undefined" ? navigator.platform : "This Mac";

  useEffect(() => {
    fetch("/api/status", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((body: { version?: string; theme?: string } | null) => {
        if (!body) return;
        setMeta({ version: body.version ?? "", theme: body.theme ?? "light" });
      })
      .catch(() => undefined);
  }, []);

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div aria-label="Settings" aria-modal="true" className="settings-modal" role="dialog">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={tab === item.id ? "page" : undefined}
                className={tab === item.id ? "settings-nav-item settings-nav-item-active" : "settings-nav-item"}
                key={item.id}
                onClick={() => setTab(item.id)}
                type="button"
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="settings-main uv-scroll">
          <header className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">{TABS.find((item) => item.id === tab)?.label}</h2>
            <button aria-label="Close settings" className="icon-btn size-8" onClick={onClose} type="button">
              <CloseIcon className="size-4" />
            </button>
          </header>

          {tab === "general" ? (
            <div className="flex flex-col gap-6">
              <section>
                <h3 className="settings-block-label">Account</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="operator-avatar">{operator.initials}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{operator.name}</p>
                        <p className="truncate text-xs text-ink-muted">Local desktop owner</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              <section>
                <h3 className="settings-block-label">Appearance</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <p className="text-sm">Theme</p>
                    <span className="settings-value">{meta.theme === "light" ? "Light" : meta.theme}</span>
                  </div>
                  <div className="settings-row">
                    <p className="text-sm">Language</p>
                    <span className="settings-value">System</span>
                  </div>
                </div>
              </section>
              <section>
                <h3 className="settings-block-label">System</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <p className="text-sm">Timezone</p>
                    <span className="settings-value">{timezone}</span>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {tab === "providers" ? <ProvidersPane /> : null}

          {tab === "computer" ? (
            <div className="flex flex-col gap-6">
              <section>
                <h3 className="settings-block-label">Computer</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <div>
                      <p className="text-sm">This Mac</p>
                      <p className="text-xs text-ink-muted">Tools run on this machine over loopback.</p>
                    </div>
                    <span className="settings-value">{host}</span>
                  </div>
                  <div className="settings-row">
                    <div>
                      <p className="text-sm">Local execution</p>
                      <p className="text-xs text-ink-muted">Writes and shell still need your approval.</p>
                    </div>
                    <span className="settings-value">On</span>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {tab === "usage" ? <UsagePane /> : null}

          {tab === "updates" ? (
            <div className="flex flex-col gap-6">
              <section>
                <h3 className="settings-block-label">Useful Bot</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <div>
                      <p className="text-sm">Update track</p>
                      <p className="text-xs text-ink-muted">Install from this repo. No auto-update channel yet.</p>
                    </div>
                    <span className="settings-value">Git</span>
                  </div>
                  <div className="settings-row">
                    <p className="text-sm">Version</p>
                    <span className="settings-value">{meta.version || "dev"}</span>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProvidersPane() {
  const [rows, setRows] = useState<ProviderPublic[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/providers", { credentials: "include" });
    if (!res.ok) throw new Error("Could not load providers.");
    const body = await res.json() as { providers?: ProviderPublic[] };
    setRows(body.providers ?? []);
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "Could not load providers."));
  }, []);

  async function connect(id: string) {
    const key = drafts[id]?.trim() ?? "";
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/providers", {
        method: "PUT",
        credentials: "include",
        headers: await csrfHeaders(),
        body: JSON.stringify({ providerId: id, key }),
      });
      const body = await res.json() as { ok?: boolean; error?: string; providers?: ProviderPublic[] };
      if (!res.ok || !body.ok) throw new Error(body.error === "provider_key" ? "That key looks invalid." : "Could not save the key.");
      setRows(body.providers ?? []);
      setDrafts((current) => ({ ...current, [id]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the key.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/providers", {
        method: "DELETE",
        credentials: "include",
        headers: await csrfHeaders(),
        body: JSON.stringify({ providerId: id }),
      });
      const body = await res.json() as { ok?: boolean; providers?: ProviderPublic[] };
      if (!res.ok || !body.ok) throw new Error("Could not disconnect.");
      setRows(body.providers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setBusy(null);
    }
  }

  async function activate(id: string) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/providers", {
        method: "PUT",
        credentials: "include",
        headers: await csrfHeaders(),
        body: JSON.stringify({ activeProviderId: id }),
      });
      const body = await res.json() as { ok?: boolean; error?: string; providers?: ProviderPublic[] };
      if (!res.ok || !body.ok) {
        throw new Error(body.error === "provider_incompatible"
          ? "This build routes OpenAI-compatible APIs. Use OpenRouter for Claude."
          : "Could not switch provider.");
      }
      setRows(body.providers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch provider.");
    } finally {
      setBusy(null);
    }
  }

  if (!rows) {
    return <p className="text-sm text-ink-muted">Loading providers.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        Paste an API key or coding-plan key. Keys stay on this Mac. Chat uses the active provider.
      </p>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {rows.map((item) => (
        <section key={item.id}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">{item.name}</h3>
              <p className="text-xs text-ink-muted">{item.hint}</p>
            </div>
            {item.active ? <span className="settings-value">Active</span> : null}
          </div>
          <div className="settings-group">
            <div className="settings-row">
              <div>
                <p className="text-sm">Status</p>
                <p className="text-xs text-ink-muted">
                  {item.connected
                    ? item.last4
                      ? `Connected · …${item.last4}`
                      : "Connected on this Mac"
                    : "Not connected"}
                </p>
              </div>
              {item.connected && item.compatible && !item.active ? (
                <button
                  className="btn btn-secondary min-h-8 px-3 text-xs"
                  disabled={busy === item.id}
                  onClick={() => void activate(item.id)}
                  type="button"
                >
                  Use
                </button>
              ) : null}
            </div>
            <div className="settings-row !items-start">
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor={`provider-${item.id}`}>API key</label>
                <input
                  autoComplete="off"
                  className="field-input min-h-10 w-full px-3 text-sm"
                  id={`provider-${item.id}`}
                  onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                  placeholder={item.connected ? "Replace key" : "Paste key"}
                  type="password"
                  value={drafts[item.id] ?? ""}
                />
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className="btn btn-primary min-h-10 px-3 text-xs"
                  disabled={busy === item.id || !(drafts[item.id] ?? "").trim()}
                  onClick={() => void connect(item.id)}
                  type="button"
                >
                  Connect
                </button>
                {item.connected && item.source === "settings" ? (
                  <button
                    className="btn btn-secondary min-h-10 px-3 text-xs"
                    disabled={busy === item.id}
                    onClick={() => void disconnect(item.id)}
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function UsagePane() {
  const [data, setData] = useState<UsagePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/usage", { credentials: "include" });
        if (!res.ok) throw new Error("Could not load usage.");
        const body = await res.json() as UsagePayload;
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load usage.");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!data && !error) {
    return <p className="text-sm text-ink-muted">Loading usage.</p>;
  }
  if (error || !data) {
    return <p className="text-sm text-danger" role="alert">{error || "Could not load usage."}</p>;
  }

  // The meter reads what the router enforces: observed use plus the turns
  // it has reserved for and not yet reconciled.
  const chargedInput = data.charged?.input_tokens ?? data.observed_input_tokens;
  const chargedOutput = data.charged?.output_tokens ?? data.observed_output_tokens;
  const total = chargedInput + chargedOutput;
  const cap = data.caps.input24h + data.caps.output24h;
  const weekTokens = data.week ? data.week.observed_input_tokens + data.week.observed_output_tokens : null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="settings-block-label">Last 24 hours</h3>
        <div className="settings-group">
          <div className="settings-row">
            <div>
              <p className="text-sm">Tokens</p>
              <p className="text-xs text-ink-muted">Includes reserved turns.</p>
            </div>
            <span className="settings-value tnum">{formatCount(total)}</span>
          </div>
          <div className="settings-row">
            <p className="text-sm">Input</p>
            <span className="settings-value tnum">{formatCount(chargedInput)}</span>
          </div>
          <div className="settings-row">
            <p className="text-sm">Output</p>
            <span className="settings-value tnum">{formatCount(chargedOutput)}</span>
          </div>
          <div className="settings-row">
            <p className="text-sm">Requests</p>
            <span className="settings-value tnum">{formatCount(data.requests)}</span>
          </div>
        </div>
        <div className="usage-meter" aria-hidden="true">
          <span style={{ width: `${Math.min(100, cap ? (total / cap) * 100 : 0)}%` }} />
        </div>
      </section>
      {data.week ? (
        <section>
          <h3 className="settings-block-label">This week</h3>
          <div className="settings-group">
            <div className="settings-row">
              <p className="text-sm">Tokens</p>
              <span className="settings-value tnum">{formatCount(weekTokens ?? 0)}</span>
            </div>
            <div className="settings-row">
              <p className="text-sm">Requests</p>
              <span className="settings-value tnum">{formatCount(data.week.requests)}</span>
            </div>
          </div>
        </section>
      ) : null}
      <section>
        <h3 className="settings-block-label">By model</h3>
        {data.by_model.length === 0 ? (
          <p className="text-sm text-ink-muted">No model traffic in this window yet.</p>
        ) : (
          <div className="settings-group">
            {data.by_model.map((row) => (
              <div className="settings-row" key={`${row.provider}-${row.model}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm">{row.model}</p>
                  <p className="text-xs text-ink-muted">{row.provider} · {formatCount(row.requests)} requests</p>
                </div>
                <span className="settings-value tnum">
                  {formatCount(row.inputTokens + row.outputTokens)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
