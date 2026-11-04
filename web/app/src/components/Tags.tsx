import { useState } from "react";
import type { Tag } from "../api";
import { useI18n } from "../i18n";
import { setQuery, useLocation } from "../router";
import { BoltIcon, PencilIcon, PlusIcon, TagIcon, XIcon } from "../icons";
import { Badge, Btn, Combobox } from "../ui";
import { useFileTags, useTags } from "./tags/useTags";
import TagWorkspace from "./tags/TagWorkspace";

export { useTags } from "./tags/useTags";

function ids(value: string | null): number[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map(Number)
        .filter((n) => Number.isSafeInteger(n) && n > 0),
    ),
  ];
}
export function useTagFilter() {
  const loc = useLocation();
  const include = loc.searchParams.get("tags");
  const exclude = loc.searchParams.get("excludeTags");
  const required = ids(include),
    rejected = ids(exclude);
  return {
    key: `${include ?? ""}|${exclude ?? ""}`,
    active: required.length + rejected.length > 0,
    matches: (tags: number[] = []) =>
      required.every((id) => tags.includes(id)) && !rejected.some((id) => tags.includes(id)),
    value: (id: number) =>
      rejected.includes(id) ? "exclude" : required.includes(id) ? "include" : "any",
    set: (id: number, value: string) => {
      const yes = required.filter((n) => n !== id),
        no = rejected.filter((n) => n !== id);
      if (value === "include") yes.push(id);
      if (value === "exclude") no.push(id);
      setQuery({ tags: yes.join(",") || null, excludeTags: no.join(",") || null });
    },
    clear: () => setQuery({ tags: null, excludeTags: null }),
  };
}

export function TagBadges({ ids = [], tags }: { ids?: number[]; tags: Tag[] }) {
  const { t } = useI18n();
  if (!ids.length) return null;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {tags
        .filter((tag) => ids.includes(tag.id))
        .map((tag) => (
          <Badge
            key={tag.id}
            tone="accent"
            className="max-w-full gap-1 rounded-md px-2 text-[11.5px]"
          >
            {tag.rules.length > 0 && <BoltIcon size={11} />}
            <span
              className="truncate"
              title={tag.rules.length ? `${tag.name} · ${t.tagSmart}` : tag.name}
            >
              {tag.name}
            </span>
          </Badge>
        ))}
    </span>
  );
}

// A compact filter builder scales with the selected tags, rather than adding
// a row and a separate select for every definition in the catalog.
export function TagFilters({
  tags,
  error,
  onChanged,
  panel = false,
}: {
  panel?: boolean;
  tags: Tag[];
  error: string;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const filter = useTagFilter();
  const [manage, setManage] = useState(false);
  const selected = tags.filter((tag) => filter.value(tag.id) !== "any");
  return (
    <div className={`tag-filters ${panel ? "tag-filters-panel" : ""} shrink-0 border-b border-line bg-panel px-3 py-2.5 min-[761px]:px-5`}>
      <div className="tag-filter-controls flex flex-wrap items-center gap-2">
        <span className="tag-filter-legend mr-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-dim">
          <TagIcon size={14} />
          {t.tags}
        </span>
        <div className="tag-filter-field">
          {panel && <span className="tag-filter-field-label">{t.tagIncludePicker}</span>}
          <Combobox
            value=""
            onChange={(id) => filter.set(Number(id), "include")}
            options={tags
              .filter((tag) => filter.value(tag.id) !== "include")
              .map((tag) => ({ value: String(tag.id), label: tag.name }))}
            placeholder={t.tagInclude}
            ariaLabel={t.tagIncludePicker}
            search
            emptyLabel={t.noMatches}
            className="w-[140px]"
            disabled={!tags.length}
          />
        </div>
        <div className="tag-filter-field">
          {panel && <span className="tag-filter-field-label">{t.tagExcludePicker}</span>}
          <Combobox
            value=""
            onChange={(id) => filter.set(Number(id), "exclude")}
            options={tags
              .filter((tag) => filter.value(tag.id) !== "exclude")
              .map((tag) => ({ value: String(tag.id), label: tag.name }))}
            placeholder={t.tagExclude}
            ariaLabel={t.tagExcludePicker}
            search
            emptyLabel={t.noMatches}
            className="w-[140px]"
            disabled={!tags.length}
          />
        </div>
        <Btn
          type="button"
          size="sm"
          variant="ghost"
          className="tag-filter-manage ml-auto"
          onClick={() => setManage(true)}
        >
          <PencilIcon size={13} />
          {t.tagManage}
        </Btn>
      </div>
      {filter.active && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {selected.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => filter.set(tag.id, "any")}
              aria-label={t.tagRemoveFilter(tag.name)}
              className={`inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${filter.value(tag.id) === "exclude" ? "border-line bg-ctrl text-dim hover:bg-ctrl-hi" : "border-accent/20 bg-accent-soft text-accent-ink hover:border-accent/40"}`}
            >
              <span>{filter.value(tag.id) === "exclude" ? "−" : "+"}</span>
              <span className="truncate">{tag.name}</span>
              <XIcon size={12} />
            </button>
          ))}
          <Btn type="button" size="sm" variant="ghost" className="tag-filter-clear" onClick={filter.clear}>
            {t.tagClear}
          </Btn>
          <span className="w-full pt-1 text-[11.5px] text-dim">{panel ? t.tagFilterPanelHint : t.tagFilterHint}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-2 flex items-center gap-2 text-sm text-danger-ink">
          {error}
          <Btn size="sm" type="button" onClick={onChanged}>
            {t.tagRetry}
          </Btn>
        </div>
      )}
      {manage && <TagWorkspace onClose={() => setManage(false)} onChanged={onChanged} />}
    </div>
  );
}

// Editors expose the assigned labels and direct rule editing in the same rail
// as their other settings. Opening a label never navigates away from the file.
export function FileTagsButton({
  path,
  revision,
  onChanged,
  disabled = false,
}: {
  path: string;
  revision?: string;
  onChanged: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const catalog = useTags();
  const file = useFileTags(path, revision, !disabled);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | undefined>();
  const applied = catalog.tags.filter((tag) => file.data?.tags.includes(tag.id));
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 min-[900px]:flex-col min-[900px]:items-stretch">
      {applied.map((tag) => (
        <button
          type="button"
          key={tag.id}
          disabled={disabled}
          title={t.tagEditNamed(tag.name)}
          aria-label={t.tagEditNamed(tag.name)}
          onClick={() => {
            setEditing(tag);
            setOpen(true);
          }}
          className="group inline-flex min-h-8 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border border-line-soft bg-inset px-2.5 text-left text-[12px] font-medium text-fg transition-colors hover:border-accent/30 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        >
          {file.data?.automatic.includes(tag.id) ? (
            <BoltIcon size={12} className="shrink-0 text-accent-ink" />
          ) : (
            <TagIcon size={12} className="shrink-0 text-faint" />
          )}
          <span className="truncate">{tag.name}</span>
          <PencilIcon size={11} className="ml-auto shrink-0 text-faint" />
        </button>
      ))}
      <Btn
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        className="justify-start"
        onClick={() => {
          setEditing(undefined);
          setOpen(true);
        }}
      >
        <PlusIcon size={14} />
        {applied.length ? t.tagAddTags : t.tags}
      </Btn>
      {(file.error || catalog.error) && (
        <span className="text-xs text-danger-ink" role="alert">
          {file.error || catalog.error}
        </span>
      )}
      {open && (
        <TagWorkspace
          path={path}
          initialTag={editing}
          onClose={() => setOpen(false)}
          onChanged={() => {
            void file.refresh();
            onChanged();
          }}
        />
      )}
    </div>
  );
}
