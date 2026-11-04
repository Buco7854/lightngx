import { type Tag } from "../../api";
import { useI18n } from "../../i18n";
import { PencilIcon, PlusIcon, XIcon } from "../../icons";
import { Btn, IconBtn, MultiCombobox } from "../../ui";

// One picker for the file workspace and bulk editing. Counts describe saved
// coverage; drafts can override a label to all files or no files.
export default function TagPicker({
  tags,
  files,
  changes,
  disabled,
  onToggle,
  onRemove,
  onReset,
  onCreate,
  onEdit,
}: {
  tags: (Tag & { count: number })[];
  files: number;
  changes?: Map<number, boolean>;
  disabled?: boolean;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onReset?: (id: number) => void;
  onCreate: () => void;
  onEdit?: (tag: Tag) => void;
}) {
  const { t } = useI18n();
  const count = (tag: Tag & { count: number }) =>
    changes?.has(tag.id) ? (changes.get(tag.id) ? files : 0) : tag.count;
  const assigned = tags.filter((tag) => count(tag) > 0);
  const description = (tag: Tag & { count: number }) => {
    const n = count(tag);
    return n === 0
      ? t.batchUnassigned
      : files === 1
        ? t.tagAssigned
        : n === files
          ? t.batchOnAll
          : t.batchOnSome(n, files);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MultiCombobox
          className="min-w-0 flex-1"
          ariaLabel={t.tagChooseManual}
          searchPlaceholder={t.tagSearch}
          placeholder={t.tagChooseManual}
          selected={tags.filter((tag) => count(tag) === files).map((tag) => String(tag.id))}
          mixed={tags
            .filter((tag) => count(tag) > 0 && count(tag) < files)
            .map((tag) => String(tag.id))}
          wrapLabel
          summary={t.tagChooseManual}
          doneLabel={t.tagDone}
          emptyLabel={t.noMatches}
          disabled={disabled}
          options={tags.map((tag) => ({
            value: String(tag.id),
            label: tag.name,
            description: description(tag),
          }))}
          onToggle={(id) => onToggle(Number(id))}
        />
        <Btn
          type="button"
          onClick={onCreate}
          disabled={disabled}
          className="shrink-0"
          aria-label={t.tagNew}
        >
          <PlusIcon size={15} />
          <span className="max-[460px]:sr-only">{t.tagNew}</span>
        </Btn>
      </div>
      {assigned.length > 0 ? (
        <ul className="flex list-none flex-wrap gap-2 p-0" aria-label={t.tagAssignedLabels}>
          {assigned.map((tag) => (
            <li
              key={tag.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-inset py-1 pl-2.5 pr-1 text-[13px]"
            >
              {onEdit ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onEdit(tag)}
                  aria-label={t.tagEditNamed(tag.name)}
                  className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded text-left"
                >
                  <span className="break-words">{tag.name}</span>
                  <PencilIcon size={12} className="shrink-0 text-faint" />
                </button>
              ) : (
                <span className="min-w-0 break-words">{tag.name}</span>
              )}
              {count(tag) < files && (
                <span className="shrink-0 px-1 text-xs text-dim tabular-nums">
                  {count(tag)}/{files}
                </span>
              )}
              <IconBtn
                type="button"
                size="xs"
                disabled={disabled}
                aria-label={t.tagRemoveNamed(tag.name)}
                onClick={() => onRemove(tag.id)}
              >
                <XIcon size={13} />
              </IconBtn>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-1 text-[13px] text-dim">{t.tagNoManualAssigned}</p>
      )}
      {changes && changes.size > 0 && (
        <div className="space-y-2 border-t border-line-soft pt-3" aria-label={t.tagPendingChanges}>
          <p className="text-xs font-medium text-dim">{t.tagPendingChanges}</p>
          {[...changes].map(([id, add]) => (
            <div key={id} className="flex items-center gap-2 text-[13px]">
              <span className="min-w-0 flex-1 break-words">
                {add
                  ? t.tagWillAdd(tags.find((tag) => tag.id === id)?.name ?? "")
                  : t.tagWillRemove(tags.find((tag) => tag.id === id)?.name ?? "")}
              </span>
              <Btn
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onReset?.(id)}
              >
                {t.tagUndo}
              </Btn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
