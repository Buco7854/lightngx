import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Tag, type TagRule } from "../api";
import { useI18n } from "../i18n";
import { setQuery, useLocation } from "../router";
import { Btn, Badge, Input } from "../ui";

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    api
      .tags()
      .then((r) => {
        setTags(r.tags);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(refresh, [refresh]);
  return { tags, refresh, error };
}

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

const selectClass =
  "min-h-10 max-w-full rounded-lg border border-line bg-inset px-2 text-sm text-fg focus:outline-2 focus:outline-accent";

// A native modal supplies focus containment, Escape handling and focus return.
function TagDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-raise p-5 text-fg shadow-xl backdrop:bg-black/50"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <Btn type="button" size="sm" onClick={onClose}>
          {t.close}
        </Btn>
      </div>
      {children}
    </dialog>
  );
}

export function TagBadges({ ids = [], tags }: { ids?: number[]; tags: Tag[] }) {
  const { t } = useI18n();
  if (!ids.length) return null;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {tags
        .filter((tag) => ids.includes(tag.id))
        .map((tag) => (
          <span
            key={tag.id}
            title={tag.rules.length ? `${tag.name} · ${t.tagSmart}` : tag.name}
            className="max-w-full truncate rounded-md bg-accent-soft px-2 py-0.5 text-xs text-accent-ink"
          >
            {tag.name}
          </span>
        ))}
    </span>
  );
}

export function TagFilters({
  tags,
  error,
  onChanged,
}: {
  tags: Tag[];
  error: string;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const filter = useTagFilter();
  const [open, setOpen] = useState(false),
    [manage, setManage] = useState(false);
  return (
    <div className="shrink-0 border-b border-line bg-panel px-3 py-2 min-[761px]:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Btn type="button" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t.tags}
          {filter.active && <Badge tone="accent">{t.tagFiltered}</Badge>}
        </Btn>
        {filter.active && (
          <>
            <span className="text-xs text-dim">
              {tags
                .filter((tag) => filter.value(tag.id) !== "any")
                .map((tag) => `${filter.value(tag.id) === "exclude" ? "−" : "+"}${tag.name}`)
                .join(", ")}
            </span>
            <Btn type="button" size="sm" onClick={filter.clear}>
              {t.tagClear}
            </Btn>
          </>
        )}
        <Btn
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => setManage(true)}
        >
          {t.tagManage}
        </Btn>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-ink">
          {error}
        </p>
      )}
      {open && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-dim">{t.tagFilterHint}</p>
          {!tags.length ? (
            <p className="py-2 text-sm text-dim">{t.tagEmpty}</p>
          ) : (
            <div className="grid max-h-64 gap-x-6 gap-y-2 overflow-y-auto min-[700px]:grid-cols-2">
              {tags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex min-w-0 items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate" title={tag.name}>
                    {tag.name}
                    {tag.rules.length > 0 && (
                      <span className="ml-2 text-xs text-dim">{t.tagSmart}</span>
                    )}
                  </span>
                  <select
                    aria-label={`${t.tags}: ${tag.name}`}
                    className={selectClass}
                    value={filter.value(tag.id)}
                    onChange={(e) => filter.set(tag.id, e.target.value)}
                  >
                    <option value="any">{t.tagAny}</option>
                    <option value="include">{t.tagInclude}</option>
                    <option value="exclude">{t.tagExclude}</option>
                  </select>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {manage && <TagManager tags={tags} onClose={() => setManage(false)} onChanged={onChanged} />}
    </div>
  );
}

function TagManager({
  tags,
  onClose,
  onChanged,
}: {
  tags: Tag[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"all" | "any">("all");
  const [rules, setRules] = useState<TagRule[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function edit(tag: Tag | null) {
    setEditing(tag);
    setName(tag?.name ?? "");
    setMode(tag?.mode ?? "all");
    setRules(tag?.rules ?? []);
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.saveTag({ name, mode, rules }, editing?.id);
      edit(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(tag: Tag) {
    setBusy(true);
    setError("");
    try {
      await api.deleteTag(tag.id);
      setPendingDelete(null);
      if (editing?.id === tag.id) edit(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function updateRule(index: number, patch: Partial<TagRule>) {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  return (
    <TagDialog
      title={t.tagManage}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="mb-4 text-sm text-dim">{t.tagManagerHint}</p>
      <div className="mb-4 max-h-44 overflow-auto divide-y divide-line-soft">
        {tags.map((tag) => (
          <div key={tag.id} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">
              {tag.name}{" "}
              <span className="text-xs text-dim">
                {tag.rules.length ? t.tagSmart : t.tagManual}
              </span>
            </span>
            <Btn type="button" size="sm" disabled={busy} onClick={() => edit(tag)}>
              {t.tagEditAction}
            </Btn>
            <Btn
              type="button"
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => setPendingDelete(tag)}
            >
              {t.deleteAction}
            </Btn>
          </div>
        ))}
      </div>
      {pendingDelete && (
        <div role="alert" className="mb-4 rounded-xl border border-line p-3">
          <p className="mb-3 text-sm">{t.tagDeleteConfirm(pendingDelete.name)}</p>
          <div className="flex justify-end gap-2">
            <Btn type="button" size="sm" disabled={busy} onClick={() => setPendingDelete(null)}>
              {t.cancel}
            </Btn>
            <Btn
              type="button"
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => void remove(pendingDelete)}
            >
              {t.deleteAction}
            </Btn>
          </div>
        </div>
      )}
      <form onSubmit={save} className="space-y-3 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">{editing ? t.tagEdit : t.tagNew}</h3>
        <label className="block text-sm">
          {t.tagName}
          <Input
            className="mt-1 w-full"
            required
            maxLength={48}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          {t.tagMatch}
          <select
            className={selectClass}
            value={mode}
            onChange={(e) => setMode(e.target.value as "all" | "any")}
            disabled={busy}
          >
            <option value="all">{t.tagAllRules}</option>
            <option value="any">{t.tagAnyRule}</option>
          </select>
        </label>
        {rules.map((rule, i) => (
          <fieldset key={i} disabled={busy} className="space-y-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-xs text-dim">
              {t.tagRule} {i + 1}
            </legend>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label={`${t.tagField} ${i + 1}`}
                className={`${selectClass} flex-1`}
                value={rule.field}
                onChange={(e) => updateRule(i, { field: e.target.value as TagRule["field"] })}
              >
                <option value="content">{t.tagContent}</option>
                <option value="path">{t.tagPath}</option>
              </select>
              <select
                aria-label={`${t.tagOperator} ${i + 1}`}
                className={`${selectClass} flex-1`}
                value={rule.op}
                onChange={(e) => updateRule(i, { op: e.target.value as TagRule["op"] })}
              >
                <option value="contains">{t.tagContains}</option>
                <option value="regex">{t.tagRegex}</option>
              </select>
            </div>
            <label className="block text-xs text-dim">
              {t.tagValue}
              <textarea
                className={`${selectClass} mt-1 block w-full py-2 font-mono`}
                rows={2}
                required
                maxLength={4096}
                value={rule.value}
                onChange={(e) => updateRule(i, { value: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-h-8 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rule.ignoreCase}
                  onChange={(e) => updateRule(i, { ignoreCase: e.target.checked })}
                />
                {t.tagIgnoreCase}
              </label>
              <Btn
                type="button"
                size="sm"
                onClick={() => setRules(rules.filter((_, n) => n !== i))}
              >
                {t.tagRemoveRule}
              </Btn>
            </div>
          </fieldset>
        ))}
        <Btn
          type="button"
          size="sm"
          disabled={busy || rules.length >= 16}
          onClick={() =>
            setRules([...rules, { field: "content", op: "contains", value: "", ignoreCase: false }])
          }
        >
          {t.tagAddRule}
        </Btn>
        {error && (
          <p role="alert" className="text-sm text-danger-ink">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {editing && (
            <Btn type="button" disabled={busy} onClick={() => edit(null)}>
              {t.cancel}
            </Btn>
          )}
          <Btn type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? t.tagSaving : t.save}
          </Btn>
        </div>
      </form>
    </TagDialog>
  );
}

export function FileTagsButton({
  path,
  onChanged,
  disabled = false,
}: {
  path: string;
  onChanged: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn type="button" disabled={disabled} onClick={() => setOpen(true)}>
        {t.tags}
      </Btn>
      {open && (
        <FileTagsDialog
          key={path}
          path={path}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
function FileTagsDialog({
  path,
  onClose,
  onChanged,
}: {
  path: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { tags, error: loadError } = useTags();
  const [manual, setManual] = useState<number[] | null>(null),
    [matched, setMatched] = useState<number[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .fileTags(path)
      .then((r) => {
        setManual(r.manual);
        setMatched(r.automatic);
      })
      .catch((e) => setError(e.message));
  }, [path]);
  async function save() {
    if (manual === null) return;
    setBusy(true);
    setError("");
    try {
      await api.setFileTags(path, manual);
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <TagDialog
      title={t.tags}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="mb-2 break-all font-mono text-xs text-dim">{path}</p>
      <p className="mb-4 text-sm text-dim">{t.tagFileHint}</p>
      {(error || loadError) && (
        <p role="alert" className="text-sm text-danger-ink">
          {error || loadError}
        </p>
      )}
      {manual !== null && !tags.length && <p className="text-sm text-dim">{t.tagEmpty}</p>}
      <div className="space-y-2">
        {manual !== null &&
          tags.map((tag) => (
            <label key={tag.id} className="flex min-h-10 items-center gap-3 text-sm">
              <input
                type="checkbox"
                disabled={busy}
                checked={manual.includes(tag.id)}
                onChange={(e) =>
                  setManual(
                    e.target.checked ? [...manual, tag.id] : manual.filter((id) => id !== tag.id),
                  )
                }
              />
              <span className="min-w-0 flex-1 break-words">{tag.name}</span>
              {matched.includes(tag.id) && <Badge tone="accent">{t.tagAutomatic}</Badge>}
            </label>
          ))}
      </div>
      <div className="mt-5 flex justify-end">
        <Btn
          type="button"
          variant="primary"
          disabled={busy || manual === null || !!loadError}
          onClick={() => void save()}
        >
          {busy ? t.tagSaving : t.save}
        </Btn>
      </div>
    </TagDialog>
  );
}
