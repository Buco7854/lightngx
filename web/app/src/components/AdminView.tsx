import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type MFAPolicy, type Role } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { Btn, Dropdown, Spinner } from "../ui";
import ApiKeys from "./ApiKeys";
import Users from "./Users";

// Admin settings: MFA policy editor + user management, on one page.
export default function AdminView({ onAuthLost }: { onAuthLost: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [policy, setPolicy] = useState<MFAPolicy | null>(null);
  const [roles, setRoles] = useState<Record<Role, boolean>>({ admin: true, user: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .getPolicy()
      .then((p) => {
        setPolicy(p);
        setRoles({
          admin: p.requiredRoles?.includes("admin") ?? false,
          user: p.requiredRoles?.includes("user") ?? false,
        });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onAuthLost();
      });
  }, [onAuthLost]);

  useEffect(load, [load]);

  async function save() {
    setBusy(true);
    try {
      const required = (Object.keys(roles) as Role[]).filter((r) => roles[r]);
      await api.setPolicy(required);
      toast(t.policySaved);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    } finally {
      setBusy(false);
    }
  }

  const ROLES: { role: Role; label: string }[] = [
    { role: "admin", label: t.roleAdmin },
    { role: "user", label: t.roleUser },
  ];
  const selected = ROLES.filter((r) => roles[r.role]);
  const summary =
    selected.length === 0 ? t.policyRolesNone : selected.map((r) => r.label).join(", ");

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6 max-[760px]:p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <section className="rounded-xl bg-panel p-5">
          <h2 className="m-0 mb-1.5 text-[15px] font-semibold">{t.policyTitle}</h2>
          <p className="mt-0 mb-4 text-sm text-dim">{policy?.pinned ? t.policyPinned : t.policyIntro}</p>
          {policy === null ? (
            <Spinner />
          ) : policy.pinned ? (
            <div className="w-fit min-w-[220px] rounded-md bg-ctrl px-3 py-2 text-[13px] text-dim opacity-70">
              {summary}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <label className="text-[13px] text-dim">{t.policyRolesLabel}</label>
              <Dropdown
                ariaLabel={t.policyRolesLabel}
                align="left"
                button={<span className="min-w-[160px] text-left">{summary}</span>}
              >
                {() => (
                  <div className="flex flex-col">
                    {ROLES.map(({ role, label }) => (
                      <label
                        key={role}
                        className="flex min-h-[38px] cursor-pointer items-center gap-2.5 rounded-md px-3 hover:bg-ctrl"
                      >
                        <input
                          type="checkbox"
                          checked={roles[role]}
                          onChange={(e) => setRoles({ ...roles, [role]: e.target.checked })}
                          className="h-4 w-4 accent-accent"
                        />
                        <span className="text-[13px]">{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </Dropdown>
              <Btn variant="primary" onClick={save} disabled={busy}>
                {busy ? <Spinner /> : t.savePolicy}
              </Btn>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-panel p-5">
          <h2 className="m-0 mb-4 text-[15px] font-semibold">{t.usersTitle}</h2>
          <Users onAuthLost={onAuthLost} embedded />
        </section>

        <section className="rounded-xl bg-panel p-5">
          <h2 className="m-0 mb-1.5 text-[15px] font-semibold">{t.apiKeysTitle}</h2>
          <p className="mt-0 mb-4 text-sm text-dim">{t.apiKeysIntro}</p>
          <ApiKeys onAuthLost={onAuthLost} />
        </section>
      </div>
    </div>
  );
}
