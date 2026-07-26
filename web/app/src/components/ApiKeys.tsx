import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type APIKey } from "../api";
import { useConfirm } from "../confirm";
import { CheckIcon, CopyIcon, KeyIcon, PlusIcon, TrashIcon, XIcon } from "../icons";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import {
  Badge,
  Btn,
  Checkbox,
  IconBtn,
  Loading,
  Modal,
  ModalActions,
  MonoTag,
  Spinner,
} from "../ui";
import { Field } from "./auth/fields";

function scopeLabel(scope: string, t: ReturnType<typeof useI18n>["t"]): string {
  switch (scope) {
    case "nginx:status":
      return t.scopeNginxStatus;
    case "nginx:test":
      return t.scopeNginxTest;
    case "nginx:reload":
      return t.scopeNginxReload;
    case "nginx:restart":
      return t.scopeNginxRestart;
    default:
      return scope;
  }
}

export default function ApiKeys({ onAuthLost }: { onAuthLost: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const ask = useConfirm();
  const [keys, setKeys] = useState<APIKey[] | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api
      .apiKeys()
      .then((r) => {
        setKeys(r.keys ?? []);
        setScopes(r.scopes ?? []);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onAuthLost();
        else toast(t.loadError, "error");
      });
  }, [onAuthLost, toast, t]);

  useEffect(load, [load]);

  function toggleScope(s: string) {
    const next = new Set(picked);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setPicked(next);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (picked.size === 0) return;
    setBusy(true);
    try {
      const r = await api.createApiKey(name.trim(), [...picked]);
      setCreated(r.token);
      setCopied(false);
      setName("");
      setPicked(new Set());
      setAdding(false);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  async function remove(k: APIKey) {
    if (!(await ask({ title: t.apiKeyDelete, message: t.confirmDeleteApiKey(k.name), danger: true }))) return;
    try {
      await api.deleteApiKey(k.id);
      toast(t.apiKeyDeleted);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
    }
  }

  if (keys === null) return <Loading />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-dim">
          {keys.length > 0 ? t.itemsCount(keys.length) : ""}
        </span>
        {!adding && (
          <Btn variant="primary" onClick={() => setAdding(true)}>
            <PlusIcon size={16} /> {t.newApiKey}
          </Btn>
        )}
      </div>

      {created && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-accent/40 bg-accent-soft p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-panel text-accent-ink">
              <KeyIcon size={15} />
            </span>
            <span className="min-w-0 flex-1 text-sm font-semibold">{t.apiKeyCreatedTitle}</span>
            <IconBtn size="sm" onClick={() => setCreated(null)} aria-label={t.close} title={t.close}>
              <XIcon size={16} />
            </IconBtn>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-panel px-3 py-2.5 font-mono text-[13px] select-all">
              {created}
            </code>
            <Btn onClick={copy} className="shrink-0">
              {copied ? (
                <>
                  <CheckIcon size={15} /> {t.copied}
                </>
              ) : (
                <>
                  <CopyIcon size={15} /> {t.copy}
                </>
              )}
            </Btn>
          </div>
          <div className="text-[12.5px] leading-relaxed text-dim">{t.apiKeyCreatedHint}</div>
        </div>
      )}

      {adding && (
        <Modal title={t.newApiKey} onClose={() => setAdding(false)}>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Field
              label={t.apiKeyName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.apiKeyNamePlaceholder}
              autoCapitalize="none"
              autoFocus
              required
            />
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-dim">{t.apiKeyScopes}</span>
              {scopes.map((s) => (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-inset px-3 py-2.5 text-sm"
                >
                  <Checkbox
                    checked={picked.has(s)}
                    onChange={() => toggleScope(s)}
                    ariaLabel={scopeLabel(s, t)}
                  />
                  <span className="min-w-0 flex-1">{scopeLabel(s, t)}</span>
                  <MonoTag>{s}</MonoTag>
                </label>
              ))}
            </div>
            <ModalActions>
              <Btn type="button" onClick={() => setAdding(false)}>
                {t.cancel}
              </Btn>
              <Btn type="submit" variant="primary" disabled={busy || picked.size === 0}>
                {busy ? <Spinner light /> : t.createApiKey}
              </Btn>
            </ModalActions>
          </form>
        </Modal>
      )}

      {keys.length === 0 && !adding ? (
        <p className="m-0 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-dim">
          {t.noApiKeys}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-start gap-x-3 gap-y-2.5 rounded-xl border border-line bg-inset px-3 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ctrl text-dim">
                <KeyIcon size={17} />
              </span>
              <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{k.name}</span>
                  <MonoTag>{k.prefix}…</MonoTag>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {k.scopes.map((s) => (
                    <Badge key={s} tone="accent">
                      {scopeLabel(s, t)}
                    </Badge>
                  ))}
                </div>
                <div className="text-[12px] text-faint">
                  {k.lastUsedAt
                    ? `${t.apiKeyLastUsed}: ${new Date(k.lastUsedAt).toLocaleString()}`
                    : t.apiKeyNeverUsed}
                </div>
              </div>
              <Btn size="sm" variant="danger" className="shrink-0" onClick={() => remove(k)}>
                <TrashIcon size={14} /> {t.apiKeyDelete}
              </Btn>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
