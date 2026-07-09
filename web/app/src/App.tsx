import { useCallback, useEffect, useMemo, useState } from "react";
import { api, setUnauthorizedHandler, type AppConfig, type Me } from "./api";
import { ConfirmProvider } from "./confirm";
import { navigate, useLocation } from "./router";
import { detectLang, I18nContext, translations, useI18n, type Lang } from "./i18n";
import { applyThemePref, detectThemePref, watchSystemTheme, type ThemePref } from "./theme";
import { ToastProvider, useToast } from "./toast";
import AdminView from "./components/AdminView";
import AppSidebar, { type View } from "./components/AppSidebar";
import ConfigView from "./components/ConfigView";
import EnrollMFA from "./components/EnrollMFA";
import Login from "./components/Login";
import LogsView from "./components/LogsView";
import Navbar, { useNginxStatus } from "./components/Navbar";
import { OutputProvider } from "./components/OutputPanel";
import { Btn } from "./ui";
import PolicyPrompt from "./components/PolicyPrompt";
import Profile from "./components/Profile";
import Setup from "./components/Setup";
import VerifyMFA from "./components/VerifyMFA";
import VhostsView from "./components/VhostsView";

const VIEWS: View[] = ["config", "sites", "streams", "logs", "profile", "admin"];
const AUTH_PATHS = ["/setup", "/login", "/verify", "/enroll"];

// Map a URL path to an app view, or null when it matches no known view
// (rendered as a 404). "/" is normalised to config by the redirect effect.
function pathToView(pathname: string): View | null {
  const seg = pathname.replace(/^\/+/, "").split("/")[0];
  if (seg === "") return "config";
  return (VIEWS as string[]).includes(seg) ? (seg as View) : null;
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const [themePref, setThemePrefState] = useState<ThemePref>(detectThemePref);
  const [booted, setBooted] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const loc = useLocation();

  useEffect(() => applyThemePref(themePref), [themePref]);
  useEffect(() => watchSystemTheme(() => themePref), [themePref]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem("ln_lang", l);
    setLangState(l);
  }, []);
  const i18n = useMemo(() => ({ lang, t: translations[lang], setLang }), [lang, setLang]);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.me());
      setNeedsSetup(false);
    } catch {
      setMe(null);
    }
  }, []);

  const onAuthLost = useCallback(() => setMe(null), []);

  const boot = useCallback(async () => {
    try {
      const st = await api.authStatus();
      if (st.bootstrap) {
        setNeedsSetup(true);
        setMe(null);
      } else {
        await loadMe();
      }
    } catch {
      setMe(null);
    } finally {
      setBooted(true);
    }
  }, [loadMe]);

  useEffect(() => {
    boot();
  }, [boot]);

  const logout = useCallback(() => {
    api.logout().finally(() => {
      setMe(null);
      boot();
    });
  }, [boot]);

  const themeProps = { themePref, setThemePref: setThemePrefState };

  // The auth state dictates which pre-app screen (if any) shows; give each
  // its own URL. When authed, the app view comes from the path instead.
  const authPath = !booted
    ? null
    : needsSetup
      ? "/setup"
      : me === null
        ? "/login"
        : me.level === "mfa"
          ? "/verify"
          : me.level === "enroll"
            ? "/enroll"
            : null;

  useEffect(() => {
    if (!booted) return;
    if (authPath) {
      if (loc.pathname !== authPath) navigate(authPath, { replace: true });
    } else if (loc.pathname === "/" || AUTH_PATHS.includes(loc.pathname)) {
      navigate("/config", { replace: true });
    }
  }, [booted, authPath, loc.pathname]);

  let screen: React.ReactNode;
  if (!booted) {
    screen = null;
  } else if (needsSetup) {
    screen = <Setup onDone={loadMe} {...themeProps} />;
  } else if (me === null) {
    screen = <Login onAuthed={loadMe} {...themeProps} />;
  } else if (me.level === "mfa") {
    screen = (
      <VerifyMFA
        methods={me.mfa ?? { totp: false, webauthn: false }}
        onVerified={loadMe}
        onLogout={logout}
        {...themeProps}
      />
    );
  } else if (me.level === "enroll") {
    screen = <EnrollMFA onDone={loadMe} {...themeProps} />;
  } else {
    screen = (
      <OutputProvider>
        <Shell
          me={me}
          view={pathToView(loc.pathname)}
          reloadMe={loadMe}
          onAuthLost={onAuthLost}
          themePref={themePref}
          setThemePref={setThemePrefState}
          onLogout={logout}
        />
      </OutputProvider>
    );
  }

  return (
    <I18nContext.Provider value={i18n}>
      <ToastProvider>
        <ConfirmProvider>
          <div className="flex h-full flex-col" style={{ height: "100dvh" }}>
            {screen}
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </I18nContext.Provider>
  );
}

function Shell({
  me,
  view,
  reloadMe,
  onAuthLost,
  themePref,
  setThemePref,
  onLogout,
}: {
  me: Me;
  view: View | null;
  reloadMe: () => void;
  onAuthLost: () => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const setView = useCallback((v: View) => navigate(`/${v}`), []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { status, refresh: refreshStatus } = useNginxStatus();
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    api.appConfig().then(setAppConfig).catch(() => setAppConfig(null));
  }, []);
  const defaultReload = appConfig?.defaultReloadOnSave ?? true;

  // While the app is mounted, any 401 means the session was revoked or
  // expired: drop to the login screen instead of leaving a broken shell.
  useEffect(() => {
    let done = false;
    setUnauthorizedHandler(() => {
      if (done) return;
      done = true;
      toast(t.sessionExpired, "warn");
      onAuthLost();
    });
    return () => setUnauthorizedHandler(null);
  }, [t, toast, onAuthLost]);

  const needsPolicy =
    me.role === "admin" && !!me.policy && !me.policy.decided && !me.policy.pinned;

  const isAdmin = me.role === "admin";
  // Unknown path, or admin-only view for a non-admin: neither maps to a
  // renderable view, so show a 404 rather than a blank pane.
  const notFound = view === null || (view === "admin" && !isAdmin);

  return (
    <div className="flex min-h-0 flex-1">
      {needsPolicy && <PolicyPrompt onDone={reloadMe} />}
      <AppSidebar
        view={notFound ? null : view}
        setView={setView}
        isAdmin={isAdmin}
        user={me.user}
        onLogout={onLogout}
        showSites
        showStreams
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Navbar
          status={status}
          refreshStatus={refreshStatus}
          themePref={themePref}
          setThemePref={setThemePref}
          onMenu={() => setSidebarOpen(true)}
        />
        <main className="flex min-h-0 min-w-0 flex-1">
          {notFound ? (
            <NotFound onHome={() => navigate("/config")} />
          ) : (
            <>
              {view === "config" && (
                <ConfigView onAuthLost={onAuthLost} defaultReload={defaultReload} />
              )}
              {view === "sites" && (
                <VhostsView kind="sites" onAuthLost={onAuthLost} defaultReload={defaultReload} />
              )}
              {view === "streams" && (
                <VhostsView kind="streams" onAuthLost={onAuthLost} defaultReload={defaultReload} />
              )}
              {view === "logs" && <LogsView onAuthLost={onAuthLost} />}
              {view === "profile" && <Profile me={me} onChanged={reloadMe} onAuthLost={onAuthLost} />}
              {view === "admin" && isAdmin && <AdminView onAuthLost={onAuthLost} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function NotFound({ onHome }: { onHome: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-6xl font-bold text-dim/40 tabular-nums">404</div>
      <div>
        <h1 className="m-0 text-lg font-semibold">{t.notFoundTitle}</h1>
        <p className="mt-1 max-w-sm text-sm text-dim">{t.notFoundBody}</p>
      </div>
      <Btn variant="primary" onClick={onHome}>
        {t.backToConfig}
      </Btn>
    </div>
  );
}
