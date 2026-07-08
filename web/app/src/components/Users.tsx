import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Role, type User } from "../api";
import { useConfirm, usePrompt } from "../confirm";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { TrashIcon } from "../icons";
import { Btn, Combobox, EmptyState, Modal, Spinner } from "../ui";
import { Field } from "./auth/fields";

export default function Users({
  onAuthLost,
  embedded = false,
}: {
  onAuthLost: () => void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const ask = useConfirm();
  const askPw = usePrompt();
  const [users, setUsers] = useState<User[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [nu, setNu] = useState({ username: "", password: "", role: "user" as Role });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .users()
      .then((r) => setUsers(r.users ?? []))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onAuthLost();
        else toast(t.loadError, "error");
      });
  }, [onAuthLost, toast, t]);

  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createUser(nu.username, nu.password, nu.role);
      toast(t.userCreated);
      setNu({ username: "", password: "", role: "user" });
      setAdding(false);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(u: User, role: Role) {
    try {
      await api.updateUser(u.id, { role });
      toast(t.userUpdated);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    }
  }

  async function resetPassword(u: User) {
    const pw = await askPw({
      title: `${t.resetPassword}: ${u.username}`,
      label: t.newPassword,
      placeholder: t.passwordHint,
      confirmLabel: t.resetPassword,
      type: "password",
      confirm: true,
    });
    if (!pw) return;
    try {
      await api.updateUser(u.id, { password: pw });
      toast(t.userUpdated);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    }
  }

  async function resetMFA(u: User) {
    if (!(await ask({ title: t.resetMFA, message: t.confirmResetMFA(u.username), danger: true }))) return;
    try {
      await api.resetUserMFA(u.id);
      toast(t.mfaWasReset);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    }
  }

  async function remove(u: User) {
    if (!(await ask({ title: t.deleteUser, message: t.confirmDeleteUser(u.username), danger: true })))
      return;
    try {
      await api.deleteUser(u.id);
      toast(t.userDeleted);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    }
  }

  if (users === null) {
    return (
      <EmptyState>
        <Spinner />
      </EmptyState>
    );
  }

  const body = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        {!embedded && <h2 className="m-0 text-lg font-semibold">{t.usersTitle}</h2>}
        {embedded && <span />}
        {!adding && (
          <Btn variant="primary" onClick={() => setAdding(true)}>
            {t.addUser}
          </Btn>
        )}
      </div>

      {adding && (
        <Modal title={t.addUser} onClose={() => setAdding(false)}>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Field
              label={t.username}
              value={nu.username}
              onChange={(e) => setNu({ ...nu, username: e.target.value })}
              autoCapitalize="none"
              autoFocus
              required
            />
            <Field
              label={t.newUserPassword}
              type="password"
              value={nu.password}
              onChange={(e) => setNu({ ...nu, password: e.target.value })}
              placeholder={t.passwordHint}
              required
            />
            <label className="flex flex-col gap-1.5 text-[13px] text-dim">
              {t.role}
              <Combobox
                value={nu.role}
                onChange={(v) => setNu({ ...nu, role: v as Role })}
                options={[
                  { value: "user", label: t.roleUser },
                  { value: "admin", label: t.roleAdmin },
                ]}
                ariaLabel={t.role}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Btn type="button" variant="ghost" onClick={() => setAdding(false)}>
                {t.cancel}
              </Btn>
              <Btn type="submit" variant="primary" disabled={busy}>
                {busy ? <Spinner /> : t.createUser}
              </Btn>
            </div>
          </form>
        </Modal>
        )}

        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-inset px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm font-semibold">{u.username}</div>
                <div className="text-xs text-dim">
                  {t.mfaColumn}: {u.totpEnrolled || u.webauthnCount > 0 ? "✓" : t.none}
                </div>
              </div>
              <Combobox
                className="w-[120px]"
                value={u.role}
                onChange={(v) => changeRole(u, v as Role)}
                options={[
                  { value: "user", label: t.roleUser },
                  { value: "admin", label: t.roleAdmin },
                ]}
                ariaLabel={t.role}
              />
              <Btn className="min-h-[32px] px-2.5 text-[13px]" onClick={() => resetPassword(u)}>
                {t.resetPassword}
              </Btn>
              {(u.totpEnrolled || u.webauthnCount > 0) && (
                <Btn className="min-h-[32px] px-2.5 text-[13px]" onClick={() => resetMFA(u)}>
                  {t.resetMFA}
                </Btn>
              )}
              <Btn
                variant="danger"
                className="min-h-[32px] px-2.5 text-[13px]"
                onClick={() => remove(u)}
              >
                <TrashIcon size={14} /> {t.remove}
              </Btn>
            </li>
          ))}
        </ul>
    </div>
  );

  if (embedded) return body;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6 max-[760px]:p-4">
      <div className="mx-auto max-w-3xl">{body}</div>
    </div>
  );
}
