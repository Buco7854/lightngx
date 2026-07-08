import { useState } from "react";
import type { Level } from "../../api";
import { useI18n } from "../../i18n";
import { supported } from "../../webauthn";
import TOTPPanel from "./TOTPPanel";
import WebAuthnPanel from "./WebAuthnPanel";

type Method = "totp" | "webauthn";

// Method chooser + the chosen panel. The panels expose a Back button that
// returns here — the choice is reversible right up until a factor is
// validated, at which point onDone fires.
export default function EnrollFlow({ onDone }: { onDone: (level?: Level) => void }) {
  const { t } = useI18n();
  const [method, setMethod] = useState<Method | null>(null);

  if (method === "totp") {
    return <TOTPPanel onDone={onDone} onBack={() => setMethod(null)} />;
  }
  if (method === "webauthn") {
    return <WebAuthnPanel onDone={onDone} onBack={() => setMethod(null)} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-dim">{t.chooseMethod}</p>
      <button
        onClick={() => setMethod("totp")}
        className="flex cursor-pointer flex-col gap-0.5 rounded-lg bg-ctrl px-4 py-3 text-left transition-colors hover:bg-ctrl-hi"
      >
        <span className="text-sm font-semibold">{t.methodTOTP}</span>
        <span className="text-xs text-dim">{t.methodTOTPDesc}</span>
      </button>
      {supported() && (
        <button
          onClick={() => setMethod("webauthn")}
          className="flex cursor-pointer flex-col gap-0.5 rounded-lg bg-ctrl px-4 py-3 text-left transition-colors hover:bg-ctrl-hi"
        >
          <span className="text-sm font-semibold">{t.methodWebAuthn}</span>
          <span className="text-xs text-dim">{t.methodWebAuthnDesc}</span>
        </button>
      )}
    </div>
  );
}
