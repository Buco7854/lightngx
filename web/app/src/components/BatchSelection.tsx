import type { ReactNode } from "react";
import { useI18n } from "../i18n";
import { TagIcon, XIcon } from "../icons";
import { BATCH_LIMIT } from "../useBatchSelection";
import { Btn, IconBtn } from "../ui";

export default function BatchSelection({
  count,
  total,
  canSelectMore,
  atLimit,
  busy = false,
  onClear,
  onSelectMatching,
  onTags,
  children,
}: {
  count: number;
  total: number;
  canSelectMore: boolean;
  atLimit: boolean;
  busy?: boolean;
  onClear: () => void;
  onSelectMatching: () => void;
  onTags: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  if (!count) return null;
  return (
    <div className="batch-selection" role="region" aria-label={t.batchActions}>
      <div className="batch-selection-main">
        <IconBtn size="sm" disabled={busy} aria-label={t.clearSelection} onClick={onClear}>
          <XIcon size={16} />
        </IconBtn>
        <span role="status" className="mr-auto min-w-0 text-[13px] font-medium tabular-nums">
          {t.selectedCount(count)}
        </span>
        <Btn size="sm" disabled={busy} onClick={onTags}>
          <TagIcon size={15} />
          {t.tags}
        </Btn>
        {children}
      </div>
      {canSelectMore ? (
        <div className="batch-selection-scope">
          <Btn variant="ghost" size="sm" disabled={busy} onClick={onSelectMatching}>
            {total > BATCH_LIMIT ? t.batchSelectFirst(BATCH_LIMIT) : t.batchSelectMatching(total)}
          </Btn>
        </div>
      ) : atLimit && total > BATCH_LIMIT ? (
        <p className="batch-selection-scope text-xs text-dim">{t.batchLimit(BATCH_LIMIT)}</p>
      ) : null}
    </div>
  );
}
