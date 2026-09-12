"use client";

import { useCallback, useEffect, useState } from "react";

type SessionInfo = { ok: boolean; profile?: string; csrfToken?: string };
type ChatMessage = { role: "user" | "assistant"; text: string };

export default function Page() {
  const [auth, setAuth] = useState<SessionInfo | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<{ id: string; hash: string; preview: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    if (!res.ok) {
      setAuth({ ok: false });
      return;
    }
    setAuth(await res.json());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "include",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("Sign in failed");
      return;
    }
    setToken("");
    await refresh();
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setDraft("");
    setMessages((current) => [...current, { role: "user", text }]);
    const res = await fetch(active ? `/eve/v1/session/${active}` : "/eve/v1/session", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok) {
      setError(res.status === 503 ? "Agent unavailable" : "Send failed");
      setBusy(false);
      return;
    }
    const body = (await res.json()) as { sessionId?: string };
    if (body.sessionId) {
      setActive(body.sessionId);
      setSessions((current) => (current.includes(body.sessionId!) ? current : [body.sessionId!, ...current]));
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `?session=${body.sessionId}`);
      }
    }
    setMessages((current) => [...current, { role: "assistant", text: "Turn accepted" }]);
    setBusy(false);
  }

  async function cancel() {
    if (!active) return;
    await fetch(`/eve/v1/session/${active}/cancel`, { method: "POST", credentials: "include" });
    setBusy(false);
  }

  async function decide(decision: "approve" | "deny") {
    if (!approval || !auth?.csrfToken) return;
    await fetch(`/api/approvals/${approval.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-ub-csrf": auth.csrfToken },
      body: JSON.stringify({ decision, actionSha256: approval.hash }),
    });
    setApproval(null);
  }

  if (!auth) {
    return <div className="shell" />;
  }

  if (!auth.ok) {
    return (
      <div className="shell">
        <div className="stage-wrap">
          <main className="stage">
            <form className="login" onSubmit={signIn}>
              <h1 className="wordmark">Useful Bot</h1>
              <div className="field">
                <label htmlFor="device-token">Device token</label>
                <input
                  id="device-token"
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
                <div className="field-error">{error}</div>
              </div>
              <button className="btn btn-primary" type="submit">Sign in</button>
            </form>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="wordmark">Useful Bot</div>
        <button className="btn btn-secondary" type="button" onClick={() => { setActive(null); setMessages([]); }}>
          New session
        </button>
        <nav aria-label="Sessions">
          {sessions.map((id) => (
            <button
              key={id}
              type="button"
              className="nav-item"
              aria-current={id === active ? "page" : undefined}
              onClick={() => setActive(id)}
            >
              {id.slice(0, 8)}
            </button>
          ))}
        </nav>
      </aside>
      <div className="stage-wrap">
        <main className="stage">
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          {approval ? (
            <div className="banner">
              {approval.preview}
              <button className="btn btn-primary" type="button" onClick={() => void decide("approve")}>Approve</button>
              <button className="btn btn-danger" type="button" onClick={() => void decide("deny")}>Deny</button>
            </div>
          ) : null}
          <div className="chat">
            <div className="messages uv-scroll">
              {messages.length === 0 ? <p className="empty">No messages yet.</p> : null}
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`msg msg-${message.role}`}>
                  <div className="msg-meta">{message.role}</div>
                  {message.text}
                </div>
              ))}
            </div>
            <div className="composer">
              <label className="field" style={{ flex: 1, margin: 0 }}>
                <span className="visually-hidden">Message</span>
                <textarea
                  className="input"
                  rows={2}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
              </label>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void send()}>Send</button>
              <button className="btn btn-secondary" type="button" disabled={!busy} onClick={() => void cancel()}>Cancel</button>
            </div>
          </div>
        </main>
      </div>
      <style>{`.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}`}</style>
    </div>
  );
}
