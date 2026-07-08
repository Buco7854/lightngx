import type { ReactNode } from "react";
import { useI18n, type Lang } from "../i18n";
import type { ThemePref } from "../theme";
import { Combobox, Logo } from "../ui";

// Full-screen centered card used by every pre-app screen (setup, login,
// MFA verify, forced enrolment), with the theme/language controls.
export default function AuthShell({
  themePref,
  setThemePref,
  children,
  wide = false,
}: {
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="flex flex-1 items-center justify-center p-5">
      <div
        className={`flex w-full flex-col gap-4 rounded-xl bg-panel p-7 shadow-xl ${
          wide ? "max-w-md" : "max-w-sm"
        }`}
      >
        <h1 className="m-0 flex items-center gap-2.5 text-xl font-bold">
          <Logo className="h-7 w-7" />
          {t.appName}
        </h1>
        {children}
        <div className="mt-1 flex gap-2">
          <Combobox
            className="flex-1"
            value={themePref}
            onChange={(v) => setThemePref(v as ThemePref)}
            options={[
              { value: "light", label: t.themeLight },
              { value: "dark", label: t.themeDark },
              { value: "system", label: t.themeSystem },
            ]}
            ariaLabel={t.theme}
          />
          <Combobox
            className="flex-1"
            value={lang}
            onChange={(v) => setLang(v as Lang)}
            options={[
              { value: "en", label: "English" },
              { value: "fr", label: "Français" },
            ]}
            ariaLabel={t.language}
          />
        </div>
      </div>
    </div>
  );
}
