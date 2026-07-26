import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, type Site, type SiteAction, type VhostKind } from "../api";
import { type ConfirmOptions, useConfirm, usePrompt } from "../confirm";
import {
  BackIcon,
  ChevronRightIcon,
  CopyIcon,
  GlobeIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  StreamIcon,
  TrashIcon,
  WrenchIcon,
} from "../icons";
import { useI18n } from "../i18n";
import { hrefWithQuery, Link, setQuery, useLocation } from "../router";
import { useToast } from "../toast";
import { useFileEditor } from "../useFileEditor";
import { useReloadToast } from "../useReloadToast";
import {
  Badge,
  Btn,
  Card,
  Checkbox,
  Dropdown,
  EmptyState,
  IconBtn,
  Loading,
  MenuItem,
  MonoTag,
  Pagination,
  Segmented,
  SearchInput,
  Spinner,
  Switch,
  Toolbar,
} from "../ui";
import SaveButton from "./SaveButton";
import CodeEditor from "./CodeEditor";
import { EditorRail, EditorStatus, RailSection, RailToggle } from "./EditorShell";
import { useOutput } from "./OutputPanel";
import { useDarkTheme } from "./useDarkTheme";

const siteTemplate = `server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;

const streamTemplate = `server {
    listen 10000;
    proxy_pass 127.0.0.1:10001;
}
`;

type State = "enabled" | "maintenance" | "disabled";
type Tab = "all" | State;

const TABS: Tab[] = ["all", "enabled", "maintenance", "disabled"];

const PAGE_SIZE = 50;

function stateOf(s: Site): State {
  return s.maintenance ? "maintenance" : s.enabled ? "enabled" : "disabled";
}

const tones: Record<State, "ok" | "warn" | "neutral"> = {
  enabled: "ok",
  maintenance: "warn",
  disabled: "neutral",
};

const tiles: Record<State, string> = {
  enabled: "bg-ok-soft text-ok-ink",
  maintenance: "bg-warn-soft text-warn-ink",
  disabled: "bg-ctrl text-faint",
};

const COL_LABEL = "text-[10.5px] font-semibold tracking-wide text-faint uppercase";

function DomainList({ domains }: { domains: string[] | null }) {
  if (!domains || domains.length === 0) return null;
  const shown = domains.slice(0, 3);
  const rest = domains.length - shown.length;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((d) => (
        <MonoTag key={d}>{d}</MonoTag>
      ))}
      {rest > 0 && <span className="text-[11.5px] text-faint">+{rest}</span>}
    </span>
  );
}

export default function VhostsView({
  kind,
  onAuthLost,
  defaultReload,
}: {
  kind: VhostKind;
  onAuthLost: () => void;
  defaultReload: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const output = useOutput();
  const ask = useConfirm();
  const askName = usePrompt();
  const loc = useLocation();
  const editing = loc.searchParams.get("edit");
  const filter = loc.searchParams.get("q") ?? "";
  // The state filter lives in the URL like the search does, so a filtered
  // list can be linked to, reloaded and opened in a new tab.
  const stateParam = loc.searchParams.get("state");
  const tab: Tab = TABS.includes(stateParam as Tab) ? (stateParam as Tab) : "all";
  const setEditing = (name: string | null) => setQuery({ edit: name });
  const setFilter = (q: string) => setQuery({ q }, { replace: true });
  const setTab = (v: Tab) => setQuery({ state: v === "all" ? null : v });
  const [sites, setSites] = useState<Site[] | null>(null);
  const [maintenanceOK, setMaintenanceOK] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");

  const refresh = useCallback(() => {
    api
      .vhosts(kind)
      .then((r) => {
        setSites(r.sites ?? []);
        setMaintenanceOK(r.maintenance);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onAuthLost();
        else toast(t.loadError, "error");
      });
  }, [kind, onAuthLost, toast, t]);

  useEffect(refresh, [refresh]);

  // runAction applies an action to one or more vhosts. Every action
  // confirms first (opts.confirm:false skips it). busyKey scopes the
  // spinner to the acting rows.
  const runAction = useCallback(
    async (names: string[], action: SiteAction, opts?: { confirm?: boolean }): Promise<boolean> => {
      const confirmIt = opts?.confirm ?? true;
      if (confirmIt) {
        const n = names.length;
        const c: Record<SiteAction, ConfirmOptions | null> = {
          enable: { title: t.enableSite, message: t.confirmEnableVhosts(n) },
          disable: { title: t.disableSite, message: t.confirmDisableVhosts(n), danger: true },
          maintenance_on: { title: t.maintenanceOn, message: t.confirmMaintenanceVhosts(n) },
          maintenance_off: { title: t.maintenanceOff, message: t.confirmMaintenanceOffVhosts(n) },
          delete: { title: t.deleteAction, message: t.confirmDeleteVhosts(n), danger: true },
        };
        if (c[action] && !(await ask(c[action]!))) return false;
      }
      setBusy(names.join("\n"));
      try {
        await api.vhostAction(kind, names, action);
        toast(t.siteActionApplied);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onAuthLost();
          return false;
        }
        toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
        if (err instanceof ApiError && err.output) output(t.output, err.output);
        return false;
      } finally {
        setBusy("");
        if (names.length > 1) setSelected(new Set());
        refresh();
      }
    },
    [kind, ask, t, toast, output, onAuthLost, refresh],
  );

  const counts = useMemo(() => {
    const c = { all: sites?.length ?? 0, enabled: 0, maintenance: 0, disabled: 0 };
    for (const s of sites ?? []) c[stateOf(s)]++;
    return c;
  }, [sites]);

  const filtered = useMemo(() => {
    if (!sites) return [];
    const q = filter.trim().toLowerCase();
    return sites.filter((s) => {
      if (tab !== "all" && stateOf(s) !== tab) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.domains ?? []).some((d) => d.toLowerCase().includes(q))
      );
    });
  }, [sites, filter, tab]);

  // Selection and the header count stay on the whole filtered set; only the
  // rendered rows are paged.
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  useEffect(() => setPage(1), [filter, tab, kind]);

  async function create() {
    const name = await askName({
      title: kind === "sites" ? t.newSite : t.newStream,
      label: t.namePrompt,
      placeholder: kind === "sites" ? "example.com" : "my-stream",
      confirmLabel: t.create,
    });
    if (!name) return;
    try {
      await api.writeFile(`${kind}-available/${name.trim()}`, kind === "sites" ? siteTemplate : streamTemplate);
      refresh();
      setEditing(name.trim());
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.output) {
        toast(t.saveFailed, "error");
        output(t.output, err.output);
      } else {
        toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
      }
    }
  }

  async function cloneSite(name: string) {
    const newName = await askName({
      title: t.clone,
      label: t.clonePrompt,
      initial: `${name}-copy`,
      confirmLabel: t.clone,
    });
    if (!newName) return;
    try {
      await api.vhostClone(kind, name, newName.trim());
      toast(t.cloned);
      refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
      if (err instanceof ApiError && err.output) output(t.output, err.output);
    }
  }

  if (editing !== null) {
    const site = sites?.find((s) => s.name === editing) ?? null;
    return (
      <VhostEditor
        kind={kind}
        name={editing}
        site={site}
        maintenanceOK={maintenanceOK}
        onAuthLost={onAuthLost}
        onBack={() => {
          setEditing(null);
          refresh();
        }}
        onRenamed={(n) => {
          setEditing(n);
          refresh();
        }}
        runAction={runAction}
        refresh={refresh}
        defaultReload={defaultReload}
      />
    );
  }

  if (sites === null) return <Loading />;

  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.name));
  const someSelected = filtered.some((s) => selected.has(s.name));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((s) => next.delete(s.name));
    else filtered.forEach((s) => next.add(s.name));
    setSelected(next);
  };
  const toggleOne = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };
  const sel = [...selected];
  const selSites = sites.filter((s) => selected.has(s.name));
  const anyEnabled = selSites.some((s) => s.enabled && !s.maintenance);
  const anyMaint = selSites.some((s) => s.maintenance);
  const anyBusy = busy !== "";
  const KindIcon = kind === "sites" ? GlobeIcon : StreamIcon;
  const newLabel = kind === "sites" ? t.newSite : t.newStream;

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "all", label: t.filterAll, count: counts.all },
    { value: "enabled", label: t.filterEnabled, count: counts.enabled },
    ...(maintenanceOK
      ? [{ value: "maintenance" as Tab, label: t.filterMaintenance, count: counts.maintenance }]
      : []),
    { value: "disabled", label: t.filterDisabled, count: counts.disabled },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Toolbar>
        <Segmented
          value={tab}
          onChange={setTab}
          options={tabs}
          ariaLabel={t.filterAll}
          className="max-w-full overflow-x-auto"
        />
        <div className="flex min-w-[200px] flex-1 items-center justify-end gap-2.5">
          <SearchInput
            value={filter}
            onChange={setFilter}
            placeholder={t.filterVhosts}
            className="min-w-0 flex-1 max-w-[300px]"
          />
          <Btn variant="primary" className="shrink-0" onClick={create}>
            <PlusIcon size={17} />
            <span className="max-[520px]:hidden">{newLabel}</span>
          </Btn>
        </div>
      </Toolbar>

      {selected.size > 0 && (
        <div className="anim-slide-up flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-3 py-2.5 min-[761px]:px-5">
          <span className="text-[13px] font-semibold text-accent-ink">
            {t.selectedCount(selected.size)}
          </span>
          <Btn size="sm" onClick={() => setSelected(new Set())}>
            {t.clearSelection}
          </Btn>
          <span className="flex-1" />
          <Btn size="sm" disabled={anyBusy} onClick={() => void runAction(sel, "enable")}>
            {t.enableSite}
          </Btn>
          <Btn size="sm" disabled={anyBusy} onClick={() => void runAction(sel, "disable")}>
            {t.disableSite}
          </Btn>
          {maintenanceOK && anyEnabled && (
            <Btn size="sm" disabled={anyBusy} onClick={() => void runAction(sel, "maintenance_on")}>
              <WrenchIcon size={14} /> {t.maintenanceOn}
            </Btn>
          )}
          {maintenanceOK && anyMaint && (
            <Btn size="sm" disabled={anyBusy} onClick={() => void runAction(sel, "maintenance_off")}>
              {t.maintenanceOff}
            </Btn>
          )}
          <Btn size="sm" variant="danger" disabled={anyBusy} onClick={() => void runAction(sel, "delete")}>
            <TrashIcon size={14} /> {t.deleteAction}
          </Btn>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3 min-[761px]:p-5">
        {sites.length === 0 ? (
          <EmptyState
            icon={<KindIcon size={26} />}
            title={kind === "sites" ? t.noSites : t.noStreams}
            hint={kind === "sites" ? t.noSitesHint : t.noStreamsHint}
            action={
              <Btn variant="primary" size="lg" onClick={create}>
                <PlusIcon size={17} /> {newLabel}
              </Btn>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<KindIcon size={26} />} title={t.noMatches} hint={t.noMatchesHint} />
        ) : (
          <Card className="mx-auto w-full max-w-5xl shrink-0 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line-soft bg-inset/60 px-3 py-2.5 min-[761px]:px-4">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleAll}
                ariaLabel={t.selectAll}
              />
              <span className="text-[12px] font-medium tracking-wide text-faint uppercase">
                {t.itemsCount(filtered.length)}
              </span>
              <span className="ml-auto flex items-center gap-4 max-[760px]:hidden">
                {maintenanceOK && (
                  <span className={`${COL_LABEL} w-[104px] text-center`}>{t.colMaintenance}</span>
                )}
                <span className={`${COL_LABEL} w-[88px] text-center`}>{t.colEnabled}</span>
                <span className="w-9" aria-hidden />
                <span className="w-4" aria-hidden />
              </span>
            </div>

            <div className="divide-y divide-line-soft">
              {shown.map((s) => {
                const st = stateOf(s);
                const rowBusy = busy.split("\n").includes(s.name);
                return (
                  <div
                    key={s.name}
                    className="group relative flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-3 px-3 py-3 transition-colors hover:bg-hov min-[761px]:px-4"
                  >
                    {/* The row itself is the link, stretched across the whole
                        cell so it can be opened in a new tab; the controls
                        below sit above it on z-10 and stay clickable. */}
                    <Link
                      href={hrefWithQuery({ edit: s.name })}
                      aria-label={s.name}
                      className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    />

                    <span className="relative z-10 flex items-center">
                      <Checkbox
                        checked={selected.has(s.name)}
                        onChange={() => toggleOne(s.name)}
                        ariaLabel={s.name}
                      />
                    </span>

                    <span
                      aria-hidden
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tiles[st]}`}
                    >
                      {st === "maintenance" ? <WrenchIcon size={17} /> : <KindIcon size={17} />}
                    </span>

                    <div className="flex min-w-[150px] flex-1 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-[14.5px] font-semibold">{s.name}</span>
                        <Badge tone={tones[st]}>
                          {st === "enabled"
                            ? t.stateEnabled
                            : st === "maintenance"
                              ? t.stateMaintenance
                              : t.stateDisabled}
                        </Badge>
                      </div>
                      <DomainList domains={s.domains} />
                    </div>

                    <div className="relative z-10 flex shrink-0 items-center gap-3 min-[761px]:gap-4">
                      {maintenanceOK && (
                        <div className="flex items-center gap-2 min-[761px]:w-[104px] min-[761px]:justify-center">
                          <span className={`${COL_LABEL} min-[761px]:hidden`}>
                            {t.colMaintenance}
                          </span>
                          {s.enabled ? (
                            <Switch
                              checked={s.maintenance}
                              warn
                              disabled={rowBusy}
                              label={`${t.maintenanceOn} ${s.name}`}
                              onToggle={() =>
                                void runAction(
                                  [s.name],
                                  s.maintenance ? "maintenance_off" : "maintenance_on",
                                )
                              }
                            />
                          ) : (
                            <span className="text-sm text-faint">—</span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 min-[761px]:w-[88px] min-[761px]:justify-center">
                        <span className={`${COL_LABEL} min-[761px]:hidden`}>{t.colEnabled}</span>
                        {rowBusy ? (
                          <Spinner />
                        ) : (
                          <Switch
                            checked={s.enabled}
                            warn={s.maintenance}
                            label={s.enabled ? `${t.disableSite} ${s.name}` : `${t.enableSite} ${s.name}`}
                            onToggle={() => void runAction([s.name], s.enabled ? "disable" : "enable")}
                          />
                        )}
                      </div>

                      <Dropdown
                        ariaLabel={`${t.moreActions} ${s.name}`}
                        variant="ghost"
                        chevron={false}
                        button={<MoreIcon size={18} />}
                      >
                        {(close) => (
                          <>
                            <MenuItem
                              onClick={() => {
                                close();
                                void cloneSite(s.name);
                              }}
                            >
                              <CopyIcon size={16} /> {t.clone}
                            </MenuItem>
                            <MenuItem
                              danger
                              onClick={() => {
                                close();
                                void runAction([s.name], "delete").then((ok) => {
                                  if (ok)
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      next.delete(s.name);
                                      return next;
                                    });
                                });
                              }}
                            >
                              <TrashIcon size={16} /> {t.deleteAction}
                            </MenuItem>
                          </>
                        )}
                      </Dropdown>

                      <ChevronRightIcon
                        size={16}
                        className="w-4 text-faint opacity-0 transition-opacity group-hover:opacity-100 max-[760px]:hidden"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        {pages > 1 && (
          <div className="mx-auto w-full max-w-5xl shrink-0 pt-3">
            <Pagination
              page={current}
              pages={pages}
              onPage={setPage}
              label={t.pageOf(current, pages)}
              prevLabel={t.prevPage}
              nextLabel={t.nextPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function VhostEditor({
  kind,
  name,
  site,
  maintenanceOK,
  onAuthLost,
  onBack,
  onRenamed,
  runAction,
  refresh,
  defaultReload,
}: {
  kind: VhostKind;
  name: string;
  site: Site | null;
  maintenanceOK: boolean;
  onAuthLost: () => void;
  onBack: () => void;
  onRenamed: (n: string) => void;
  runAction: (names: string[], action: SiteAction, opts?: { confirm?: boolean }) => Promise<boolean>;
  refresh: () => void;
  defaultReload: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const output = useOutput();
  const dark = useDarkTheme();
  const askName = usePrompt();
  const notifyReload = useReloadToast();
  const file = useFileEditor(onAuthLost);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  useEffect(() => {
    void file.open(`${kind}-available/${name}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, name]);

  async function back() {
    if (await file.confirmDiscard()) onBack();
  }

  async function rename() {
    const newName = await askName({ title: t.rename, label: t.renamePrompt, initial: name, confirmLabel: t.rename });
    if (!newName || newName.trim() === name) return;
    if (file.dirty && !(await file.confirmDiscard())) return;
    try {
      const res = await api.vhostRename(kind, name, newName.trim());
      toast(t.renamed);
      notifyReload(res);
      onRenamed(newName.trim());
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
      if (err instanceof ApiError && err.output) output(t.output, err.output);
    }
  }

  async function clone() {
    const newName = await askName({
      title: t.clone,
      label: t.clonePrompt,
      initial: `${name}-copy`,
      confirmLabel: t.clone,
    });
    if (!newName) return;
    if (file.dirty && !(await file.confirmDiscard())) return;
    try {
      await api.vhostClone(kind, name, newName.trim());
      toast(t.cloned);
      onRenamed(newName.trim());
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
      if (err instanceof ApiError && err.output) output(t.output, err.output);
    }
  }

  async function del() {
    if (await runAction([name], "delete")) onBack();
  }

  const st = site ? stateOf(site) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Toolbar className="gap-3">
        <IconBtn onClick={back} aria-label={t.back}>
          <BackIcon size={18} />
        </IconBtn>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-[14.5px] font-semibold">{name}</span>
            {st && (
              <Badge tone={tones[st]}>
                {st === "enabled"
                  ? t.stateEnabled
                  : st === "maintenance"
                    ? t.stateMaintenance
                    : t.stateDisabled}
              </Badge>
            )}
            {file.dirty && <Badge tone="warn">{t.unsaved}</Badge>}
          </div>
          <span className="truncate font-mono text-[11.5px] text-faint max-[520px]:hidden">
            {kind}-available/{name}
          </span>
        </div>
        <SaveButton
          save={file.save}
          saving={file.saving}
          disabled={!file.dirty || file.saving}
          defaultReload={defaultReload}
        />
      </Toolbar>

      <div className="flex min-h-0 flex-1 flex-col min-[900px]:flex-row-reverse">
        <EditorRail>
          {site && (
            <RailSection label={t.settings}>
              <RailToggle
                label={t.enableSite}
                checked={site.enabled}
                warn={site.maintenance}
                ariaLabel={site.enabled ? `${t.disableSite} ${name}` : `${t.enableSite} ${name}`}
                onToggle={() =>
                  void runAction([name], site.enabled ? "disable" : "enable").then((ok) => ok && refresh())
                }
              />
              {maintenanceOK && site.enabled && (
                <RailToggle
                  label={t.maintenanceOn}
                  checked={site.maintenance}
                  warn
                  ariaLabel={`${t.maintenanceOn} ${name}`}
                  onToggle={() =>
                    void runAction([name], site.maintenance ? "maintenance_off" : "maintenance_on")
                  }
                />
              )}
            </RailSection>
          )}

          {site?.domains && site.domains.length > 0 && (
            <RailSection label={kind === "sites" ? t.colDomains : t.colTargets}>
              <div className="flex flex-wrap gap-1 max-[899px]:hidden">
                {site.domains.map((d) => (
                  <MonoTag key={d}>{d}</MonoTag>
                ))}
              </div>
            </RailSection>
          )}

          <RailSection label={t.actions}>
            <Btn className="justify-start max-[899px]:justify-center" onClick={rename}>
              <PencilIcon size={15} /> {t.rename}
            </Btn>
            <Btn className="justify-start max-[899px]:justify-center" onClick={clone}>
              <CopyIcon size={15} /> {t.clone}
            </Btn>
            <Btn variant="danger" className="justify-start max-[899px]:justify-center" onClick={del}>
              <TrashIcon size={15} /> {t.deleteAction}
            </Btn>
          </RailSection>
        </EditorRail>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {file.loading ? (
            <Loading />
          ) : (
            <CodeEditor
              key={file.path ?? name}
              value={file.content}
              dark={dark}
              onChange={file.setContent}
              onSave={file.save}
              onCursor={(line, col) => setCursor({ line, col })}
            />
          )}
          <EditorStatus cursor={cursor} />
        </div>
      </div>
    </div>
  );
}
