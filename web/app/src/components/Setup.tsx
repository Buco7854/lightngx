import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import type { ThemePref } from "../theme";
import { Btn } from "../ui";
import AuthShell from "./AuthShell";
import { AuthError, Field } from "./auth/fields";

// First-run screen: create the initial admin when no account exists.
export default function Setup({
  onDone,
  themePref,
  setThemePref,
}: {
  onDone: () => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
}) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.setup(username, password);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell themePref={themePref} setThemePref={setThemePref}>
      <div>
        <h2 className="m-0 text-[15px] font-semibold">{t.setupTitle}</h2>
        <p className="mt-1 mb-0 text-sm text-dim">{t.setupIntro}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field
          label={t.username}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
        />
        <Field
          label={t.password}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder={t.passwordHint}
          required
        />
        {error && <AuthError>{error}</AuthError>}
        <Btn type="submit" variant="primary" disabled={busy}>
          {t.createAdmin}
        </Btn>
      </form>
    </AuthShell>
  );
}
