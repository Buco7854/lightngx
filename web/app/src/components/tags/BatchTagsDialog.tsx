import { useCallback, useEffect, useId, useState } from "react";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import { PlusIcon } from "../../icons";
import { useToast } from "../../toast";
import { Btn, Checkbox, Input, Loading, Modal, SearchInput, Segmented, Spinner } from "../../ui";
import { catalogEvent } from "./useTags";

type Selection = Awaited<ReturnType<typeof api.batchTagSelection>>;

export default function BatchTagsDialog({
  paths,
  onClose,
  onChanged,
}: {
  paths: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const nameId = useId();
  const [data, setData] = useState<Selection | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.batchTagSelection(paths);
      setData(next);
      setError("");
      setPicked(
        (previous) => new Set([...previous].filter((id) => next.tags.some((tag) => tag.id === id))),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [paths]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const result = await api.batchFileTags(paths, [...picked], mode);
      toast(mode === "add" ? t.batchTagsAdded(result.files) : t.batchTagsRemoved(result.files));
      onChanged();
      onClose();
      requestAnimationFrame(() => {
        if (document.activeElement === document.body)
          document.querySelector<HTMLElement>("[data-batch-select] input")?.focus();
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createTag() {
    setBusy(true);
    setError("");
    try {
      const tag = await api.saveTag({ name: name.trim(), mode: "all", rules: [] });
      setData((previous) =>
        previous
          ? {
              ...previous,
              tags: [...previous.tags, { ...tag, count: 0 }].sort((a, b) =>
                a.name.localeCompare(b.name),
              ),
            }
          : previous,
      );
      setPicked((previous) => new Set([...previous, tag.id]));
      setName("");
      setQuery("");
      setCreating(false);
      window.dispatchEvent(new Event(catalogEvent));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible =
    data?.tags.filter((tag) =>
      tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ) ?? [];
  return (
    <Modal
      title={t.batchTagsTitle}
      hint={t.batchTagsHint(data?.files ?? paths.length)}
      closeLabel={t.close}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <span className="mr-auto text-xs text-dim max-[460px]:w-full" role="status">
            {t.batchTagsChosen(picked.size)}
          </span>
          <Btn type="button" disabled={busy} onClick={onClose}>
            {t.cancel}
          </Btn>
          <Btn
            type="button"
            variant="primary"
            disabled={busy || loading || !data || !picked.size}
            onClick={() => void apply()}
          >
            {busy && <Spinner />}
            {mode === "add" ? t.batchAddTags : t.batchRemoveTags}
          </Btn>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger-ink"
          >
            {error}
          </div>
        )}
        <fieldset disabled={busy || loading} className="min-w-0 space-y-4">
          <Segmented
            value={mode}
            ariaLabel={t.batchTagOperation}
            options={[
              { value: "add", label: t.batchAdd },
              { value: "remove", label: t.batchRemove },
            ]}
            onChange={(value) => {
              setMode(value);
              setPicked(new Set());
              setCreating(false);
            }}
          />
          <SearchInput value={query} onChange={setQuery} placeholder={t.tagSearch} />
          {loading ? (
            <Loading />
          ) : data ? (
            <div className="batch-tag-list">
              {visible.length ? (
                visible.map((tag) => {
                  const disabled = mode === "add" ? tag.count === data.files : tag.count === 0;
                  return (
                    <label
                      key={tag.id}
                      className={`batch-tag-row ${disabled ? "text-dim" : "cursor-pointer hover:bg-hov"}`}
                    >
                      <Checkbox
                        checked={picked.has(tag.id)}
                        disabled={disabled || busy}
                        ariaLabel={tag.name}
                        onChange={() =>
                          setPicked((previous) => {
                            const next = new Set(previous);
                            if (next.has(tag.id)) next.delete(tag.id);
                            else next.add(tag.id);
                            return next;
                          })
                        }
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1 min-[461px]:flex-row min-[461px]:items-center min-[461px]:gap-3">
                        <span className="min-w-0 flex-1 break-words text-sm">{tag.name}</span>
                        <span className="shrink-0 text-xs text-dim tabular-nums">
                          {tag.count === 0
                            ? t.batchUnassigned
                            : tag.count === data.files
                              ? t.batchOnAll
                              : t.batchOnSome(tag.count, data.files)}
                        </span>
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="px-3 py-5 text-center text-sm text-dim">
                  {query ? t.noMatches : t.batchNoManualTags}
                </p>
              )}
            </div>
          ) : (
            <Btn type="button" onClick={() => void refresh()}>
              {t.tagRetry}
            </Btn>
          )}
          {data &&
            mode === "add" &&
            (creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim() && !busy) void createTag();
                }}
                className="space-y-2"
              >
                <label htmlFor={nameId} className="block text-[13px] font-medium">
                  {t.tagName}
                </label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id={nameId}
                    autoFocus
                    required
                    maxLength={48}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="min-w-0 flex-1 max-[460px]:basis-full"
                    placeholder={t.tagNameExample}
                  />
                  <Btn type="submit" disabled={!name.trim() || busy}>
                    {t.create}
                  </Btn>
                  <Btn type="button" variant="ghost" onClick={() => setCreating(false)}>
                    {t.cancel}
                  </Btn>
                </div>
                <p className="text-xs text-dim">{t.batchCreateHint}</p>
              </form>
            ) : (
              <Btn type="button" variant="ghost" onClick={() => setCreating(true)}>
                <PlusIcon size={15} />
                {t.batchNewManualTag}
              </Btn>
            ))}
        </fieldset>
        <p className="text-xs leading-relaxed text-dim">{t.batchSmartHint}</p>
      </div>
    </Modal>
  );
}
