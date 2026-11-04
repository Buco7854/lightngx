import { useId, useState, type ReactNode } from "react";
import { CodeIcon, ChevronDownIcon } from "../icons";
import { useI18n } from "../i18n";
import { Kbd, Switch } from "../ui";


export function EditorRail({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <div className={`editor-rail ${expanded ? "expanded" : ""}`}>
      <button className="editor-rail-trigger" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        <span>{t.editorOptions}</span><ChevronDownIcon size={15} />
      </button>
      <div id={id} className="editor-rail-content">{children}</div>
    </div>
  );
}

export function RailSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2 max-[899px]:flex-wrap max-[899px]:items-center min-[900px]:flex-col min-[900px]:gap-2">
      {label && (
        <span className="text-xs font-medium text-dim max-[899px]:hidden">
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
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-panel px-3 py-2 max-[899px]:py-1.5">
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
