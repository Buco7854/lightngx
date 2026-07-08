import { useState } from "react";
import { api, ApiError, type Role } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { Btn, Spinner } from "../ui";

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
    <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-ctrl px-4 py-3">
      <input
        type="checkbox"
        checked={roles[role]}
        onChange={(e) => setRoles({ ...roles, [role]: e.target.checked })}
        className="h-4 w-4 accent-accent"
      />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-panel p-6 shadow-2xl">
        <div>
          <h2 className="m-0 text-lg font-semibold">{t.policyTitle}</h2>
          <p className="mt-1.5 mb-0 text-sm text-dim">{t.policyIntro}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Row role="admin" label={t.requireForAdmins} />
          <Row role="user" label={t.requireForUsers} />
        </div>
        <Btn variant="primary" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : t.savePolicy}
        </Btn>
      </div>
    </div>
  );
}
