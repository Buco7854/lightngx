import { useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api, ApiError, type Level } from "../../api";
import { useI18n } from "../../i18n";
import { Btn, Spinner } from "../../ui";
import { AuthError, Field } from "../auth/fields";

// TOTP enrolment: fetches a pending secret, renders its QR, and confirms
// with a code. onDone receives the level returned by the server (which is
// "full" when this completes a forced enrolment).
export default function TOTPPanel({
  onDone,
  onBack,
}: {
  onDone: (level?: Level) => void;
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .totpBegin()
      .then(async (r) => {
        setSecret(r.secret);
        setQr(await QRCode.toDataURL(r.uri, { margin: 1, width: 200 }));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "error"));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.totpConfirm(code.trim());
      onDone(r.level);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.invalidCode);
    } finally {
      setBusy(false);
    }
  }

  if (!qr && !error) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-dim">{t.totpScan}</p>
      {qr && (
        <img
          src={qr}
          alt="TOTP QR"
          width={200}
          height={200}
          className="mx-auto rounded-lg bg-white p-2"
        />
      )}
      <div className="text-center text-xs text-dim">
        {t.totpManual}
        <div className="mt-1 font-mono text-[13px] break-all text-fg select-all">{secret}</div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field
          label={t.code}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          name="otp"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
        {error && <AuthError>{error}</AuthError>}
        <div className="flex gap-2">
          {onBack && (
            <Btn type="button" variant="ghost" onClick={onBack} disabled={busy}>
              {t.back}
            </Btn>
          )}
          <Btn type="submit" variant="primary" className="flex-1" disabled={busy || code.length < 6}>
            {busy ? <Spinner /> : t.enroll}
          </Btn>
        </div>
      </form>
    </div>
  );
}
