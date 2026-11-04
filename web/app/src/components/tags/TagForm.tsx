import { useLayoutEffect, useId, useRef, useState } from "react";
import type { Tag, TagRule } from "../../api";
import { useI18n } from "../../i18n";
import { PlusIcon } from "../../icons";
import { Btn, Checkbox, Combobox, Input, Segmented } from "../../ui";

import TagRuleEditor from "./TagRuleEditor";

export default function TagForm({
  tag,
  formId,
  path,
  busy,
  manualOnly = false,
  onDirty,
  onSave,
}: {
  tag?: Tag;
  formId: string;
  path?: string;
  busy: boolean;
  manualOnly?: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (definition: Omit<Tag, "id">, assign: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(tag?.name ?? "");
  const [type, setType] = useState<"manual" | "smart">(tag?.rules.length ? "smart" : "manual");
  const [mode, setMode] = useState<Tag["mode"]>(tag?.mode ?? "all");
  const [drafts, setDrafts] = useState(() => (tag?.rules ?? []).map((rule, id) => ({ rule, id })));
  const nextRuleId = useRef(drafts.length);
  const [focusRule, setFocusRule] = useState<number | null>(null);
  const rules = drafts.map((draft) => draft.rule);
  const [assign, setAssign] = useState(!!path);
  const nameId = useId();
  useLayoutEffect(() => {
    const originalRules = tag?.rules ?? [];
    onDirty(
      name !== (tag?.name ?? "") ||
        JSON.stringify(type === "smart" ? rules : []) !== JSON.stringify(originalRules) ||
        (type === "smart" && mode !== (tag?.mode ?? "all")) ||
        (type === "manual" && assign !== !!path),
    );
  }, [name, type, rules, mode, assign, tag, path, onDirty]);

  function updateRule(index: number, patch: Partial<TagRule>) {
    setDrafts((previous) =>
      previous.map((draft, i) =>
        i === index ? { ...draft, rule: { ...draft.rule, ...patch } } : draft,
      ),
    );
  }
  const addRule = () => {
    const id = nextRuleId.current++;
    setFocusRule(id);
    setDrafts((previous) => [
      ...previous,
      { id, rule: { field: "content", op: "contains", value: "", ignoreCase: false } },
    ]);
  };
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(
          { name: name.trim(), mode, rules: type === "smart" ? rules : [] },
          type === "manual" && assign,
        );
      }}
      className="space-y-4"
    >
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <div>
          <label htmlFor={nameId} className="mb-1.5 block text-[13px] font-medium text-dim">
            {t.tagName}
          </label>
          <Input
            id={nameId}
            autoFocus={manualOnly}
            required
            maxLength={48}
            value={name}
            placeholder={t.tagNameExample}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {!manualOnly && (
          <div className="space-y-2.5">
            <span className="block text-[13px] font-medium text-dim">{t.tagType}</span>
            <Segmented
              value={type}
              onChange={(value) => {
                setType(value);
                if (value === "smart" && !rules.length) addRule();
              }}
              options={[
                { value: "manual", label: t.tagManual },
                { value: "smart", label: t.tagSmart },
              ]}
              ariaLabel={t.tagType}
            />
            <p className="text-xs leading-relaxed text-dim">
              {type === "smart" ? t.tagSmartHint : t.tagManualHint}
            </p>
          </div>
        )}
        {type === "smart" && (
          <div className="space-y-3 border-t border-line-soft pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">{t.tagApplyWhen}</span>
              <Combobox
                ariaLabel={t.tagMatch}
                value={mode}
                onChange={(value) => {
                  setMode(value as Tag["mode"]);
                }}
                options={[
                  { value: "all", label: t.tagAllRules },
                  { value: "any", label: t.tagAnyRule },
                ]}
                className="w-[190px] max-w-full"
                disabled={busy}
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              {drafts.map((draft, index) => (
                <div key={draft.id}>
                  {index > 0 && (
                    <div className="flex items-center gap-2 px-3.5 text-[10.5px] font-semibold text-dim">
                      <span className="h-px flex-1 bg-line-soft" />
                      {mode === "all" ? t.tagAnd : t.tagOr}
                      <span className="h-px flex-1 bg-line-soft" />
                    </div>
                  )}
                  <TagRuleEditor
                    rule={draft.rule}
                    number={index + 1}
                    busy={busy}
                    removable={drafts.length > 1}
                    focus={focusRule === draft.id}
                    onChange={(patch) => updateRule(index, patch)}
                    onRemove={() =>
                      setDrafts((previous) => previous.filter((item) => item.id !== draft.id))
                    }
                  />
                </div>
              ))}
            </div>
            <Btn
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy || rules.length >= 16}
              onClick={() => {
                addRule();
              }}
            >
              <PlusIcon size={14} />
              {t.tagAddRule}
            </Btn>
            <p className="text-[11.5px] leading-relaxed text-dim">
              {tag && !tag.rules.length ? t.tagConvertsToSmart : t.tagSharedHint}
            </p>
          </div>
        )}
        {path && !tag && type === "manual" && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-soft bg-inset px-3 py-3 text-[13px]">
            <Checkbox
              checked={assign}
              disabled={busy}
              onChange={() => setAssign(!assign)}
              ariaLabel={t.tagAssignCurrent}
            />
            {t.tagAssignCurrent}
          </label>
        )}
      </fieldset>
    </form>
  );
}
