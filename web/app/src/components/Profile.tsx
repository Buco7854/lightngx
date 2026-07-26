import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Credential, type Me, type SessionInfo } from "../api";
import { useConfirm } from "../confirm";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { KeyIcon, LockIcon, MonitorIcon, PlusIcon, ShieldIcon, TrashIcon } from "../icons";
import { Badge, Btn, Card, Modal, SectionHeading, Spinner } from "../ui";
import { Field } from "./auth/fields";
import TOTPPanel from "./mfa/TOTPPanel";
import WebAuthnPanel from "./mfa/WebAuthnPanel";

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
      <div className="min-h-0 flex-1 overflow-auto p-4 min-[761px]:p-6">
        <Card className="mx-auto max-w-xl px-5 py-4 text-sm text-dim">{t.profile} · SSO</Card>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 min-[761px]:p-6">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <Card>
          <SectionHeading
            icon={<LockIcon size={18} />}
            title={t.changePassword}
            hint={t.changePasswordHint}
          />
          <form onSubmit={changePassword} className="flex flex-col gap-3.5 p-5">
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
            <Btn type="submit" variant="primary" className="mt-1 self-start" disabled={busy}>
              {busy ? <Spinner light /> : t.changePassword}
            </Btn>
          </form>
        </Card>

        <Card>
          <SectionHeading icon={<ShieldIcon size={18} />} title={t.twoFactor} hint={t.twoFactorHint} />
          <div className="flex flex-col gap-4 p-5">
            {/* TOTP */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-inset px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ctrl text-dim">
                  <MonitorIcon size={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{t.totpLabel}</div>
                  <Badge tone={me.mfa?.totp ? "ok" : "neutral"} className="mt-1">
                    {me.mfa?.totp ? t.totpOn : t.totpOff}
                  </Badge>
                </div>
              </div>
              {me.mfa?.totp ? (
                <Btn size="sm" variant="danger" onClick={removeTOTP}>
                  <TrashIcon size={14} /> {t.remove}
                </Btn>
              ) : (
                adding !== "totp" && (
                  <Btn size="sm" onClick={() => setAdding("totp")}>
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

            {/* Security keys */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold">{t.securityKeys}</div>
              {adding !== "webauthn" && (
                <Btn size="sm" onClick={() => setAdding("webauthn")}>
                  <PlusIcon size={15} /> {t.addKey}
                </Btn>
              )}
            </div>
            {creds.length === 0 && adding !== "webauthn" ? (
              <p className="m-0 rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-dim">
                {t.noKeys}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {creds.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-inset px-3.5 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <KeyIcon size={16} className="shrink-0 text-faint" />
                      <span className="truncate text-sm font-medium">{c.name}</span>
                    </span>
                    <Btn size="sm" variant="danger" className="shrink-0" onClick={() => removeKey(c)}>
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
        </Card>

        <Card>
          <SectionHeading
            icon={<MonitorIcon size={18} />}
            title={t.activeSessions}
            hint={t.activeSessionsHint}
          />
          <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
            {sessions.map((s) => (
              <li key={s.sid} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ctrl text-dim">
                    <MonitorIcon size={17} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {s.browser} · {s.os}
                      </span>
                      {s.current && <Badge tone="accent">{t.thisDevice}</Badge>}
                    </div>
                    <div className="truncate text-[12px] text-faint">
                      {s.ip} · {t.lastSeen} {new Date(s.lastSeen).toLocaleString()}
                    </div>
                  </div>
                </div>
                {!s.current && (
                  <Btn size="sm" variant="danger" className="shrink-0" onClick={() => revokeSession(s)}>
                    {t.revoke}
                  </Btn>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
