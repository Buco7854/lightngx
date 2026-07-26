import { useEffect, type ReactNode } from "react";
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
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
        className={`flex min-h-[42px] w-full cursor-pointer touch-manipulation items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          active
            ? "bg-accent-soft font-semibold text-accent-ink"
            : "font-medium text-dim hover:bg-hov hover:text-fg"
        }`}
      >
        <span className={`shrink-0 ${active ? "text-accent-ink" : "text-faint"}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  const group = (label: string, children: ReactNode) => (
    <div className="flex flex-col gap-1 px-3">
      <span className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">
        {label}
      </span>
      {children}
    </div>
  );

  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-line px-4">
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
          <span className="truncate text-[17px] font-bold tracking-tight">{t.appName}</span>
        </Link>
        <IconBtn size="sm" className="ml-auto min-[761px]:hidden" onClick={onClose} aria-label={t.close}>
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
        <div className="flex items-center gap-2.5 rounded-xl bg-inset px-2.5 py-2">
          <Avatar name={props.user} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{props.user}</span>
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
      <aside className="hidden w-[248px] shrink-0 border-r border-line bg-panel min-[761px]:block">
        {content}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] transition-opacity min-[761px]:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t.menu}
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-[60] w-[min(292px,82vw)] border-r border-line bg-panel pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] elev-3 transition-transform duration-200 min-[761px]:hidden ${
          open ? "translate-x-0" : "invisible -translate-x-[105%]"
        }`}
      >
        {content}
      </aside>
    </>
  );
}
