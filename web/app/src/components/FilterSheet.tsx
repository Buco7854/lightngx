import type { ReactNode } from "react";
import type { Tag } from "../api";
import { useI18n } from "../i18n";
import { Btn, Modal } from "../ui";
import { TagFilters } from "./Tags";

// Mobile filtering is one focused task. The same URL-backed controls remain
// inline on desktop; this sheet shares their state and preserves menu portals.
export default function FilterSheet({
  open, onClose, active, onReset, resultCount, tags, tagError, onTagsChanged, status,
}: {
  open: boolean;
  onClose: () => void;
  active: boolean;
  onReset: () => void;
  resultCount: number;
  tags: Tag[];
  tagError: string;
  onTagsChanged: () => void;
  status?: ReactNode;
}) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <Modal
      title={t.filters}
      closeLabel={t.close}
      onClose={onClose}
      mobileSheet
      footer={
        <div className="filter-sheet-footer">
          <Btn onClick={onReset} disabled={!active}>{t.resetFilters}</Btn>
          <Btn variant="primary" onClick={onClose}>{t.showResults(resultCount)}</Btn>
        </div>
      }
    >
      <div className="filter-sheet-fields">
        {status && <section className="filter-status-section"><h3>{t.filterStatus}</h3>{status}</section>}
        <section><h3>{t.tags}</h3><TagFilters tags={tags} error={tagError} onChanged={onTagsChanged} panel /></section>
      </div>
    </Modal>
  );
}
