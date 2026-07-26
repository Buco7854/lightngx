import type { ReactNode } from "react";
import { CodeIcon } from "../icons";
import { useI18n } from "../i18n";
import { Kbd, Switch } from "../ui";


export function EditorRail({ children }: { children: ReactNode }) {
  return (
    <div
      className={
        "flex shrink-0 border-line bg-panel " +
        "max-[899px]:flex-row max-[899px]:flex-wrap max-[899px]:items-center max-[899px]:gap-2 " +
        "max-[899px]:border-b max-[899px]:px-3 max-[899px]:py-2.5 " +
        "min-[900px]:w-[216px] min-[900px]:flex-col min-[900px]:gap-5 min-[900px]:overflow-y-auto " +
        "min-[900px]:border-l min-[900px]:p-4"
      }
    >
      {children}
    </div>
  );
}

export function RailSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2 max-[899px]:flex-wrap max-[899px]:items-center min-[900px]:flex-col min-[900px]:gap-2">
      {label && (
        <span className="text-[11px] font-semibold tracking-wider text-faint uppercase max-[899px]:hidden">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

export function RailToggle({
  label,
  checked,
  warn = false,
  ariaLabel,
  onToggle,
}: {
  label: string;
  checked: boolean;
  warn?: boolean;
  ariaLabel: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-inset px-3 py-2 max-[899px]:py-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      <Switch checked={checked} warn={warn} label={ariaLabel} onToggle={onToggle} />
    </div>
  );
}

export function EditorStatus({
  cursor,
  readOnly = false,
}: {
  cursor: { line: number; col: number };
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-[11.5px] text-faint min-[761px]:px-4">
      <span className="flex items-center gap-1.5">
        <CodeIcon size={13} /> nginx
      </span>
      <span className="tabular-nums">{t.lineCol(cursor.line, cursor.col)}</span>
      {readOnly && <span className="font-medium text-warn-ink">{t.readOnly}</span>}
      <span className="flex-1" />
      <span className="flex items-center gap-1.5 max-[600px]:hidden">
        {t.save} <Kbd>{mod}S</Kbd>
      </span>
    </div>
  );
}
