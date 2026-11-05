import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, type Tag } from "../../api";
import { useConfirm } from "../../confirm";
import { useI18n } from "../../i18n";
import { BackIcon } from "../../icons";
import { useToast } from "../../toast";
import { Btn, Loading, Modal, Spinner } from "../../ui";
import { AuthError } from "../auth/fields";
import TagForm from "./TagForm";
import TagPicker from "./TagPicker";
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
  const ask = useConfirm();
  const formId = useId();
  const [data, setData] = useState<Selection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [changes, setChanges] = useState<Map<number, boolean>>(new Map());
  const dirtyForm = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const markDirty = useCallback((value: boolean) => {
    dirtyForm.current = value;
  }, []);
  const refresh = useCallback(async () => {
    try {
      const next = await api.batchTagSelection(paths);
      setData(next);
      setChanges(
        (previous) =>
          new Map([...previous].filter(([id]) => next.tags.some((tag) => tag.id === id))),
      );
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [paths]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function leave() {
    if (busy) return;
    if (
      (changes.size || dirtyForm.current) &&
      !(await ask({ title: t.unsavedChanges, message: t.discardChanges, danger: true }))
    )
      return;
    onClose();
  }
  function update(id: number, assign: boolean) {
    if (!data) return;
    const tag = data.tags.find((tag) => tag.id === id);
    if (!tag) return;
    setChanges((previous) => {
      const next = new Map(previous);
      if ((assign && tag.count === data.files) || (!assign && tag.count === 0)) next.delete(id);
      else next.set(id, assign);
      return next;
    });
  }
  async function apply() {
    if (busy || !changes.size) return;
    setBusy(true);
    setError("");
    try {
      const add = [...changes].filter(([, assign]) => assign).map(([id]) => id);
      const remove = [...changes].filter(([, assign]) => !assign).map(([id]) => id);
      const result = await api.updateBatchTags(paths, add, remove);
      toast(t.tagBatchSaved(result.files));
      onChanged();
      onClose();
      requestAnimationFrame(() => {
        if (document.activeElement === document.body)
          (
            document.querySelector<HTMLElement>("[data-batch-select] input") ??
            document.getElementById("main-content")
          )?.focus();
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(definition: Omit<Tag, "id">) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const tag = await api.saveTag({ ...definition, rules: [] });
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
      setChanges((previous) => new Map(previous).set(tag.id, true));
      dirtyForm.current = false;
      setCreating(false);
      window.dispatchEvent(new Event(catalogEvent));
      requestAnimationFrame(() =>
        pickerRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus(),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={creating ? t.batchNewManualTag : t.tags}
      hint={creating ? t.tagCreateForSelection : t.tagSelectionHint(data?.files ?? paths.length)}
      closeLabel={t.close}
      onClose={() => void leave()}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {creating ? (
            <>
              <Btn
                type="button"
                className="mr-auto"
                disabled={busy}
                onClick={async () => {
                  if (
                    dirtyForm.current &&
                    !(await ask({
                      title: t.unsavedChanges,
                      message: t.discardChanges,
                      danger: true,
                    }))
                  )
                    return;
                  dirtyForm.current = false;
                  setCreating(false);
                  setError("");
                }}
              >
                <BackIcon size={14} />
                {t.back}
              </Btn>
              <Btn type="submit" form={formId} variant="primary" disabled={busy}>
                {busy && <Spinner />}
                {t.tagCreate}
              </Btn>
            </>
          ) : (
            <>
              <span role="status" className="mr-auto text-xs text-dim max-[460px]:w-full">
                {changes.size ? t.tagChangesCount(changes.size) : t.tagNoChanges}
              </span>
              <Btn type="button" disabled={busy} onClick={() => void leave()}>
                {t.cancel}
              </Btn>
              <Btn
                type="button"
                variant="primary"
                disabled={busy || !data || !changes.size}
                onClick={() => void apply()}
              >
                {busy && <Spinner />}
                {t.tagApplyChanges}
              </Btn>
            </>
          )}
        </div>
      }
    >
      {error && (
        <div className="mb-4" role="alert">
          <AuthError>{error}</AuthError>
          {(!data || !creating) && (
            <Btn type="button" size="sm" onClick={() => void refresh()}>
              {t.tagRetry}
            </Btn>
          )}
        </div>
      )}
      {creating ? (
        <TagForm formId={formId} manualOnly busy={busy} onDirty={markDirty} onSave={create} />
      ) : !data ? (
        !error && <Loading />
      ) : (
        <div ref={pickerRef} className="space-y-4">
          <TagPicker
            tags={data.tags}
            files={data.files}
            changes={changes}
            disabled={busy}
            onAdd={(id) => update(id, true)}
            onToggle={(id) => {
              const tag = data.tags.find((tag) => tag.id === id)!;
              update(id, !(changes.get(id) ?? tag.count === data.files));
            }}
            onRemove={(id) => update(id, false)}
            onReset={(id) =>
              setChanges((previous) => {
                const next = new Map(previous);
                next.delete(id);
                return next;
              })
            }
            onCreate={() => {
              setError("");
              setCreating(true);
            }}
          />
          <p className="text-xs leading-relaxed text-dim">{t.tagMixedHint}</p>
        </div>
      )}
    </Modal>
  );
}
