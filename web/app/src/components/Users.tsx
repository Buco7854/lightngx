import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Role, type User } from "../api";
import { useConfirm, usePrompt } from "../confirm";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { KeyIcon, MoreIcon, PlusIcon, ShieldIcon, TrashIcon } from "../icons";
import {
  Avatar,
  Badge,
  Btn,
  Combobox,
  Dropdown,
  Loading,
  MenuItem,
  Modal,
  ModalActions,
  Spinner,
} from "../ui";
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

  if (users === null) return <Loading />;

  const body = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        {!embedded && <h2 className="m-0 text-lg font-semibold tracking-tight">{t.usersTitle}</h2>}
        {embedded && <span className="text-[13px] text-dim">{t.itemsCount(users.length)}</span>}
        {!adding && (
          <Btn variant="primary" onClick={() => setAdding(true)}>
            <PlusIcon size={16} /> {t.addUser}
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
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-dim">{t.role}</span>
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
            <ModalActions>
              <Btn type="button" onClick={() => setAdding(false)}>
                {t.cancel}
              </Btn>
              <Btn type="submit" variant="primary" disabled={busy}>
                {busy ? <Spinner light /> : t.createUser}
              </Btn>
            </ModalActions>
          </form>
        </Modal>
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {users.map((u) => {
          const hasMFA = u.totpEnrolled || u.webauthnCount > 0;
          return (
            <li
              key={u.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-xl border border-line bg-inset px-3 py-2.5"
            >
              <Avatar name={u.username} />
              <div className="flex min-w-[120px] flex-1 flex-col gap-1">
                <span className="truncate font-mono text-sm font-semibold">{u.username}</span>
                <span className="flex items-center gap-1.5">
                  <Badge tone={hasMFA ? "ok" : "neutral"}>
                    <ShieldIcon size={12} />
                    {hasMFA ? t.mfaColumn : `${t.mfaColumn} · ${t.none}`}
                  </Badge>
                </span>
              </div>
              <Combobox
                className="w-[130px] shrink-0"
                value={u.role}
                onChange={(v) => changeRole(u, v as Role)}
                options={[
                  { value: "user", label: t.roleUser },
                  { value: "admin", label: t.roleAdmin },
                ]}
                ariaLabel={t.role}
              />
              <Dropdown
                ariaLabel={`${t.moreActions} ${u.username}`}
                variant="ghost"
                chevron={false}
                button={<MoreIcon size={18} />}
              >
                {(close) => (
                  <>
                    <MenuItem
                      onClick={() => {
                        close();
                        void resetPassword(u);
                      }}
                    >
                      <KeyIcon size={16} /> {t.resetPassword}
                    </MenuItem>
                    {hasMFA && (
                      <MenuItem
                        onClick={() => {
                          close();
                          void resetMFA(u);
                        }}
                      >
                        <ShieldIcon size={16} /> {t.resetMFA}
                      </MenuItem>
                    )}
                    <MenuItem
                      danger
                      onClick={() => {
                        close();
                        void remove(u);
                      }}
                    >
                      <TrashIcon size={16} /> {t.deleteUser}
                    </MenuItem>
                  </>
                )}
              </Dropdown>
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (embedded) return body;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 min-[761px]:p-6">
      <div className="mx-auto max-w-3xl">{body}</div>
    </div>
  );
}
