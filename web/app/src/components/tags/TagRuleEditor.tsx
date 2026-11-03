import { useLayoutEffect, useRef, useState } from "react";
import type { TagRule } from "../../api";
import { useI18n } from "../../i18n";
import { TrashIcon } from "../../icons";
import { Btn, Checkbox, Combobox, IconBtn, Input, Textarea } from "../../ui";

export default function TagRuleEditor({
  rule,
  number,
  busy,
  removable,
  focus,
  onChange,
  onRemove,
}: {
  rule: TagRule;
  number: number;
  busy: boolean;
  removable: boolean;
  focus: boolean;
  onChange: (patch: Partial<TagRule>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLFieldSetElement>(null);
  const [expanded, setExpanded] = useState(rule.value.includes("\n"));
  const multiline = expanded || rule.value.includes("\n");
  const previousMultiline = useRef(multiline);
  useLayoutEffect(() => {
    if (focus || previousMultiline.current !== multiline)
      root.current?.querySelector<HTMLInputElement>("input, textarea")?.focus();
    previousMultiline.current = multiline;
    // Focus newly added conditions and explicit changes of input mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiline]);
  const label = `${rule.op === "regex" ? t.tagPattern : t.tagSnippet} ${number}`;
  const placeholder =
    rule.op === "regex"
      ? "proxy_pass\\s+https?://"
      : rule.field === "path"
        ? "sites-available/"
        : "include snippets/auth-gate.conf;";
  return (
    <fieldset
      ref={root}
      disabled={busy}
      aria-label={`${t.tagRule} ${number}`}
      className="min-w-0 space-y-2.5 px-3.5 py-3.5"
    >
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2 min-[460px]:grid-cols-2">
          <Combobox
            ariaLabel={`${t.tagField} ${number}`}
            value={rule.field}
            disabled={busy}
            onChange={(value) => onChange({ field: value as TagRule["field"] })}
            options={[
              { value: "content", label: t.tagContent },
              { value: "path", label: t.tagPath },
            ]}
          />
          <Combobox
            ariaLabel={`${t.tagOperator} ${number}`}
            value={rule.op}
            disabled={busy}
            onChange={(value) => onChange({ op: value as TagRule["op"] })}
            options={[
              { value: "contains", label: t.tagContains },
              { value: "regex", label: t.tagRegex },
            ]}
          />
        </div>
        <IconBtn
          type="button"
          size="sm"
          disabled={!removable || busy}
          title={t.tagRemoveRule}
          aria-label={`${t.tagRemoveRule} ${number}`}
          onClick={onRemove}
          className="mt-1"
        >
          <TrashIcon size={14} />
        </IconBtn>
      </div>
      {multiline ? (
        <Textarea
          aria-label={label}
          required
          rows={3}
          maxLength={4096}
          value={rule.value}
          placeholder={placeholder}
          onChange={(e) => onChange({ value: e.target.value })}
          className="max-h-48 resize-y font-mono text-[12px]"
        />
      ) : (
        <Input
          aria-label={label}
          required
          maxLength={4096}
          value={rule.value}
          placeholder={placeholder}
          onChange={(e) => onChange({ value: e.target.value })}
          onPaste={(e) => {
            const value = e.clipboardData.getData("text");
            if (!value.includes("\n")) return;
            e.preventDefault();
            const input = e.currentTarget;
            setExpanded(true);
            onChange({
              value: (
                rule.value.slice(0, input.selectionStart ?? 0) +
                value +
                rule.value.slice(input.selectionEnd ?? rule.value.length)
              ).slice(0, 4096),
            });
          }}
          className="font-mono text-[12px]"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label className="flex min-h-8 cursor-pointer items-center gap-2 text-[12px] text-dim">
          <Checkbox
            checked={rule.ignoreCase}
            disabled={busy}
            onChange={() => onChange({ ignoreCase: !rule.ignoreCase })}
            ariaLabel={`${t.tagIgnoreCase} ${number}`}
          />
          {t.tagIgnoreCase}
        </label>
        <Btn
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy || rule.value.includes("\n")}
          onClick={() => setExpanded(!expanded)}
        >
          {multiline ? t.tagSingleLine : t.tagMultiline}
        </Btn>
      </div>
    </fieldset>
  );
}
