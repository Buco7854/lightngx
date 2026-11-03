import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, type Tag } from "../../api";
import { useConfirm } from "../../confirm";
import { useI18n } from "../../i18n";
import {
  BackIcon,
  BoltIcon,
  CheckIcon,
  FileIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  XIcon,
} from "../../icons";
import {
  Badge,
  Btn,
  Checkbox,
  Dropdown,
  EmptyState,
  Loading,
  MenuItem,
  Modal,
  SearchInput,
  Spinner,
} from "../../ui";
import { AuthError } from "../auth/fields";
import { catalogEvent, useFileTags, useTags } from "./useTags";
import TagForm from "./TagForm";

type View = { kind: "list" } | { kind: "edit"; tag?: Tag } | { kind: "delete"; tag: Tag };

export default function TagWorkspace({
  path,
  initialTag,
  onClose,
  onChanged,
}: {
  path?: string;
  initialTag?: Tag;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const ask = useConfirm();
  const catalog = useTags();
  const file = useFileTags(path);
  const [view, setView] = useState<View>(
    initialTag ? { kind: "edit", tag: initialTag } : { kind: "list" },
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = useRef(false);
  const markDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const initialView = useRef(true);
  const formId = useId();
  useEffect(() => {
    if (initialView.current) {
      initialView.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [view.kind]);
  async function leave(close = false) {
    if (busy) return;
    if (
      dirty.current &&
      !(await ask({ title: t.unsavedChanges, message: t.discardChanges, danger: true }))
    )
      return;
    markDirty(false);
    setError("");
    if (close) onClose();
    else setView({ kind: "list" });
  }
  function changedCatalog() {
    window.dispatchEvent(new Event(catalogEvent));
    onChanged();
  }
  async function toggle(tag: Tag) {
    if (!path || !file.data || busy || tag.rules.length) return;
    const manual = file.data.manual.includes(tag.id)
      ? file.data.manual.filter((id) => id !== tag.id)
      : [...file.data.manual, tag.id];
    const previous = file.data;
    file.setData({ ...previous, manual, tags: [...new Set([...manual, ...previous.automatic])] });
    setBusy(true);
    setError("");
    try {
      file.setData(await api.setFileTags(path, manual));
      onChanged();
    } catch (err) {
      file.setData(previous);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(definition: Omit<Tag, "id">, assign: boolean) {
    if (view.kind !== "edit" || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api.saveTag(definition, view.tag?.id);
      changedCatalog();
      let assignmentError = "";
      if (path && !view.tag && assign && !definition.rules.length && file.data) {
        try {
          file.setData(await api.setFileTags(path, [...file.data.manual, saved.id]));
          onChanged();
        } catch (err) {
          assignmentError = t.tagAssignFailed((err as Error).message);
        }
      } else if (path) await file.refresh();
      markDirty(false);
      setView({ kind: "list" });
      setError(assignmentError);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(tag: Tag) {
    setBusy(true);
    setError("");
    try {
      await api.deleteTag(tag.id);
      changedCatalog();
      setView({ kind: "list" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = catalog.tags.filter((tag) =>
    tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const ordered =
    path && file.data
      ? [...filtered].sort(
          (a, b) => Number(file.data!.tags.includes(b.id)) - Number(file.data!.tags.includes(a.id)),
        )
      : filtered;
  const manualTags = ordered.filter((tag) => !tag.rules.length);
  const smartTags = ordered.filter((tag) => tag.rules.length > 0);
  const grouped = [...manualTags, ...smartTags];
  const title =
    view.kind === "edit"
      ? view.tag
        ? t.tagEdit
        : t.tagNew
      : view.kind === "delete"
        ? t.tagDelete
        : path
          ? t.tags
          : t.tagManage;
  const loading = catalog.loading || (!!path && file.data === null && !file.error);
  const loadError = catalog.error || file.error;
  useEffect(() => {
    if (error || loadError) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error, loadError]);
  return (
    <Modal
      title={title}
      closeLabel={t.close}
      size="lg"
      onClose={() => void leave(true)}
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <TagIcon size={18} />
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {view.kind === "list" ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-dim" role="status">
                {path && <CheckIcon size={13} />}
                {path ? (busy ? t.tagSaving : t.tagAutoSaved) : t.itemsCount(catalog.tags.length)}
              </span>
              <Btn type="button" onClick={() => void leave(true)} disabled={busy}>
                {t.tagDone}
              </Btn>
            </>
          ) : (
            <>
              <Btn type="button" disabled={busy} onClick={() => void leave()}>
                <BackIcon size={14} />
                {t.back}
              </Btn>
              {view.kind === "edit" ? (
                <Btn
                  type="submit"
                  form={formId}
                  variant="primary"
                  disabled={busy || (!!path && file.data === null)}
                >
                  {busy && <Spinner light />}
                  {view.tag ? t.save : path ? t.tagCreate : t.create}
                </Btn>
              ) : (
                <Btn
                  type="button"
                  variant="danger-solid"
                  disabled={busy}
                  onClick={() => void remove(view.tag)}
                >
                  {busy && <Spinner light />}
                  {t.tagDelete}
                </Btn>
              )}
            </>
          )}
        </div>
      }
    >
      {path && (
        <div className="mb-4 flex min-w-0 items-start gap-2 rounded-lg bg-inset px-3 py-2 text-xs text-dim">
          <FileIcon size={14} className="mt-px shrink-0" />
          <span className="break-all font-mono">{path}</span>
        </div>
      )}
      <h3 ref={headingRef} tabIndex={-1} className="sr-only">
        {title}
      </h3>
      {(error || loadError) && (
        <div ref={errorRef} role="alert" className="mb-4">
          <AuthError>{error || loadError}</AuthError>
          {loadError && (
            <Btn
              type="button"
              size="sm"
              className="mt-2"
              onClick={() => {
                void catalog.refresh();
                void file.refresh();
              }}
            >
              {t.tagRetry}
            </Btn>
          )}
        </div>
      )}
      {view.kind === "list" ? (
        <>
          <div className="mb-4 flex items-center gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={t.tagSearch}
              ariaLabel={t.tagSearch}
              className="min-w-0 flex-1"
            />
            <Btn
              type="button"
              disabled={busy || (!!path && file.data === null) || catalog.tags.length >= 128}
              onClick={() => {
                setError("");
                setView({ kind: "edit" });
              }}
            >
              <PlusIcon size={15} />
              {t.tagNew}
            </Btn>
          </div>
          {loading && !catalog.tags.length ? (
            <Loading />
          ) : ordered.length === 0 ? (
            <EmptyState
              icon={<TagIcon size={22} />}
              title={query ? t.noMatches : t.tagEmpty}
              hint={query ? t.noMatchesHint : t.tagStartHint}
              action={
                !query && (
                  <Btn
                    type="button"
                    variant="primary"
                    disabled={!!path && file.data === null}
                    onClick={() => setView({ kind: "edit" })}
                  >
                    <PlusIcon size={15} />
                    {t.tagNew}
                  </Btn>
                )
              }
            />
          ) : (
            <>
              <p className="mb-3 text-[12px] leading-relaxed text-dim">
                {path ? t.tagFileHint : t.tagManagerHint}
              </p>
              <div className="divide-y divide-line-soft rounded-xl border border-line-soft">
                {grouped.map((tag, index) => {
                  const manual = file.data?.manual.includes(tag.id) ?? false;
                  const automatic = file.data?.automatic.includes(tag.id) ?? false;
                  const heading =
                    index === 0 || (index === manualTags.length && smartTags.length > 0);
                  return (
                    <div key={tag.id}>
                      {heading && (
                        <h4 className="bg-inset px-3 py-2 text-[11px] font-semibold text-dim">
                          {tag.rules.length ? t.tagSmart : t.tagManual}
                        </h4>
                      )}
                      <div
                        className={`flex items-center gap-3 px-3 py-3 ${manual || automatic ? "bg-accent-soft/30" : ""}`}
                      >
                        {path && !tag.rules.length ? (
                          <Checkbox
                            checked={manual}
                            disabled={busy || !file.data}
                            onChange={() => void toggle(tag)}
                            ariaLabel={t.tagAssignNamed(tag.name)}
                          />
                        ) : (
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tag.rules.length ? "bg-accent-soft text-accent-ink" : "bg-ctrl text-dim"}`}
                          >
                            {tag.rules.length ? <BoltIcon size={14} /> : <TagIcon size={14} />}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setError("");
                            setView({ kind: "edit", tag });
                          }}
                          aria-label={t.tagEditNamed(tag.name)}
                          className="min-w-0 flex-1 cursor-pointer rounded-md text-left focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <span
                            className="block truncate text-[13.5px] font-medium"
                            title={tag.name}
                          >
                            {tag.name}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-dim">
                            {tag.rules.length
                              ? t.tagRuleSummary(tag.rules.length, tag.mode)
                              : t.tagManual}
                          </span>
                        </button>
                        {path && tag.rules.length > 0 && (
                          <Badge
                            tone={automatic ? "accent" : "neutral"}
                            className="gap-1 px-2 text-[10.5px]"
                          >
                            {automatic ? <CheckIcon size={11} /> : <XIcon size={11} />}
                            <span className="max-[420px]:sr-only">
                              {automatic ? t.tagMatched : t.tagNotMatched}
                            </span>
                          </Badge>
                        )}
                        <Dropdown
                          disabled={busy}
                          ariaLabel={t.moreActions + " " + tag.name}
                          variant="ghost"
                          chevron={false}
                          button={<MoreIcon size={17} />}
                        >
                          {(close) => (
                            <>
                              <MenuItem
                                disabled={busy}
                                onClick={() => {
                                  close();
                                  setError("");
                                  setView({ kind: "edit", tag });
                                }}
                              >
                                <PencilIcon size={15} />
                                {t.tagEdit}
                              </MenuItem>
                              <MenuItem
                                danger
                                disabled={busy}
                                onClick={() => {
                                  close();
                                  setError("");
                                  setView({ kind: "delete", tag });
                                }}
                              >
                                <TrashIcon size={15} />
                                {t.tagDelete}
                              </MenuItem>
                            </>
                          )}
                        </Dropdown>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : view.kind === "edit" ? (
        <TagForm
          key={view.tag?.id ?? "new"}
          tag={view.tag}
          formId={formId}
          path={path}
          busy={busy}
          onDirty={markDirty}
          onSave={save}
        />
      ) : (
        <div className="py-2">
          <p className="text-sm leading-relaxed text-dim">{t.tagDeleteConfirm(view.tag.name)}</p>
          <p className="mt-3 text-xs text-dim">{t.tagDeleteHint}</p>
        </div>
      )}
    </Modal>
  );
}
