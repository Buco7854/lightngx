import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type APIKey } from "../api";
import { useConfirm } from "../confirm";
import { CheckIcon, TrashIcon } from "../icons";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { Btn, EmptyState, Modal, Spinner } from "../ui";
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

  if (keys === null) {
    return (
      <EmptyState>
        <Spinner />
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span />
        {!adding && (
          <Btn variant="primary" onClick={() => setAdding(true)}>
            {t.newApiKey}
          </Btn>
        )}
      </div>

      {created && (
        <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/10 p-4">
          <div className="text-sm font-semibold">{t.apiKeyCreatedTitle}</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-ctrl px-3 py-2 font-mono text-[13px] select-all">
              {created}
            </code>
            <Btn onClick={copy} className="shrink-0">
              {copied ? (
                <>
                  <CheckIcon size={14} /> {t.copied}
                </>
              ) : (
                t.copy
              )}
            </Btn>
            <Btn variant="ghost" onClick={() => setCreated(null)} className="shrink-0">
              {t.close}
            </Btn>
          </div>
          <div className="text-xs text-dim">{t.apiKeyCreatedHint}</div>
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
              <span className="text-[13px] text-dim">{t.apiKeyScopes}</span>
              {scopes.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.has(s)}
                    onChange={() => toggleScope(s)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  {scopeLabel(s, t)}
                  <span className="font-mono text-xs text-dim">{s}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Btn type="button" variant="ghost" onClick={() => setAdding(false)}>
                {t.cancel}
              </Btn>
              <Btn type="submit" variant="primary" disabled={busy || picked.size === 0}>
                {busy ? <Spinner /> : t.createApiKey}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {keys.length === 0 && !adding ? (
        <div className="text-xs text-dim">{t.noApiKeys}</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-inset px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{k.name}</span>
                  <span className="font-mono text-xs text-dim">{k.prefix}…</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {k.scopes.map((s) => (
                    <span key={s} className="rounded bg-ctrl px-1.5 py-0.5 font-mono text-[11px] text-dim">
                      {s}
                    </span>
                  ))}
                </div>
                <div className="mt-1 text-xs text-dim">
                  {k.lastUsedAt
                    ? `${t.apiKeyLastUsed}: ${new Date(k.lastUsedAt).toLocaleString()}`
                    : t.apiKeyNeverUsed}
                </div>
              </div>
              <Btn
                variant="danger"
                className="min-h-[32px] px-2.5 text-[13px]"
                onClick={() => remove(k)}
              >
                <TrashIcon size={14} /> {t.apiKeyDelete}
              </Btn>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
