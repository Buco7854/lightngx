import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, type Site, type SiteAction, type VhostKind } from "../api";
import { type ConfirmOptions, useConfirm, usePrompt } from "../confirm";
import {
  BackIcon,
  ChevronRightIcon,
  CopyIcon,
  FilterIcon,
  GlobeIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  StreamIcon,
  TrashIcon,
  CheckIcon,
} from "../icons";
import { useI18n } from "../i18n";
import { hrefWithQuery, Link, setQuery, useLocation } from "../router";
import { useToast } from "../toast";
import { useFileEditor } from "../useFileEditor";
import { useBatchSelection } from "../useBatchSelection";
import BatchSelection from "./BatchSelection";
import BatchTagsDialog from "./tags/BatchTagsDialog";
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
  Pagination,
  SearchInput,
  Spinner,
  Switch,
  Toolbar,
} from "../ui";
import { FileTagsButton, TagBadges, TagFilters, useTagFilter, useTags } from "./Tags";
import FilterSheet from "./FilterSheet";
import VhostStatusFilters, { useVhostStatus } from "./VhostStatusFilters";
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

const PAGE_SIZE = 50;

function stateOf(s: Site): State {
  return s.maintenance ? "maintenance" : s.enabled ? "enabled" : "disabled";
}

const tones: Record<State, "ok" | "warn" | "neutral"> = {
  enabled: "ok",
  maintenance: "warn",
  disabled: "neutral",
};

const COL_LABEL = "text-xs font-normal text-dim";

function DomainList({ domains }: { domains: string[] | null }) {
  if (!domains || domains.length === 0) return null;
  const shown = domains.slice(0, 3);
  const rest = domains.length - shown.length;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((d) => (
        <span className="domain-name" key={d}>{d}</span>
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
  const setEditing = (name: string | null) => setQuery({ edit: name });
  const setFilter = (q: string) => setQuery({ q }, { replace: true });
  const tagData = useTags();
  const tagFilter = useTagFilter();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [maintenanceOK, setMaintenanceOK] = useState(false);
  const statusFilter = useVhostStatus(maintenanceOK);
  const [tagPaths, setTagPaths] = useState<string[] | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const filtered = useMemo(() => {
    if (!sites) return [];
    const q = filter.trim().toLowerCase();
    return sites.filter((s) => {
      if (!tagFilter.matches(s.tags)) return false;
      if (!statusFilter.matches(s)) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.domains ?? []).some((d) => d.toLowerCase().includes(q))
      );
    });
  }, [sites, filter, statusFilter.key, tagFilter.key]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selection = useBatchSelection(filtered.map(s => s.name), shown.map(s => s.name),
    JSON.stringify([filter, statusFilter.key, kind, tagFilter.key, editing]));
  const { selected, setSelected } = selection;
  useEffect(() => setPage(1), [filter, statusFilter.key, kind, tagFilter.key]);

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
          maintenance_on: { title: t.maintenanceStart, message: t.confirmMaintenanceVhosts(n) },
          maintenance_off: { title: t.maintenanceOff, message: t.confirmMaintenanceOffVhosts(n) },
          delete: { title: t.deleteAction, message: t.confirmDeleteVhosts(n), danger: true },
        };
        if (c[action] && !(await ask(c[action]!))) return false;
      }
      setBusy(names.join("\n"));
      try {
        await api.vhostAction(kind, names, action);
        setSelected(previous => new Set([...previous].filter(name => !names.includes(name))));
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
        refresh();
      }
    },
    [kind, ask, t, toast, output, onAuthLost, refresh, setSelected],
  );

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

  if (editing !== null && sites === null) return <Loading />;

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

  const sel = [...selected];
  const selSites = sites.filter((s) => selected.has(s.name));
  const enableSites = selSites.filter((s) => !s.enabled).map((s) => s.name);
  const disableSites = selSites.filter((s) => s.enabled).map((s) => s.name);
  const startMaintenance = selSites.filter((s) => s.enabled && !s.maintenance).map((s) => s.name);
  const endMaintenance = selSites.filter((s) => s.maintenance).map((s) => s.name);
  const anyBusy = busy !== "";
  const KindIcon = kind === "sites" ? GlobeIcon : StreamIcon;
  const newLabel = kind === "sites" ? t.newSite : t.newStream;

  return (
    <div className="vhosts-workspace flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="workspace-heading">
        <div><h1>{kind === "sites" ? t.navSites : t.navStreams}</h1><p>{kind === "sites" ? t.sitesIntro : t.streamsIntro}</p></div>
        <Btn variant="primary" className="shrink-0" onClick={create}><PlusIcon size={16} />{newLabel}</Btn>
      </div>
      <dl className="site-summary">
        <div className="summary-cell"><dt>{kind === "sites" ? t.totalSites : t.totalStreams}</dt><dd>{sites.length}</dd></div>
        <div className="summary-cell"><dt><i className="summary-dot ok" />{t.serving}</dt><dd>{sites.filter(s => s.enabled && !s.maintenance).length}</dd></div>
        <div className="summary-cell"><dt><i className="summary-dot warn" />{t.stateMaintenance}</dt><dd>{sites.filter(s => s.maintenance).length}</dd></div>
        <div className="summary-cell"><dt><i className="summary-dot" />{t.stateDisabled}</dt><dd>{sites.filter(s => !s.enabled && !s.maintenance).length}</dd></div>
      </dl>
      <Toolbar>
        <div className="vhost-status-filters desktop-filters"><VhostStatusFilters sites={sites} maintenanceAvailable={maintenanceOK} filters={statusFilter} /></div>
        <div className="vhost-search flex min-w-[200px] flex-1 items-center justify-end gap-2.5">
          <SearchInput
            value={filter}
            onChange={setFilter}
            placeholder={t.filterVhosts}
            className="min-w-0 flex-1 min-[761px]:max-w-[300px]"
          />

          <Btn className="min-[761px]:hidden" aria-expanded={filtersOpen} aria-haspopup="dialog" aria-label={t.filters} onClick={() => setFiltersOpen(!filtersOpen)}><FilterIcon size={16} />{t.filters}{(statusFilter.active || tagFilter.active) && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}</Btn>
        </div>
      </Toolbar>

      <div className="vhost-tags desktop-filters"><TagFilters tags={tagData.tags} error={tagData.error} onChanged={() => { tagData.refresh(); refresh(); }} /></div>

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        active={statusFilter.active || tagFilter.active}
        onReset={() => setQuery({ state: null, enabled: null, maintenance: null, tags: null, excludeTags: null })}
        resultCount={filtered.length}
        tags={tagData.tags}
        tagError={tagData.error}
        onTagsChanged={() => { tagData.refresh(); refresh(); }}
        status={<VhostStatusFilters sites={sites} maintenanceAvailable={maintenanceOK} filters={statusFilter} />}
      />

      <BatchSelection count={selected.size} total={filtered.length} canSelectMore={selection.canSelectMore} atLimit={selection.atLimit}
        busy={anyBusy} onClear={selection.clear} onSelectMatching={selection.selectMatching}
        onTags={() => setTagPaths(selSites.map(site => site.path ?? `${kind}-available/${site.name}`))}>
        {close => <>
            <MenuItem disabled={!enableSites.length} onClick={() => { close(); void runAction(enableSites, "enable"); }}>{t.enableSite}</MenuItem>
            <MenuItem disabled={!disableSites.length} onClick={() => { close(); void runAction(disableSites, "disable"); }}>{t.disableSite}</MenuItem>
            {maintenanceOK && <>
              <MenuItem disabled={!startMaintenance.length} onClick={() => { close(); void runAction(startMaintenance, "maintenance_on"); }}>{t.maintenanceStart}</MenuItem>
              <MenuItem disabled={!endMaintenance.length} onClick={() => { close(); void runAction(endMaintenance, "maintenance_off"); }}>{t.maintenanceOff}</MenuItem>
            </>}
            <MenuItem danger onClick={() => { close(); void runAction(sel, "delete"); }}><TrashIcon size={15} />{t.deleteAction}</MenuItem>
        </>}
      </BatchSelection>
      {tagPaths && <BatchTagsDialog paths={tagPaths} onClose={() => setTagPaths(null)} onChanged={() => { selection.clear(); tagData.refresh(); refresh(); }} />}

      <div className="site-table-area flex min-h-0 flex-1 flex-col">
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
          <Card className="site-table mx-auto w-full shrink-0 overflow-hidden">
            <div data-batch-select className="site-table-head flex items-center gap-3 border-b border-line-soft">
              <Checkbox
                checked={selection.allPage}
                indeterminate={selection.somePage}
                disabled={anyBusy || (selection.atLimit && !selection.allPage)}
                onChange={selection.togglePage}
                ariaLabel={t.batchSelectPage}
              />
              <span aria-live="polite" className="text-xs font-normal text-dim">
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
                    className="site-row group relative flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-3 transition-colors"
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
                        disabled={anyBusy || (selection.atLimit && !selected.has(s.name))}
                        onChange={() => selection.toggle(s.name)}
                        ariaLabel={s.name}
                      />
                    </span>

                    <div className="site-identity flex min-w-[150px] flex-1 flex-col gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="site-name truncate font-mono">{s.name}</span>
                        <Badge className="site-state" tone={tones[st]}>
                          {st === "enabled"
                            ? t.stateEnabled
                            : st === "maintenance"
                              ? t.stateMaintenance
                              : t.stateDisabled}
                        </Badge>
                      </div>
                      <DomainList domains={s.domains} />
                      <TagBadges ids={s.tags} tags={tagData.tags} />
                    </div>

                    <div className="row-actions relative z-10 flex shrink-0 items-center gap-3 min-[761px]:gap-4">
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
        {sites.length > 0 && <div className="site-list-foot"><span>{t.itemsCount(filtered.length)}</span><span><CheckIcon size={14} />{t.guardedChanges}</span></div>}
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

  const sourcePath = site?.path ?? `${kind}-available/${name}`;
  useEffect(() => {
    void file.open(sourcePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePath]);

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
      <Toolbar className="file-editor-toolbar gap-3">
        <IconBtn onClick={back} aria-label={t.back}>
          <BackIcon size={18} />
        </IconBtn>
        <div className="editor-file-title flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="m-0 truncate font-mono text-[14.5px] font-semibold">{name}</h1>
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
            {sourcePath}
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
                  <span className="domain-name" key={d}>{d}</span>
                ))}
              </div>
            </RailSection>
          )}

          <RailSection label={t.tags}>
            <FileTagsButton
              key={sourcePath}
              revision={file.revision}
              path={sourcePath}
              onChanged={refresh}
              disabled={file.loading}
            />
          </RailSection>

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
