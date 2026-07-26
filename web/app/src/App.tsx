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
import { Btn, Card } from "./ui";
import PolicyPrompt from "./components/PolicyPrompt";
import Profile from "./components/Profile";
import Setup from "./components/Setup";
import VerifyMFA from "./components/VerifyMFA";
import VhostsView from "./components/VhostsView";

const VIEWS: View[] = ["sites", "streams", "config", "logs", "profile", "admin"];
const AUTH_PATHS = ["/setup", "/login", "/verify", "/enroll"];

// Map a URL path to an app view, or null when it matches no known view
// (rendered as a 404). "/" is normalised by the redirect effect.
function pathToView(pathname: string, fallback: View): View | null {
  const seg = pathname.replace(/^\/+/, "").split("/")[0];
  if (seg === "") return fallback;
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

  // Which sections the deployment has decides both the sidebar and where "/"
  // lands, so it is fetched here rather than down in the shell.
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [appConfigLoaded, setAppConfigLoaded] = useState(false);
  useEffect(() => {
    if (!booted || authPath !== null) return;
    api
      .appConfig()
      .then(setAppConfig)
      .catch(() => setAppConfig(null))
      .finally(() => setAppConfigLoaded(true));
  }, [booted, authPath]);

  // Sites is the landing view; where it is switched off, the editor takes
  // its place.
  const defaultView: View = appConfig?.sites === false ? "config" : "sites";

  useEffect(() => {
    if (!booted) return;
    if (authPath) {
      if (loc.pathname !== authPath) navigate(authPath, { replace: true });
    } else if (loc.pathname === "/" || AUTH_PATHS.includes(loc.pathname)) {
      // Wait: which view "/" means depends on the config just fetched.
      if (!appConfigLoaded) return;
      navigate(`/${defaultView}`, { replace: true });
    }
  }, [booted, authPath, loc.pathname, appConfigLoaded, defaultView]);

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
          view={pathToView(loc.pathname, defaultView)}
          home={defaultView}
          appConfig={appConfig}
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
  home,
  appConfig,
  reloadMe,
  onAuthLost,
  themePref,
  setThemePref,
  onLogout,
}: {
  me: Me;
  view: View | null;
  home: View;
  appConfig: AppConfig | null;
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
  const defaultReload = appConfig?.defaultReloadOnSave ?? true;
  // Optimistic until the config lands, so the sections do not flicker.
  const showSites = appConfig?.sites ?? true;
  const showStreams = appConfig?.streams ?? true;

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
  const notFound =
    view === null ||
    (view === "admin" && !isAdmin) ||
    (view === "sites" && !showSites) ||
    (view === "streams" && !showStreams);

  const titles: Record<View, string> = {
    config: t.tabEditor,
    sites: t.navSites,
    streams: t.navStreams,
    logs: t.tabLogs,
    profile: t.profile,
    admin: t.navAdmin,
  };

  return (
    <div className="flex min-h-0 flex-1">
      {needsPolicy && <PolicyPrompt onDone={reloadMe} />}
      <AppSidebar
        view={notFound ? null : view}
        setView={setView}
        isAdmin={isAdmin}
        user={me.user}
        onLogout={onLogout}
        home={home}
        showSites={showSites}
        showStreams={showStreams}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Navbar
          title={notFound || view === null ? t.notFoundTitle : titles[view]}
          home={home}
          status={status}
          refreshStatus={refreshStatus}
          themePref={themePref}
          setThemePref={setThemePref}
          onMenu={() => setSidebarOpen(true)}
        />
        <main className="flex min-h-0 min-w-0 flex-1">
          {notFound ? (
            <NotFound home={home} />
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

function NotFound({ home }: { home: View }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="flex w-full max-w-md flex-col items-center gap-4 px-6 py-10 text-center">
        <div className="text-[64px] leading-none font-bold text-ctrl-hi tabular-nums">404</div>
        <div>
          <h2 className="m-0 text-lg font-semibold tracking-tight">{t.notFoundTitle}</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-dim">{t.notFoundBody}</p>
        </div>
        <Btn variant="primary" size="lg" href={`/${home}`}>
          {t.backHome}
        </Btn>
      </Card>
    </div>
  );
}
