import { useEffect, useRef, type ReactNode } from "react";
import {
  FolderIcon,
  GlobeIcon,
  LogoutIcon,
  LogsIcon,
  ShieldIcon,
  StreamIcon,
  UserIcon,
  XIcon,
} from "../icons";
import { useI18n } from "../i18n";
import { Link } from "../router";
import { Avatar, IconBtn, Logo } from "../ui";

export type View = "config" | "sites" | "streams" | "logs" | "profile" | "admin";

interface Props {
  view: View | null;
  setView: (v: View) => void;
  isAdmin: boolean;
  home: View; // the landing view, where the wordmark points
  user: string;
  onLogout: () => void;
  showSites: boolean;
  showStreams: boolean;
  open: boolean; // mobile drawer state
  onClose: () => void;
}

// Main navigation: static column on desktop, slide-over drawer on mobile.
export default function AppSidebar(props: Props) {
  const { t } = useI18n();
  const { open, onClose } = props;
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? []).filter(el => el.getClientRects().length > 0);
    controls()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = controls();
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    const onResize = () => { if (window.innerWidth >= 1100) onClose(); };
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open, onClose]);

  const item = (id: View, icon: ReactNode, label: string) => {
    const active = props.view === id;
    return (
      <Link
        href={`/${id}`}
        onNavigate={() => {
          props.setView(id);
          onClose();
        }}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[40px] w-full cursor-pointer touch-manipulation items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          active
            ? "bg-ctrl font-medium text-fg"
            : "font-normal text-dim hover:bg-hov hover:text-fg"
        }`}
      >
        <span className={`shrink-0 ${active ? "text-fg" : "text-faint"}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  const group = (label: string, children: ReactNode) => (
    <div className="flex flex-col gap-1 px-3">
      <span className="px-3 pt-6 pb-2 text-xs font-medium text-faint">
        {label}
      </span>
      {children}
    </div>
  );

  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[64px] shrink-0 items-center gap-2.5 px-6">
        <Link
          href={`/${props.home}`}
          onNavigate={() => {
            props.setView(props.home);
            onClose();
          }}
          className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={t.appName}
        >
          <Logo className="h-7 w-7 shrink-0" />
          <span className="truncate text-[19px] font-semibold tracking-tight">{t.appName}</span>
        </Link>
        <IconBtn size="sm" className="ml-auto min-[1100px]:hidden" onClick={onClose} aria-label={t.close}>
          <XIcon size={18} />
        </IconBtn>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {group(
          t.sectionManage,
          <>
            {props.showSites && item("sites", <GlobeIcon size={18} />, t.navSites)}
            {props.showStreams && item("streams", <StreamIcon size={18} />, t.navStreams)}
            {item("config", <FolderIcon size={18} />, t.tabEditor)}
            {item("logs", <LogsIcon size={18} />, t.tabLogs)}
          </>,
        )}
        {group(
          t.sectionAccount,
          <>
            {item("profile", <UserIcon size={18} />, t.profile)}
            {props.isAdmin && item("admin", <ShieldIcon size={18} />, t.navAdmin)}
          </>,
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
          <Avatar name={props.user} />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{props.user}</div><div className="text-xs text-faint">{props.isAdmin ? t.roleAdmin : t.roleUser}</div></div>
          <IconBtn
            size="sm"
            className="hover:text-danger-ink"
            onClick={props.onLogout}
            aria-label={t.logout}
            title={t.logout}
          >
            <LogoutIcon size={17} />
          </IconBtn>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop column */}
      <aside className="hidden app-sidebar w-[228px] shrink-0 bg-bg min-[1100px]:block">
        {content}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity min-[1100px]:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.menu}
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-[60] w-[min(292px,82vw)] app-sidebar border-r border-line bg-bg pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] elev-3 transition-transform duration-200 min-[1100px]:hidden ${
          open ? "translate-x-0" : "invisible -translate-x-[105%]"
        }`}
      >
        {content}
      </aside>
    </>
  );
}
