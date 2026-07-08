import { useI18n } from "../i18n";
import type { ThemePref } from "../theme";
import AuthShell from "./AuthShell";
import EnrollFlow from "./mfa/EnrollFlow";

// Forced-enrolment screen shown when a user's role requires MFA but they
// have no second factor yet. Completing enrolment upgrades the session to
// full, and the caller re-fetches /api/me.
export default function EnrollMFA({
  onDone,
  themePref,
  setThemePref,
}: {
  onDone: () => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
}) {
  const { t } = useI18n();
  return (
    <AuthShell themePref={themePref} setThemePref={setThemePref}>
      <div>
        <h2 className="m-0 text-[15px] font-semibold">{t.enrollTitle}</h2>
        <p className="mt-1 mb-0 text-sm text-dim">{t.enrollRequired}</p>
      </div>
      <EnrollFlow onDone={() => onDone()} />
    </AuthShell>
  );
}
