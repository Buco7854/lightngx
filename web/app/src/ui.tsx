import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "./router";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  XIcon,
} from "./icons";

const focusableSelector =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
function visibleControls(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// useMenu drives the shared popup behaviour of Combobox, Dropdown and
// SplitButton: open state, dismissal on outside pointer press or Escape, and
// placement of the panel. The panel lives in a body-level portal and is
// positioned against its trigger so no ancestor's overflow can clip it — rows
// inside a scrolling, overflow-hidden card would otherwise cut it off.
function useMenu({ align = "right", matchWidth = false } = {}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  // Hidden until measured; revealing the panel must not transition, even
  // when the reduced-motion stylesheet assigns transition durations globally.
  const [style, setStyle] = useState<CSSProperties>({
    visibility: "hidden",
    transitionProperty: "none",
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!anchorRef.current?.contains(target) && !menuRef.current?.contains(target))
        setOpen(false);
    };
    const trigger = () => anchorRef.current?.querySelector<HTMLButtonElement>("button");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        trigger()?.focus();
      } else if (
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
        menuRef.current?.getAttribute("role") === "menu" &&
        menuRef.current.contains(e.target as Node)
      ) {
        const controls = visibleControls(menuRef.current);
        const index = controls.indexOf(document.activeElement as HTMLElement);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? controls.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
        e.preventDefault();
        controls[next]?.focus();
      } else if (e.key === "Tab" && menuRef.current?.contains(e.target as Node)) {
        const button = trigger();
        if (!button) return;
        const scope = button.closest('[role="dialog"]') ?? document.body;
        const controls = visibleControls(scope);
        const index = controls.indexOf(button);
        const next = controls[(index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length];
        e.preventDefault();
        setOpen(false);
        next?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle({ visibility: "hidden", transitionProperty: "none" });
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      const el = menuRef.current;
      if (!anchor || !el) return;
      const pad = 8;
      const gap = 8;
      const a = anchor.getBoundingClientRect();
      // Size to the trigger before measuring, so min-width still wins if wider.
      if (matchWidth) el.style.width = `${a.width}px`;
      const m = el.getBoundingClientRect();
      let left = align === "right" ? a.right - m.width : a.left;
      left = Math.max(pad, Math.min(left, window.innerWidth - pad - m.width));
      // Flip above the trigger when the panel would overflow the viewport.
      const below = a.bottom + gap;
      const roomBelow = window.innerHeight - pad - below;
      const roomAbove = a.top - gap - pad;
      const flip = m.height > roomBelow && roomAbove > roomBelow;
      const maxHeight = Math.max(64, flip ? roomAbove : roomBelow);
      const top = flip ? Math.max(pad, a.top - gap - Math.min(m.height, maxHeight)) : below;
      setStyle({
        transitionProperty: "none",
        visibility: "visible",
        top,
        left,
        maxHeight,
        overflowY: "auto",
        ...(matchWidth && { width: a.width }),
      });
    };
    place();
    window.addEventListener("resize", place);
    // Capture phase: any scrolling ancestor moves the trigger, not just window.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, matchWidth]);

  useLayoutEffect(() => {
    if (!open || style.visibility === "hidden" || menuRef.current?.getAttribute("role") !== "menu")
      return;
    const controls = visibleControls(menuRef.current);
    controls[focusLast.current ? controls.length - 1 : 0]?.focus();
  }, [open, style.visibility]);
  const openMenu = (last = false) => {
    focusLast.current = last;
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    anchorRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  return {
    open,
    setOpen,
    openMenu,
    close,
    anchorRef,
    menuRef,
    style,
    modalId:
      anchorRef.current?.closest("[data-modal-id]")?.getAttribute("data-modal-id") ?? undefined,
  };
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`ui-card rounded-lg border border-line bg-panel ${className}`}>{children}</div>
  );
}

export function Toolbar({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`ui-toolbar flex min-h-[64px] shrink-0 flex-wrap items-center gap-3 border-b border-line-soft bg-panel px-4 py-3 min-[761px]:px-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`m-0 truncate text-[15px] leading-tight font-medium tracking-tight ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading flex items-start gap-3 border-b border-line-soft px-5 py-4">
      {icon && (
        <span className="section-icon mt-0.5 flex shrink-0 items-center justify-center text-dim">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-1 mb-0 text-[13px] leading-relaxed text-dim">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type Variant =
  | "default"
  | "primary"
  | "danger"
  | "danger-solid"
  | "ghost"
  | "ghost-raised"
  | "subtle";
type Size = "sm" | "md" | "lg";

const btnBase =
  "inline-flex items-center justify-center font-medium leading-tight cursor-pointer " +
  "transition-[background-color,border-color,color,box-shadow] touch-manipulation select-none " +
  `disabled:opacity-50 disabled:cursor-default ${focusRing}`;

const btnSizes: Record<Size, string> = {
  sm: "min-h-[32px] gap-1.5 rounded-md px-2.5 text-[13px]",
  md: "min-h-[38px] gap-2 rounded-md px-3.5 text-sm",
  lg: "min-h-[44px] gap-2 rounded-md px-5 text-[15px]",
};

const btnVariants: Record<Variant, string> = {
  default: "border border-line bg-panel text-fg elev-1 enabled:hover:bg-hov",
  primary: "bg-accent text-accent-fg  font-semibold elev-1 enabled:hover:bg-accent-hi",
  danger: "border border-danger/25 bg-danger-soft text-danger-ink enabled:hover:border-danger/40",
  "danger-solid": "bg-danger text-white font-semibold elev-1 enabled:hover:bg-danger-ink",
  ghost: "text-dim enabled:hover:bg-hov enabled:hover:text-fg",
  "ghost-raised": "text-dim enabled:hover:bg-hov-raise enabled:hover:text-fg",
  subtle: "bg-ctrl text-fg enabled:hover:bg-ctrl-hi",
};

// An anchor is never :enabled, so a link-button needs the plain hover
// variants; the disabled states they guard against cannot happen on a link.
const btnLinkVariants: Record<Variant, string> = {
  default: "border border-line bg-panel text-fg elev-1 hover:bg-hov",
  primary: "bg-accent text-accent-fg  font-semibold elev-1 hover:bg-accent-hi",
  danger: "border border-danger/25 bg-danger-soft text-danger-ink hover:border-danger/40",
  "danger-solid": "bg-danger text-white font-semibold elev-1 hover:bg-danger-ink",
  ghost: "text-dim hover:bg-hov hover:text-fg",
  "ghost-raised": "text-dim hover:bg-hov-raise hover:text-fg",
  subtle: "bg-ctrl text-fg hover:bg-ctrl-hi",
};

// A Btn given an href renders as a Link, so a button that only navigates
// still offers the browser's open-in-new-tab affordances.
export function Btn({
  variant = "default",
  size = "md",
  className = "",
  href,
  ...props
}: (ButtonHTMLAttributes<HTMLButtonElement> | AnchorHTMLAttributes<HTMLAnchorElement>) & {
  variant?: Variant;
  size?: Size;
  href?: string;
}) {
  const base = `${btnBase} ${btnSizes[size]}`;
  if (href !== undefined)
    return (
      <Link
        href={href}
        className={`${base} ${btnLinkVariants[variant]} ${className}`}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      />
    );
  return (
    <button
      className={`${base} ${btnVariants[variant]} ${className}`}
      {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
    />
  );
}

type IconSize = Size | "xs";

const iconSizes: Record<IconSize, string> = {
  xs: "h-7 w-7 rounded-md",
  sm: "h-8 w-8 rounded-lg",
  md: "h-9 w-9 rounded-lg",
  lg: "h-10 w-10 rounded-xl",
};

export function IconBtn({
  variant = "ghost",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: IconSize }) {
  return (
    <button
      className={`${btnBase} shrink-0 items-center justify-center ${iconSizes[size]} ${btnVariants[variant]} ${className}`}
      {...props}
    />
  );
}

// Shared text-input styling: an inset fill + 1px border so fields read as
// editable against the panel, not flush with it.
const inputCls =
  "min-h-[40px] w-full rounded-md border border-ctrl-hi bg-panel px-3.5 text-sm text-fg " +
  "placeholder:text-dim focus:border-accent/50 focus:outline-2 focus:outline-accent/50";

export function Input({
  className = "",
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={`${inputCls} ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputCls} py-2.5 ${className}`} {...props} />;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <SearchIcon size={15} className="pointer-events-none absolute left-3 text-faint" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="min-h-[38px] w-full rounded-md border border-ctrl-hi bg-panel pr-9 pl-9 text-sm text-fg placeholder:text-dim focus:border-accent/50 focus:outline-2 focus:outline-accent/50"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear"
          className={`absolute right-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-hov hover:text-fg ${focusRing}`}
        >
          <XIcon size={14} />
        </button>
      )}
    </div>
  );
}

export function Checkbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  ariaLabel,
  className = "",
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <input
        type="checkbox"
        ref={(node) => { if (node) node.indeterminate = indeterminate && !checked; }}
        disabled={disabled}
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
        className={`peer h-[19px] w-[19px] disabled:cursor-default disabled:opacity-50 cursor-pointer appearance-none rounded-[4px] border border-ctrl-hi bg-panel transition-colors checked:border-accent checked:bg-accent hover:border-faint ${focusRing}`}
      />
      {indeterminate && !checked ? (
        <span className="pointer-events-none absolute top-[8px] left-[4px] h-[3px] w-[11px] rounded-full bg-faint" />
      ) : (
        <CheckIcon
          size={13}
          strokeWidth={3}
          className="pointer-events-none absolute top-[3px] left-[3px] text-accent-fg opacity-0 peer-checked:opacity-100"
        />
      )}
    </span>
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
      className={`relative h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-50 ${focusRing} ${
        checked ? (warn ? "bg-warn" : "bg-accent") : "bg-ctrl-hi"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform ${
          checked ? "translate-x-[20px]" : ""
        }`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex shrink-0 gap-1 rounded-xl bg-ctrl p-1 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const index = options.findIndex((option) => option.value === o.value);
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? options.length - 1
                    : (index + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
              onChange(options[next].value);
              e.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
            onClick={() => onChange(o.value)}
            className={`inline-flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${focusRing} ${
              active ? "bg-panel text-fg elev-1" : "text-dim hover:text-fg"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums max-[560px]:hidden ${
                  active ? "bg-accent-soft text-accent-ink" : "bg-panel/60 text-faint"
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Modal: centered panel over a scrim, closes on Escape / backdrop click.
export function Modal({
  title,
  hint,
  icon,
  size = "md",
  onClose,
  footer,
  closeLabel = "Close",
  mobileSheet = false,
  children,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  size?: "sm" | "md" | "lg";
  onClose: () => void;
  footer?: ReactNode;
  closeLabel?: string;
  mobileSheet?: boolean;
  children: ReactNode;
}) {
  const backdropPointer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const modalId = useId();
  const trigger = useRef(document.activeElement as HTMLElement | null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current!;
    const topmost = () => {
      const panels = document.querySelectorAll("[data-modal-id]");
      return panels[panels.length - 1] === panel;
    };
    const owns = (el: Element | null) =>
      !!el &&
      (panel.contains(el) ||
        el.closest("[data-modal-owner]")?.getAttribute("data-modal-owner") === modalId);
    const focusFirst = () => (visibleControls(panel)[0] ?? panel).focus();
    if (!owns(document.activeElement)) focusFirst();
    const onFocus = (e: FocusEvent) => {
      if (topmost() && !owns(e.target as Element)) focusFirst();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!topmost() || e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab") {
        const controls = visibleControls(panel);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first) {
          e.preventDefault();
          panel.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === panel)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      if (trigger.current?.isConnected) trigger.current.focus();
    };
  }, [modalId]);
  const maxW = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-lg" : "max-w-md";
  return (
    <div
      className={`modal-backdrop ${mobileSheet ? "mobile-sheet" : ""} anim-fade fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4`}
      onPointerDownCapture={(e) => {
        backdropPointer.current = e.target === e.currentTarget ? e.pointerId : null;
      }}
      onPointerUp={(e) => {
        const startedOnBackdrop = backdropPointer.current === e.pointerId;
        backdropPointer.current = null;
        if (startedOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      onPointerCancel={() => {
        backdropPointer.current = null;
      }}
    >
      <div
        ref={panelRef}
        data-modal-id={modalId}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel anim-rise flex min-w-0 max-h-[calc(100dvh-2rem)] w-full flex-col rounded-lg border border-line bg-raise elev-3 ${maxW}`}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-base leading-snug font-semibold tracking-tight">{title}</h2>
            {hint && <p className="mt-1.5 mb-0 text-[13.5px] leading-relaxed text-dim">{hint}</p>}
          </div>
          <IconBtn
            size="sm"
            variant="ghost-raised"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mt-1 -mr-1.5"
          >
            <XIcon size={16} />
          </IconBtn>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-line-soft px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap justify-end gap-2.5">{children}</div>;
}

// Portalled panels sit above the modal layer (z-70) so menus opened from
// inside a dialog stay usable.
const menuCls =
  "anim-pop fixed z-[75] flex w-max min-w-[210px] max-w-[calc(100vw-16px)] flex-col " +
  "gap-0.5 rounded-xl border border-line bg-raise p-1.5 elev-pop";

// SplitButton: a primary action button with an attached caret that opens a
// menu of alternative actions (render MenuItems via children). The whole
// control disables together.
export function SplitButton({
  onClick,
  disabled = false,
  loading = false,
  label,
  menuAriaLabel,
  variant = "primary",
  align = "right",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label: ReactNode;
  menuAriaLabel: string;
  variant?: Variant;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const menu = useMenu({ align });

  return (
    <div ref={menu.anchorRef} className="inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${btnBase} ${btnSizes.md} ${btnVariants[variant]} min-w-[86px] rounded-r-none`}
      >
        {loading ? <Spinner light={variant === "primary"} /> : label}
      </button>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={menuAriaLabel}
        disabled={disabled}
        onClick={() => (menu.open ? menu.close() : menu.openMenu())}
        onKeyDown={(e) => {
          if (
            e.key === "ArrowDown" ||
            e.key === "ArrowUp" ||
            (menu.open && (e.key === "Home" || e.key === "End"))
          ) {
            e.preventDefault();
            menu.openMenu(e.key === "ArrowUp" || e.key === "End");
          }
        }}
        className={`${btnBase} ${btnSizes.md} ${btnVariants[variant]} rounded-l-none border-l border-black/15 px-2`}
      >
        <ChevronDownIcon size={15} aria-hidden />
      </button>
      {menu.open &&
        createPortal(
          <div
            data-modal-owner={menu.modalId}
            ref={menu.menuRef}
            style={menu.style}
            role="menu"
            className={menuCls}
          >
            {children(menu.close)}
          </div>,
          document.body,
        )}
    </div>
  );
}

// Dropdown: a trigger button plus a floating panel of MenuItems that
// closes on outside click, Escape or item selection.
export function Dropdown({
  button,
  ariaLabel,
  align = "right",
  variant = "default",
  size = "md",
  chevron = true,
  disabled = false,
  className = "",
  children,
}: {
  button: ReactNode;
  ariaLabel: string;
  align?: "left" | "right";
  variant?: Variant;
  size?: Size;
  chevron?: boolean;
  disabled?: boolean;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const menu = useMenu({ align });

  return (
    <div ref={menu.anchorRef} className={className}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={ariaLabel}
        onClick={() => (menu.open ? menu.close() : menu.openMenu())}
        onKeyDown={(e) => {
          if (
            e.key === "ArrowDown" ||
            e.key === "ArrowUp" ||
            (menu.open && (e.key === "Home" || e.key === "End"))
          ) {
            e.preventDefault();
            menu.openMenu(e.key === "ArrowUp" || e.key === "End");
          }
        }}
        className={`${btnBase} ${chevron ? btnSizes[size] : iconSizes[size]} ${btnVariants[variant]}`}
      >
        {button}
        {chevron && <ChevronDownIcon size={14} className="shrink-0 opacity-60" aria-hidden />}
      </button>
      {menu.open &&
        createPortal(
          <div
            data-modal-owner={menu.modalId}
            ref={menu.menuRef}
            style={menu.style}
            role="menu"
            className={menuCls}
          >
            {children(menu.close)}
          </div>,
          document.body,
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
      className={`flex min-h-[40px] w-full cursor-pointer touch-manipulation items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors disabled:cursor-default disabled:opacity-50 ${
        danger
          ? "text-danger-ink hover:bg-danger-soft"
          : "text-fg hover:bg-hov-raise [&>svg]:text-dim"
      } ${className}`}
      {...props}
    />
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <span className="px-3 pt-1.5 pb-1 text-xs font-medium text-faint">
      {children}
    </span>
  );
}

export function MenuSep() {
  return <span className="my-1 h-px bg-line-soft" />;
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
  emptyLabel = "—",
  disabled = false,
  wrapLabel = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  search?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  wrapLabel?: boolean;
}) {
  const listId = useId();
  const showSearch = search ?? options.length > 8;
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const menu = useMenu({ align: "left", matchWidth: true });

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const focusTarget = useRef<"selected" | "first" | "last">("selected");
  const focusOption = (which: "selected" | "first" | "last") => {
    const buttons = menu.menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!buttons?.length) return;
    const index =
      which === "last"
        ? buttons.length - 1
        : which === "first"
          ? 0
          : Math.max(
              0,
              filtered.findIndex((o) => o.value === value),
            );
    buttons[index]?.focus();
  };
  useLayoutEffect(() => {
    if (!menu.open || menu.style.visibility === "hidden") return;
    if (showSearch) inputRef.current?.focus();
    else focusOption(focusTarget.current);
    // Focus once after placement, before the next keyboard event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.open, menu.style.visibility]);

  return (
    <div ref={menu.anchorRef} className={className}>
      <button
        type="button"
        role="combobox"
        disabled={disabled}
        aria-controls={menu.open ? listId : undefined}
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        aria-label={ariaLabel}
        onClick={() => {
          menu.setOpen((o) => !o);
          setQuery("");
          focusTarget.current = "selected";
        }}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            setQuery("");
            focusTarget.current =
              e.key === "End" || e.key === "ArrowUp"
                ? "last"
                : e.key === "Home"
                  ? "first"
                  : "selected";
            if (menu.open) focusOption(focusTarget.current);
            else menu.setOpen(true);
          }
        }}
        className={`flex min-h-[40px] w-full cursor-pointer items-center gap-2 rounded-md border border-ctrl-hi bg-panel py-1.5 pr-2.5 pl-3.5 text-sm text-fg transition-colors hover:border-ctrl-hi disabled:cursor-default disabled:opacity-50 ${focusRing}`}
      >
        <span
          className={`min-w-0 flex-1 text-left ${wrapLabel ? "break-words whitespace-normal" : "truncate"} ${selected ? "" : "text-dim"}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon size={15} className="shrink-0 text-faint" aria-hidden />
      </button>
      {menu.open &&
        createPortal(
          <div
            data-modal-owner={menu.modalId}
            ref={menu.menuRef}
            style={menu.style}
            className="anim-pop fixed z-[75] min-w-[220px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-raise p-1.5 elev-pop"
          >
            {showSearch && (
              <div className="relative mb-1.5 flex items-center">
                <SearchIcon
                  size={14}
                  className="pointer-events-none absolute left-2.5 text-faint"
                />
                <input
                  ref={inputRef}
                  value={query}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      focusOption("first");
                    }
                  }}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label={ariaLabel}
                  className="w-full rounded-md border border-ctrl-hi bg-panel py-2 pr-2.5 pl-8 text-[13px] focus:outline-2 focus:outline-accent/50"
                />
              </div>
            )}
            <div
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="max-h-72 overflow-auto"
              onKeyDown={(e) => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
                e.preventDefault();
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
                );
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? buttons.length - 1
                      : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              }}
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-2.5 text-[13px] text-dim">{emptyLabel}</div>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.value}
                    role="option"
                    aria-selected={o.value === value}
                    tabIndex={-1}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      menu.close();
                      menu.anchorRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
                    }}
                    className={`flex min-h-[36px] w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-left text-[13px] hover:bg-hov-raise ${
                      o.value === value ? "font-medium text-accent-ink" : ""
                    }`}
                    title={o.label}
                  >
                    <span
                      className={`min-w-0 flex-1 ${wrapLabel ? "break-words whitespace-normal" : "truncate"}`}
                    >
                      {o.label}
                    </span>
                    {o.value === value && <CheckIcon size={14} className="shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-ctrl text-dim",
  accent: "bg-accent-soft text-accent-ink",
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-danger-soft text-danger-ink",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function MonoTag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-block max-w-full truncate rounded-md border border-line-soft bg-inset px-1.5 py-0.5 font-mono text-[11.5px] text-dim ${className}`}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-ctrl px-1.5 py-px font-sans text-[11px] text-dim">
      {children}
    </kbd>
  );
}

export function StatusDot({
  on,
  pulse = false,
  tone,
}: {
  on: boolean;
  pulse?: boolean;
  tone?: "ok" | "warn" | "danger" | "neutral";
}) {
  const t = tone ?? (on ? "ok" : "danger");
  const fill = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", neutral: "bg-faint" }[t];
  const ring = {
    ok: "ring-ok/20",
    warn: "ring-warn/20",
    danger: "ring-danger/20",
    neutral: "ring-faint/20",
  }[t];
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      {pulse && on && (
        <span className={`absolute inset-0 rounded-full opacity-60 ${fill}`} />
      )}
      <span className={`relative h-2.5 w-2.5 rounded-full ring-[3px] ${fill} ${ring}`} />
    </span>
  );
}

export function Spinner({ light = false, size = 16 }: { light?: boolean; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`inline-block animate-spin rounded-full border-2 border-t-transparent ${
        light ? "border-white/80" : "border-faint"
      }`}
    />
  );
}

export function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <Spinner size={22} />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ctrl ${className}`} />;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <span className="flex h-10 w-10 items-center justify-center text-faint">
          {icon}
        </span>
      )}
      <p className="m-0 text-[15px] font-semibold tracking-tight">{title}</p>
      {hint && <p className="m-0 max-w-sm text-sm leading-relaxed text-dim">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ResizeHandle({
  value,
  min,
  max,
  resetTo,
  onChange,
  onCommit,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  resetTo?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  ariaLabel: string;
}) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        drag.current = { x: e.clientX, v: value };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        onChange(clamp(drag.current.v + e.clientX - drag.current.x));
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        const v = clamp(drag.current.v + e.clientX - drag.current.x);
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit?.(v);
      }}
      onDoubleClick={() => {
        if (resetTo === undefined) return;
        onChange(resetTo);
        onCommit?.(resetTo);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const step = e.shiftKey ? 48 : 16;
        const v = clamp(value + (e.key === "ArrowLeft" ? -step : step));
        onChange(v);
        onCommit?.(v);
      }}
      className={`group absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none ${focusRing}`}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-transparent transition-colors group-hover:bg-accent/50 group-focus-visible:bg-accent/50" />
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
  label,
  prevLabel,
  nextLabel,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
  label: string;
  prevLabel: string;
  nextLabel: string;
}) {
  return (
    <nav className="flex items-center justify-center gap-2 py-1">
      <IconBtn
        size="sm"
        variant="default"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label={prevLabel}
        title={prevLabel}
      >
        <ChevronLeftIcon size={16} />
      </IconBtn>
      <span className="min-w-[110px] text-center text-[13px] text-dim tabular-nums">{label}</span>
      <IconBtn
        size="sm"
        variant="default"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        aria-label={nextLabel}
        title={nextLabel}
      >
        <ChevronRightIcon size={16} />
      </IconBtn>
    </nav>
  );
}

export function Avatar({
  name,
  className = "h-8 w-8 text-[12px]",
}: {
  name: string;
  className?: string;
}) {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const text =
    parts.length === 0
      ? "?"
      : parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : (parts[0][0] + parts[1][0]).toUpperCase();
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-ink ${className}`}
    >
      {text}
    </span>
  );
}

export function Logo({ className = "h-7 w-7" }: { className?: string }) {

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <polygon
        points="50 14 81.2 32 81.2 68 50 86 18.8 68 18.8 32"
        fill="var(--color-accent)"
        stroke="var(--color-accent)"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <path
        d="M38 35v30h24"
        fill="none"
        stroke="var(--color-accent-fg)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
