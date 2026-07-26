import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import type { ThemePref } from "../theme";
import { getAssertion } from "../webauthn";
import { Btn, Checkbox, Spinner } from "../ui";
import AuthShell from "./AuthShell";
import { AuthError, Field } from "./auth/fields";

// Login-time second-factor verification for an already-enrolled user.
// Offers whichever methods the account has; success upgrades the session.
export default function VerifyMFA({
  methods,
  onVerified,
  onLogout,
  themePref,
  setThemePref,
}: {
  methods: { totp: boolean; webauthn: boolean };
  onVerified: () => void;
  onLogout: () => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
}) {
  const { t } = useI18n();
  // Prefer the security-key path when it's the only/enrolled method.
  const [mode, setMode] = useState<"totp" | "webauthn">(methods.totp ? "totp" : "webauthn");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);

  async function submitTOTP(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.verifyTOTP(code.trim(), remember);
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.invalidCode);
    } finally {
      setBusy(false);
    }
  }

  async function verifyKey() {
    setBusy(true);
    setError("");
    try {
      const opts = await api.verifyWebAuthnBegin();
      const assertion = await getAssertion(opts);
      await api.verifyWebAuthnFinish(assertion, remember);
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.webauthnFailed);
    } finally {
      setBusy(false);
    }
  }

  const rememberBox = (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-dim select-none">
      <Checkbox
        checked={remember}
        onChange={() => setRemember(!remember)}
        ariaLabel={t.rememberDevice}
      />
      {t.rememberDevice}
    </label>
  );

  return (
    <AuthShell themePref={themePref} setThemePref={setThemePref}>
      <div>
        <h2 className="m-0 text-lg font-semibold tracking-tight">{t.verifyTitle}</h2>
        <p className="mt-1.5 mb-0 text-sm leading-relaxed text-dim">
          {mode === "totp" ? t.verifyIntro : t.webauthnPrompt}
        </p>
      </div>

      {mode === "totp" ? (
        <form onSubmit={submitTOTP} className="flex flex-col gap-3">
          <Field
            label={t.code}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            name="otp"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            required
          />
          {error && <AuthError>{error}</AuthError>}
          {rememberBox}
          <Btn type="submit" variant="primary" size="lg" disabled={busy || code.length < 6}>
            {busy ? <Spinner light /> : t.verify}
          </Btn>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          {error && <AuthError>{error}</AuthError>}
          {rememberBox}
          <Btn variant="primary" size="lg" onClick={verifyKey} disabled={busy}>
            {busy ? <Spinner light /> : t.useSecurityKey}
          </Btn>
        </div>
      )}

      <div className="flex items-center justify-between text-[13px]">
        {methods.totp && methods.webauthn ? (
          <button
            className="cursor-pointer font-medium text-accent-ink hover:underline"
            onClick={() => {
              setError("");
              setMode(mode === "totp" ? "webauthn" : "totp");
            }}
          >
            {mode === "totp" ? t.useSecurityKey : t.useAuthApp}
          </button>
        ) : (
          <span />
        )}
        <button className="cursor-pointer text-dim hover:underline" onClick={onLogout}>
          {t.logout}
        </button>
      </div>
    </AuthShell>
  );
}
