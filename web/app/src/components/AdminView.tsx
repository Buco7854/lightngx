import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type MFAPolicy, type Role } from "../api";
import { KeyIcon, ShieldIcon, UsersIcon } from "../icons";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { Btn, Card, Checkbox, Dropdown, SectionHeading, Spinner } from "../ui";
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
    <div className="min-h-0 flex-1 overflow-auto p-4 min-[761px]:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <Card>
          <SectionHeading
            icon={<ShieldIcon size={18} />}
            title={t.policyTitle}
            hint={policy?.pinned ? t.policyPinned : t.policyIntro}
          />
          <div className="p-5">
            {policy === null ? (
              <Spinner />
            ) : policy.pinned ? (
              <div className="w-fit min-w-[220px] rounded-lg border border-line bg-inset px-3.5 py-2.5 text-[13px] text-dim">
                {summary}
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-dim">{t.policyRolesLabel}</span>
                  <Dropdown
                    ariaLabel={t.policyRolesLabel}
                    align="left"
                    button={<span className="min-w-[160px] text-left">{summary}</span>}
                  >
                    {() => (
                      <>
                        {ROLES.map(({ role, label }) => (
                          <label
                            key={role}
                            className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg px-3 hover:bg-hov-raise"
                          >
                            <Checkbox
                              checked={roles[role]}
                              onChange={() => setRoles({ ...roles, [role]: !roles[role] })}
                              ariaLabel={label}
                            />
                            <span className="text-sm">{label}</span>
                          </label>
                        ))}
                      </>
                    )}
                  </Dropdown>
                </label>
                <Btn variant="primary" onClick={save} disabled={busy}>
                  {busy ? <Spinner light /> : t.savePolicy}
                </Btn>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <SectionHeading icon={<UsersIcon size={18} />} title={t.usersTitle} hint={t.usersHint} />
          <div className="p-5">
            <Users onAuthLost={onAuthLost} embedded />
          </div>
        </Card>

        <Card>
          <SectionHeading icon={<KeyIcon size={18} />} title={t.apiKeysTitle} hint={t.apiKeysIntro} />
          <div className="p-5">
            <ApiKeys onAuthLost={onAuthLost} />
          </div>
        </Card>
      </div>
    </div>
  );
}
