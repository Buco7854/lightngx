import type { ReactNode } from "react";
import { ShieldIcon, CheckIcon, GlobeIcon, MonitorIcon, MoonIcon, SunIcon } from "../icons";
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
    <div className="auth-screen relative flex flex-1 items-center justify-center">
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

      <div className="auth-layout">
        <section className="auth-brand">
          <div className="flex items-center gap-2.5"><Logo className="h-8 w-8" /><span className="text-[22px] font-semibold tracking-tight">{t.appName}</span></div>
          <div><div className="auth-statement">{t.authHeadline}</div><p>{t.authDescription}</p></div>
          <div className="auth-proof"><ShieldIcon size={16} />{t.guardedChanges}</div>
        </section>
        <div className={wide ? "auth-form-wrap auth-wide" : "auth-form-wrap"}>
          <div className="auth-mobile-brand"><Logo className="h-8 w-8" />{t.appName}</div>
          <Card className="auth-form flex flex-col gap-6">{children}</Card>
          <div className="auth-footer">{t.authFooter}</div>
        </div>
      </div>
    </div>
  );
}
