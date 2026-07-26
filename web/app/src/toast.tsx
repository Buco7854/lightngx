import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangleIcon, InfoIcon, XIcon } from "./icons";

type Kind = "info" | "error" | "warn";

interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const kindStyle: Record<Kind, { edge: string; tile: string; icon: ReactNode }> = {
  info: {
    edge: "border-l-accent",
    tile: "bg-accent-soft text-accent-ink",
    icon: <InfoIcon size={16} />,
  },
  warn: {
    edge: "border-l-warn",
    tile: "bg-warn-soft text-warn-ink",
    icon: <AlertTriangleIcon size={16} />,
  },
  error: {
    edge: "border-l-danger",
    tile: "bg-danger-soft text-danger-ink",
    icon: <AlertTriangleIcon size={16} />,
  },
};

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (text: string, kind: Kind = "info") => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { id, kind, text }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex w-[min(460px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2"
        role="status"
      >
        {toasts.map((t) => {
          const s = kindStyle[t.kind];
          return (
            <div
              key={t.id}
              className={`anim-slide-up pointer-events-auto flex items-start gap-3 rounded-xl border border-line border-l-[3px] bg-raise px-3 py-3 text-sm text-fg elev-3 ${s.edge}`}
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.tile}`}
              >
                {s.icon}
              </span>
              <span className="min-w-0 flex-1 self-center leading-snug break-words">{t.text}</span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="-mr-1 shrink-0 cursor-pointer self-center rounded-md p-1 text-faint transition-colors hover:bg-hov-raise hover:text-fg"
              >
                <XIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
