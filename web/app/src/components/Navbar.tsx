import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type NginxStatus } from "../api";
import { useConfirm } from "../confirm";
import {
  CheckIcon,
  GlobeIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  PowerIcon,
  RefreshIcon,
  SunIcon,
} from "../icons";
import { useI18n, type Lang } from "../i18n";
import { Link } from "../router";
import { resolveTheme, type ThemePref } from "../theme";
import { useToast } from "../toast";
import { Dropdown, IconBtn, Logo, MenuItem, MenuLabel, MenuSep, PageTitle, StatusDot } from "../ui";
import { useOutput } from "./OutputPanel";

// The status has three states, not two: null means "not known yet", which is
// where a cold load and a failed poll both start. Rendering that as stopped
// is what made the badge flash red on load and stay red after the tab came
// back from being hidden.
export function useNginxStatus() {
  const [status, setStatus] = useState<NginxStatus | null>(null);
  // One failed poll is a blip (asleep, offline, server restarting): keep the
  // last known state. Two in a row and we admit we do not know.
  const fails = useRef(0);
  const refresh = useCallback(() => {
    api
      .status()
      .then((s) => {
        fails.current = 0;
        setStatus(s);
      })
      .catch(() => {
        if (++fails.current >= 2) setStatus(null);
      });
  }, []);

  useEffect(() => {
    const poll = () => {
      if (!document.hidden) refresh();
    };
    poll();
    const id = setInterval(poll, 10000);
    // Returning to the tab, or to the network, refreshes now instead of
    // showing a stale badge until the next tick.
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("focus", poll);
    window.addEventListener("online", poll);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", poll);
    };
  }, [refresh]);

  return { status, refresh };
}

export default function Navbar({
  title,
  home,
  status,
  refreshStatus,
  themePref,
  setThemePref,
  onMenu,
}: {
  title: string;
  home: string;
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

  // waitForNginx polls the status endpoint until nginx reports up, so a
  // restart can notify the moment it is back rather than optimistically.
  async function waitForNginx(): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        if ((await api.status()).running) return true;
      } catch {
        /* keep polling */
      }
    }
    return false;
  }

  async function run(kind: "test" | "reload" | "restart") {
    if (kind === "reload" && !(await ask({ title: t.reload, message: t.confirmReload }))) return;
    if (kind === "restart" && !(await ask({ title: t.restart, message: t.confirmRestart, danger: true }))) return;
    setBusy(true);
    try {
      const res = await api[kind]();
      if (kind === "test") {
        toast(res.ok ? t.testOK : t.testFailed, res.ok ? "info" : "error");
        output(t.output, res.output ?? "");
      } else if (kind === "reload") {
        toast(t.reloaded);
      } else {
        toast(t.restarting);
        const back = await waitForNginx();
        toast(back ? t.nginxBack : t.restartSlow, back ? "info" : "warn");
      }
    } catch (err) {
      toast(t.actionFailed, "error");
      if (err instanceof ApiError) output(t.output, err.output ?? err.message);
    } finally {
      setBusy(false);
      refreshStatus();
    }
  }

  const running = status?.running === true;
  const unknown = status === null;
  const themeIcon =
    themePref === "system" ? (
      <MonitorIcon size={18} />
    ) : resolveTheme(themePref) === "dark" ? (
      <MoonIcon size={18} />
    ) : (
      <SunIcon size={18} />
    );

  const themeItem = (pref: ThemePref, icon: React.ReactNode, label: string, close: () => void) => (
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
    <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-line bg-panel px-3 min-[761px]:px-5">
      <IconBtn className="min-[761px]:hidden" onClick={onMenu} aria-label={t.menu}>
        <MenuIcon size={20} />
      </IconBtn>
      <Link
        href={`/${home}`}
        className="flex shrink-0 cursor-pointer items-center gap-2 min-[761px]:hidden"
        aria-label={t.appName}
      >
        <Logo className="h-6 w-6" />
      </Link>

      <PageTitle className="min-w-0 flex-1 max-[760px]:hidden">{title}</PageTitle>
      <span className="flex-1 min-[761px]:hidden" />

      {/* nginx status + actions */}
      <Dropdown
        ariaLabel="nginx"
        className="min-w-0"
        button={
          <>
            <StatusDot on={running} tone={unknown ? "neutral" : undefined} />
            <span
              className={`truncate font-medium ${
                unknown ? "text-faint" : running ? "" : "text-danger-ink"
              }`}
            >
              {unknown ? t.statusUnknown : running ? t.running : t.stopped}
            </span>
            {status?.version && (
              <span className="font-mono text-[12px] text-faint max-[900px]:hidden">
                {status.version}
              </span>
            )}
          </>
        }
      >
        {(close) => (
          <>
            <MenuLabel>nginx</MenuLabel>
            <MenuItem disabled={busy} onClick={() => { close(); void run("test"); }}>
              <CheckIcon size={16} /> {t.test}
            </MenuItem>
            <MenuItem disabled={busy} onClick={() => { close(); void run("reload"); }}>
              <RefreshIcon size={16} /> {t.reload}
            </MenuItem>
            <MenuSep />
            <MenuItem danger disabled={busy} onClick={() => { close(); void run("restart"); }}>
              <PowerIcon size={16} /> {t.restart}
            </MenuItem>
          </>
        )}
      </Dropdown>

      {/* Theme: sun / moon / system */}
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

      {/* Language */}
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
    </header>
  );
}
