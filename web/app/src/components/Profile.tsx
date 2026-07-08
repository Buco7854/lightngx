import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Credential, type Me, type SessionInfo } from "../api";
import { useConfirm } from "../confirm";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { MonitorIcon, TrashIcon } from "../icons";
import { Btn, Modal, Spinner } from "../ui";
import { Field } from "./auth/fields";
import TOTPPanel from "./mfa/TOTPPanel";
import WebAuthnPanel from "./mfa/WebAuthnPanel";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-panel p-5">
      <h2 className="m-0 mb-4 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function Profile({
  me,
  onChanged,
  onAuthLost,
}: {
  me: Me;
  onChanged: () => void;
  onAuthLost: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const ask = useConfirm();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [adding, setAdding] = useState<"totp" | "webauthn" | null>(null);
  const local = me.method === "local";

  const loadCreds = useCallback(() => {
    if (!local) return;
    api
      .credentials()
      .then((r) => setCreds(r.credentials ?? []))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onAuthLost();
      });
  }, [local, onAuthLost]);

  const loadSessions = useCallback(() => {
    if (!local) return;
    api
      .sessions()
      .then((r) => setSessions(r.sessions ?? []))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onAuthLost();
      });
  }, [local, onAuthLost]);

  useEffect(loadCreds, [loadCreds]);
  useEffect(loadSessions, [loadSessions]);

  async function revokeSession(s: SessionInfo) {
    if (!(await ask({ title: t.revoke, message: t.confirmRevokeSession, danger: true }))) return;
    try {
      await api.revokeSession(s.sid);
      loadSessions();
    } catch {
      toast(t.actionFailed, "error");
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast(t.passwordMismatch, "error");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(cur, next);
      toast(t.passwordChanged);
      setCur("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeTOTP() {
    if (!(await ask({ title: t.remove, message: t.confirmRemoveTOTP, danger: true }))) return;
    try {
      await api.deleteTOTP();
      toast(t.userUpdated);
      onChanged();
    } catch {
      toast(t.actionFailed, "error");
    }
  }

  async function removeKey(c: Credential) {
    if (!(await ask({ title: t.remove, message: t.confirmRemoveKey(c.name), danger: true }))) return;
    try {
      await api.deleteCredential(c.id);
      loadCreds();
      onChanged();
    } catch {
      toast(t.actionFailed, "error");
    }
  }

  if (!local) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-xl text-dim">{t.profile} · SSO</div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6 max-[760px]:p-4">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Section title={t.changePassword}>
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <Field
              label={t.currentPassword}
              type="password"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Field
              label={t.newPassword}
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              placeholder={t.passwordHint}
              required
            />
            <Field
              label={t.confirmPassword}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t.confirmPasswordHint}
              autoComplete="new-password"
              required
            />
            <Btn type="submit" variant="primary" className="self-start" disabled={busy}>
              {busy ? <Spinner /> : t.changePassword}
            </Btn>
          </form>
        </Section>

        <Section title={t.twoFactor}>
          <div className="flex flex-col gap-4">
            {/* TOTP */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t.totpLabel}</div>
                <div className={`text-xs ${me.mfa?.totp ? "text-ok" : "text-dim"}`}>
                  {me.mfa?.totp ? t.totpOn : t.totpOff}
                </div>
              </div>
              {me.mfa?.totp ? (
                <Btn variant="danger" className="min-h-[32px] text-[13px]" onClick={removeTOTP}>
                  <TrashIcon size={14} /> {t.remove}
                </Btn>
              ) : (
                adding !== "totp" && (
                  <Btn className="min-h-[32px] text-[13px]" onClick={() => setAdding("totp")}>
                    {t.enroll}
                  </Btn>
                )
              )}
            </div>
            {adding === "totp" && (
              <Modal title={t.totpLabel} onClose={() => setAdding(null)}>
                <TOTPPanel
                  onDone={() => {
                    setAdding(null);
                    toast(t.enrolled);
                    onChanged();
                  }}
                  onBack={() => setAdding(null)}
                />
              </Modal>
            )}

            <div className="h-px bg-line" />

            {/* Security keys */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{t.securityKeys}</div>
              {adding !== "webauthn" && (
                <Btn className="min-h-[32px] text-[13px]" onClick={() => setAdding("webauthn")}>
                  {t.addKey}
                </Btn>
              )}
            </div>
            {creds.length === 0 && adding !== "webauthn" ? (
              <div className="text-xs text-dim">{t.noKeys}</div>
            ) : (
              <ul className="flex flex-col gap-2">
                {creds.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-lg bg-inset px-3 py-2"
                  >
                    <span className="text-sm">{c.name}</span>
                    <Btn
                      variant="danger"
                      className="min-h-[30px] px-2.5 text-xs"
                      onClick={() => removeKey(c)}
                    >
                      <TrashIcon size={14} /> {t.remove}
                    </Btn>
                  </li>
                ))}
              </ul>
            )}
            {adding === "webauthn" && (
              <Modal title={t.securityKeys} onClose={() => setAdding(null)}>
                <WebAuthnPanel
                  onDone={() => {
                    setAdding(null);
                    loadCreds();
                    onChanged();
                    toast(t.enrolled);
                  }}
                  onBack={() => setAdding(null)}
                />
              </Modal>
            )}
          </div>
        </Section>

        <Section title={t.activeSessions}>
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li
                key={s.sid}
                className="flex items-center justify-between gap-3 rounded-lg bg-inset px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <MonitorIcon size={18} className="shrink-0 text-dim" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {s.browser} · {s.os}
                      </span>
                      {s.current && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[10px] leading-5 text-accent">
                          {t.thisDevice}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-dim">
                      {s.ip} · {t.lastSeen} {new Date(s.lastSeen).toLocaleString()}
                    </div>
                  </div>
                </div>
                {!s.current && (
                  <Btn
                    variant="danger"
                    className="min-h-[30px] shrink-0 px-2.5 text-xs"
                    onClick={() => revokeSession(s)}
                  >
                    {t.revoke}
                  </Btn>
                )}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
