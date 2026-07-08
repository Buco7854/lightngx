import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { ChevronDownIcon } from "./icons";

// Shared text-input styling: an inset fill + 1px border so fields read as
// editable against the panel, not flush with it.
export const inputCls =
  "min-h-[36px] w-full rounded-md border border-line bg-inset px-3 text-[13px] text-fg " +
  "placeholder:text-dim/70 focus:border-accent/60 focus:outline-2 focus:outline-accent/50";

// Editor action pane: a right-hand column on desktop, a wrapping bar on
// mobile. Shared by the config and site/stream editors so both match.
export const editorPaneCls =
  "flex shrink-0 flex-col gap-3 border-line bg-panel p-4 " +
  "max-[760px]:flex-row max-[760px]:flex-wrap max-[760px]:items-center max-[760px]:border-b " +
  "min-[761px]:w-[220px] min-[761px]:border-l";

export function Input({
  className = "",
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={`${inputCls} ${className}`} {...props} />;
}

// Modal: centered panel over a scrim, closes on Escape / backdrop click.
export function Modal({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full max-w-md rounded-xl bg-panel p-6 shadow-2xl ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 mb-4 text-[15px] font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

type Variant = "default" | "primary" | "danger" | "ghost";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium leading-tight " +
  "min-h-[36px] px-3 cursor-pointer transition-colors touch-manipulation select-none " +
  "disabled:opacity-50 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-accent/60";

const variants: Record<Variant, string> = {
  default: "bg-ctrl text-fg enabled:hover:bg-ctrl-hi",
  primary: "bg-accent text-accent-fg font-semibold enabled:hover:bg-accent-hi",
  danger: "bg-danger/10 text-danger enabled:hover:bg-danger/20",
  ghost: "bg-transparent enabled:hover:bg-ctrl",
};

export function Btn({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

// Combobox: a Select-like trigger whose dropdown has a search box to
// filter options. For long option lists (e.g. many log files).
export function Combobox({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  className = "",
  search,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  search?: boolean;
}) {
  const showSearch = search ?? options.length > 8;
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          // Open aligned to whichever edge keeps the panel on-screen.
          const r = ref.current?.getBoundingClientRect();
          if (r) setAlignRight(r.left + 200 > window.innerWidth);
          setOpen((o) => !o);
          setQuery("");
          if (showSearch) requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex min-h-[36px] w-full cursor-pointer items-center gap-2 rounded-md border border-line bg-inset py-1.5 pr-2 pl-2.5 text-[13px] text-fg hover:border-ctrl-hi focus-visible:outline-2 focus-visible:outline-accent/60"
      >
        <span className={`min-w-0 flex-1 truncate text-left ${selected ? "" : "text-dim"}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon size={14} className="shrink-0 text-dim" aria-hidden />
      </button>
      {open && (
        <div
          className={`absolute top-full z-50 mt-1.5 w-full min-w-[180px] max-w-[calc(100vw-16px)] rounded-lg bg-panel p-1.5 shadow-2xl ring-1 ring-line ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          {showSearch && (
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="…"
              className="mb-1.5 w-full rounded-md border border-line bg-inset px-2.5 py-1.5 text-[13px] focus:outline-2 focus:outline-accent/50"
            />
          )}
          <div className="max-h-64 overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[13px] text-dim">—</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`block w-full cursor-pointer truncate rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-ctrl ${
                    o.value === value ? "text-accent" : ""
                  }`}
                  title={o.label}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Switch({
  checked,
  warn = false,
  disabled = false,
  label,
  onToggle,
}: {
  checked: boolean;
  warn?: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-[24px] w-[42px] shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent/60 ${
        checked ? (warn ? "bg-warn" : "bg-accent") : "bg-ctrl-hi"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[18px]" : ""
        }`}
      />
    </button>
  );
}

// Dropdown: a trigger button plus a floating panel of MenuItems that
// closes on outside click, Escape or item selection.
export function Dropdown({
  button,
  ariaLabel,
  align = "right",
  children,
}: {
  button: ReactNode;
  ariaLabel: string;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
        className={`${base} ${variants.default}`}
      >
        {button}
        <ChevronDownIcon size={14} className="text-dim" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-1.5 min-w-[190px] rounded-lg bg-panel p-1.5 shadow-2xl ring-1 ring-line ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  danger = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      role="menuitem"
      className={`flex min-h-[38px] w-full cursor-pointer touch-manipulation items-center gap-2.5 rounded-md px-3 text-left text-[13px] transition-colors disabled:opacity-50 ${
        danger ? "text-danger hover:bg-danger/10" : "hover:bg-ctrl"
      } ${className}`}
      {...props}
    />
  );
}

export function StatusDot({ on, pulse = false }: { on: boolean; pulse?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${on ? "bg-ok" : "bg-danger"} ${
        on && pulse ? "animate-pulse" : ""
      }`}
    />
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-dim border-t-transparent" />
  );
}

export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <polygon points="50 4 90 27 90 73 50 96 10 73 10 27" fill="var(--color-accent)" />
      <text
        x="50"
        y="66"
        fontSize="46"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        textAnchor="middle"
        fill="var(--color-accent-fg)"
      >
        L
      </text>
    </svg>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-dim">{children}</div>
  );
}
