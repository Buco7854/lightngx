import { useState } from "react";
import { api, ApiError, type Level } from "../../api";
import { useI18n } from "../../i18n";
import { createCredential, supported } from "../../webauthn";
import { Btn, Spinner } from "../../ui";
import { AuthError, Field } from "../auth/fields";

// WebAuthn enrolment: registers a new credential via the browser API.
export default function WebAuthnPanel({
  onDone,
  onBack,
}: {
  onDone: (level?: Level) => void;
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function register() {
    setBusy(true);
    setError("");
    try {
      const opts = await api.webauthnRegisterBegin();
      const cred = await createCredential(opts);
      const r = await api.webauthnRegisterFinish(name.trim() || "Security key", cred);
      onDone(r.level);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else if (err instanceof DOMException) setError(t.webauthnRegisterFailed);
      else setError(t.webauthnRegisterFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!supported()) {
    return (
      <div className="flex flex-col gap-3">
        <AuthError>{t.webauthnUnsupported}</AuthError>
        {onBack && (
          <Btn variant="ghost" onClick={onBack}>
            {t.back}
          </Btn>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-dim">{t.webauthnPrompt}</p>
      <Field
        label={t.webauthnName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="YubiKey, iPhone…"
        maxLength={40}
      />
      {error && <AuthError>{error}</AuthError>}
      <div className="flex gap-2">
        {onBack && (
          <Btn type="button" variant="ghost" onClick={onBack} disabled={busy}>
            {t.back}
          </Btn>
        )}
        <Btn variant="primary" className="flex-1" onClick={register} disabled={busy}>
          {busy ? <Spinner /> : t.webauthnRegister}
        </Btn>
      </div>
    </div>
  );
}
