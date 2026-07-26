import { useState } from "react";
import { api, ApiError, type Role } from "../api";
import { ShieldIcon } from "../icons";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { Btn, Checkbox, Spinner } from "../ui";

// Blocking overlay shown to an admin who hasn't decided the MFA policy yet
// (and it isn't env-pinned). It must be resolved before using the app.
export default function PolicyPrompt({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [roles, setRoles] = useState<Record<Role, boolean>>({ admin: true, user: false });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const required = (Object.keys(roles) as Role[]).filter((r) => roles[r]);
      await api.setPolicy(required);
      toast(t.policySaved);
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    } finally {
      setBusy(false);
    }
  }

  const Row = ({ role, label }: { role: Role; label: string }) => (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-inset px-3.5 py-3 transition-colors hover:border-accent/40">
      <Checkbox
        checked={roles[role]}
        onChange={() => setRoles({ ...roles, [role]: !roles[role] })}
        ariaLabel={label}
      />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );

  return (
    <div className="anim-fade fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div className="anim-rise flex w-full max-w-md flex-col gap-4 rounded-2xl border border-line bg-raise p-6 elev-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
            <ShieldIcon size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-base font-semibold tracking-tight">{t.policyTitle}</h2>
            <p className="mt-1.5 mb-0 text-[13.5px] leading-relaxed text-dim">{t.policyIntro}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Row role="admin" label={t.requireForAdmins} />
          <Row role="user" label={t.requireForUsers} />
        </div>
        <Btn variant="primary" size="lg" onClick={save} disabled={busy}>
          {busy ? <Spinner light /> : t.savePolicy}
        </Btn>
      </div>
    </div>
  );
}
