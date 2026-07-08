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
import { Btn, Logo } from "../ui";

export type View = "config" | "sites" | "streams" | "logs" | "profile" | "admin";

interface Props {
  view: View | null;
  setView: (v: View) => void;
  isAdmin: boolean;
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

  const item = (id: View, icon: ReactNode, label: string) => (
    <button
      onClick={() => {
        props.setView(id);
        onClose();
      }}
      className={`flex min-h-[42px] w-full cursor-pointer touch-manipulation items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors ${
        props.view === id ? "bg-accent/15 text-fg" : "text-dim hover:bg-ctrl hover:text-fg"
      }`}
    >
      <span className={props.view === id ? "text-accent" : ""}>{icon}</span>
      {label}
    </button>
  );

  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <button
          onClick={() => {
            props.setView("config");
            onClose();
          }}
          className="flex cursor-pointer items-center gap-2.5"
          aria-label={t.appName}
        >
          <Logo />
          <span className="text-base font-bold">{t.appName}</span>
        </button>
        <Btn
          variant="ghost"
          className="ml-auto min-h-[36px] px-2 text-dim min-[761px]:hidden"
          onClick={onClose}
          aria-label={t.close}
        >
          <XIcon size={18} />
        </Btn>
      </div>

      <nav className="flex flex-col gap-1 p-3">
        {item("config", <FolderIcon />, t.tabEditor)}
        {props.showSites && item("sites", <GlobeIcon />, t.navSites)}
        {props.showStreams && item("streams", <StreamIcon />, t.navStreams)}
        {item("logs", <LogsIcon />, t.tabLogs)}
      </nav>

      <div className="flex-1" />

      <nav className="flex flex-col gap-1 p-3">
        {item("profile", <UserIcon />, t.profile)}
        {props.isAdmin && item("admin", <ShieldIcon />, t.navAdmin)}
      </nav>

      <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <UserIcon className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1 truncate text-[13px]">{props.user}</span>
        <Btn
          variant="ghost"
          className="min-h-[34px] px-2 text-dim hover:text-danger"
          onClick={props.onLogout}
          title={t.logout}
        >
          <LogoutIcon />
        </Btn>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop column */}
      <aside className="hidden w-[210px] shrink-0 border-r border-line bg-panel min-[761px]:block">
        {content}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity min-[761px]:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t.menu}
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-[60] w-[min(280px,80vw)] bg-panel pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] shadow-2xl transition-transform duration-200 min-[761px]:hidden ${
          open ? "translate-x-0" : "invisible -translate-x-[105%]"
        }`}
      >
        {content}
      </aside>
    </>
  );
}
