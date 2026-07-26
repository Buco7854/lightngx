import { useState, type ReactNode } from "react";
import type { Level } from "../../api";
import { ChevronRightIcon, KeyIcon, MonitorIcon } from "../../icons";
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

  const choice = (
    icon: ReactNode,
    title: string,
    desc: string,
    onClick: () => void,
  ) => (
    <button
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-inset px-3.5 py-3 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel text-dim group-hover:text-accent-ink">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[12.5px] leading-snug text-dim">{desc}</span>
      </span>
      <ChevronRightIcon size={16} className="ml-auto shrink-0 text-faint" />
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-dim">{t.chooseMethod}</p>
      {choice(<MonitorIcon size={19} />, t.methodTOTP, t.methodTOTPDesc, () => setMethod("totp"))}
      {supported() &&
        choice(<KeyIcon size={19} />, t.methodWebAuthn, t.methodWebAuthnDesc, () =>
          setMethod("webauthn"),
        )}
    </div>
  );
}
