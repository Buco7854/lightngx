import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type NginxStatus } from "../api";
import { useConfirm } from "../confirm";
import { CheckIcon, GlobeIcon, MenuIcon, MonitorIcon, MoonIcon, SunIcon } from "../icons";
import { useI18n, type Lang } from "../i18n";
import { navigate } from "../router";
import { resolveTheme, type ThemePref } from "../theme";
import { useToast } from "../toast";
import { Btn, Dropdown, Logo, MenuItem, StatusDot } from "../ui";
import { useOutput } from "./OutputPanel";

export function useNginxStatus() {
  const [status, setStatus] = useState<NginxStatus | null>(null);
  const refresh = useCallback(() => {
    api.status().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);
  return { status, refresh };
}

export default function Navbar({
  status,
  refreshStatus,
  themePref,
  setThemePref,
  onMenu,
}: {
  status: NginxStatus | null;
  refreshStatus: () => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
  onMenu: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const output = useOutput();
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);

  async function run(kind: "test" | "reload" | "restart") {
    if (kind === "reload" && !(await ask({ title: t.reload, message: t.confirmReload }))) return;
    if (kind === "restart" && !(await ask({ title: t.restart, message: t.confirmRestart, danger: true }))) return;
    setBusy(true);
    try {
      const res = await api[kind]();
      if (kind === "test") {
        toast(res.ok ? t.testOK : t.testFailed, res.ok ? "info" : "error");
        output(t.output, res.output ?? "");
      } else {
        toast(kind === "reload" ? t.reloaded : t.restarted);
      }
    } catch (err) {
      toast(t.actionFailed, "error");
      if (err instanceof ApiError) output(t.output, err.output ?? err.message);
    } finally {
      setBusy(false);
      refreshStatus();
    }
  }

  const themeIcon =
    themePref === "system" ? <MonitorIcon /> : resolveTheme(themePref) === "dark" ? <MoonIcon /> : <SunIcon />;

  const themeItem = (pref: ThemePref, icon: React.ReactNode, label: string, close: () => void) => (
    <MenuItem
      onClick={() => {
        setThemePref(pref);
        close();
      }}
    >
      {icon} {label}
      {themePref === pref && <CheckIcon className="ml-auto text-accent" />}
    </MenuItem>
  );

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 min-[761px]:px-5">
      <Btn
        variant="ghost"
        className="min-h-[40px] min-w-[40px] px-2 min-[761px]:hidden"
        onClick={onMenu}
        aria-label={t.menu}
      >
        <MenuIcon size={18} />
      </Btn>
      <button
        onClick={() => navigate("/config")}
        className="flex cursor-pointer items-center gap-2 min-[761px]:hidden"
        aria-label={t.appName}
      >
        <Logo className="h-5 w-5" />
      </button>

      <span className="flex-1" />

      {/* nginx status + actions */}
      <Dropdown
        ariaLabel="nginx"
        button={
          <>
            <StatusDot on={!!status?.running} />
            <span className={status?.running ? "" : "text-danger"}>
              {status?.running ? t.running : t.stopped}
            </span>
            {status?.version && (
              <span className="text-dim max-[760px]:hidden">· {status.version}</span>
            )}
          </>
        }
      >
        {(close) => (
          <>
            <MenuItem disabled={busy} onClick={() => { close(); void run("test"); }}>
              <CheckIcon /> {t.test}
            </MenuItem>
            <MenuItem disabled={busy} onClick={() => { close(); void run("reload"); }}>
              <span aria-hidden>⟳</span> {t.reload}
            </MenuItem>
            <MenuItem danger disabled={busy} onClick={() => { close(); void run("restart"); }}>
              <span aria-hidden>⏻</span> {t.restart}
            </MenuItem>
          </>
        )}
      </Dropdown>

      {/* Theme: sun / moon / system */}
      <Dropdown ariaLabel={t.theme} button={themeIcon}>
        {(close) => (
          <>
            {themeItem("light", <SunIcon />, t.themeLight, close)}
            {themeItem("dark", <MoonIcon />, t.themeDark, close)}
            {themeItem("system", <MonitorIcon />, t.themeSystem, close)}
          </>
        )}
      </Dropdown>

      {/* Language */}
      <Dropdown ariaLabel={t.language} button={<GlobeIcon />}>
        {(close) => (
          <>
            {(["en", "fr"] as Lang[]).map((l) => (
              <MenuItem
                key={l}
                onClick={() => {
                  setLang(l);
                  close();
                }}
              >
                {l === "en" ? "English" : "Français"}
                {lang === l && <CheckIcon className="ml-auto text-accent" />}
              </MenuItem>
            ))}
          </>
        )}
      </Dropdown>
    </header>
  );
}
