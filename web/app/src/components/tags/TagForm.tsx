import { useLayoutEffect, useId, useState } from "react";
import type { Tag, TagRule } from "../../api";
import { useI18n } from "../../i18n";
import { PlusIcon, TrashIcon } from "../../icons";
import { Btn, Checkbox, Combobox, IconBtn, Input, Segmented, Textarea } from "../../ui";

export default function TagForm({
  tag,
  formId,
  path,
  busy,
  onDirty,
  onSave,
}: {
  tag?: Tag;
  formId: string;
  path?: string;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (definition: Omit<Tag, "id">, assign: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(tag?.name ?? "");
  const [type, setType] = useState<"manual" | "smart">(tag?.rules.length ? "smart" : "manual");
  const [mode, setMode] = useState<Tag["mode"]>(tag?.mode ?? "all");
  const [rules, setRules] = useState<TagRule[]>(tag?.rules ?? []);
  const [assign, setAssign] = useState(!!path);
  const nameId = useId();
  const ruleId = useId();
  useLayoutEffect(() => {
    const originalRules = tag?.rules ?? [];
    onDirty(
      name !== (tag?.name ?? "") ||
        JSON.stringify(type === "smart" ? rules : []) !== JSON.stringify(originalRules) ||
        (type === "smart" && mode !== (tag?.mode ?? "all")) ||
        assign !== !!path,
    );
  }, [name, type, rules, mode, assign, tag, path, onDirty]);

  function updateRule(index: number, patch: Partial<TagRule>) {
    setRules(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }
  const addRule = () =>
    setRules((previous) => [
      ...previous,
      { field: "content", op: "contains", value: "", ignoreCase: false },
    ]);
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ name: name.trim(), mode, rules: type === "smart" ? rules : [] }, assign);
      }}
      className="space-y-5"
    >
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <div>
          <label htmlFor={nameId} className="mb-1.5 block text-[13px] font-medium text-dim">
            {t.tagName}
          </label>
          <Input
            id={nameId}
            required
            maxLength={48}
            value={name}
            placeholder={t.tagNameExample}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
        {type === "smart" && (
          <div className="space-y-3 border-t border-line-soft pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">{t.tagRules}</span>
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
                className="w-[165px]"
                disabled={busy}
              />
            </div>
            {rules.map((rule, index) => (
              <fieldset
                key={index}
                aria-label={`${t.tagRule} ${index + 1}`}
                className="min-w-0 rounded-xl border border-line bg-inset/40 p-3.5"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold tracking-wide text-dim uppercase">
                    {t.tagRule} {index + 1}
                  </span>
                  <IconBtn
                    type="button"
                    size="xs"
                    disabled={rules.length === 1 || busy}
                    title={t.tagRemoveRule}
                    aria-label={`${t.tagRemoveRule} ${index + 1}`}
                    onClick={() => {
                      setRules(rules.filter((_, i) => i !== index));
                    }}
                  >
                    <TrashIcon size={14} />
                  </IconBtn>
                </div>
                <div className="mb-3 grid gap-2.5 min-[460px]:grid-cols-2">
                  <div>
                    <span className="mb-1.5 block text-[11.5px] font-medium text-dim">
                      {t.tagField}
                    </span>
                    <Combobox
                      ariaLabel={`${t.tagField} ${index + 1}`}
                      value={rule.field}
                      onChange={(value) => {
                        updateRule(index, { field: value as TagRule["field"] });
                      }}
                      options={[
                        { value: "content", label: t.tagContent },
                        { value: "path", label: t.tagPath },
                      ]}
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <span className="mb-1.5 block text-[11.5px] font-medium text-dim">
                      {t.tagOperator}
                    </span>
                    <Combobox
                      ariaLabel={`${t.tagOperator} ${index + 1}`}
                      value={rule.op}
                      onChange={(value) => {
                        updateRule(index, { op: value as TagRule["op"] });
                      }}
                      options={[
                        { value: "contains", label: t.tagContains },
                        { value: "regex", label: t.tagRegex },
                      ]}
                      disabled={busy}
                    />
                  </div>
                </div>
                <label
                  htmlFor={`${ruleId}-${index}`}
                  className="mb-1.5 block text-[11.5px] font-medium text-dim"
                >
                  {t.tagValue}
                </label>
                <Textarea
                  id={`${ruleId}-${index}`}
                  rows={3}
                  required
                  maxLength={4096}
                  value={rule.value}
                  placeholder={
                    rule.field === "path" ? "sites-available/" : "include snippets/auth-gate.conf;"
                  }
                  onChange={(e) => updateRule(index, { value: e.target.value })}
                  className="max-h-48 resize-y font-mono text-[12px]"
                />
                <label className="mt-2 flex min-h-8 cursor-pointer items-center gap-2.5 text-[12px] text-dim">
                  <Checkbox
                    checked={rule.ignoreCase}
                    disabled={busy}
                    onChange={() => {
                      updateRule(index, { ignoreCase: !rule.ignoreCase });
                    }}
                    ariaLabel={`${t.tagIgnoreCase} ${index + 1}`}
                  />
                  {t.tagIgnoreCase}
                </label>
              </fieldset>
            ))}
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
            <p className="text-[11.5px] leading-relaxed text-dim">{t.tagSharedHint}</p>
          </div>
        )}
        {path && !tag && (
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
