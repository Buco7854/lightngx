import type { ReactNode } from "react";
import { CheckIcon, GlobeIcon, MonitorIcon, MoonIcon, SunIcon } from "../icons";
import { useI18n, type Lang } from "../i18n";
import { resolveTheme, type ThemePref } from "../theme";
import { Card, Dropdown, Logo, MenuItem, MenuLabel } from "../ui";

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

  const themeIcon =
    themePref === "system" ? (
      <MonitorIcon size={18} />
    ) : resolveTheme(themePref) === "dark" ? (
      <MoonIcon size={18} />
    ) : (
      <SunIcon size={18} />
    );

  const themeItem = (pref: ThemePref, icon: ReactNode, label: string, close: () => void) => (
    <MenuItem
      onClick={() => {
        setThemePref(pref);
        close();
      }}
    >
      {icon} {label}
      {themePref === pref && <CheckIcon size={15} className="ml-auto !text-accent-ink" />}
    </MenuItem>
  );

  return (
    <div className="auth-backdrop relative flex flex-1 items-center justify-center p-5">
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <Dropdown ariaLabel={t.theme} variant="ghost" chevron={false} button={themeIcon}>
          {(close) => (
            <>
              <MenuLabel>{t.theme}</MenuLabel>
              {themeItem("light", <SunIcon size={16} />, t.themeLight, close)}
              {themeItem("dark", <MoonIcon size={16} />, t.themeDark, close)}
              {themeItem("system", <MonitorIcon size={16} />, t.themeSystem, close)}
            </>
          )}
        </Dropdown>
        <Dropdown
          ariaLabel={t.language}
          variant="ghost"
          chevron={false}
          button={<GlobeIcon size={18} />}
        >
          {(close) => (
            <>
              <MenuLabel>{t.language}</MenuLabel>
              {(["en", "fr"] as Lang[]).map((l) => (
                <MenuItem
                  key={l}
                  onClick={() => {
                    setLang(l);
                    close();
                  }}
                >
                  {l === "en" ? "English" : "Français"}
                  {lang === l && <CheckIcon size={15} className="ml-auto !text-accent-ink" />}
                </MenuItem>
              ))}
            </>
          )}
        </Dropdown>
      </div>

      <div className={`flex w-full flex-col gap-5 ${wide ? "max-w-md" : "max-w-sm"}`}>
        <div className="flex items-center justify-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="text-[22px] leading-none font-bold tracking-tight">{t.appName}</span>
        </div>
        <Card className="flex flex-col gap-4 p-6 elev-3 min-[420px]:p-7">{children}</Card>
      </div>
    </div>
  );
}
