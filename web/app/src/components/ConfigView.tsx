import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type TreeEntry } from "../api";
import { useConfirm, usePrompt } from "../confirm";
import {
  BackIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FilterIcon,
  FolderIcon,
  FolderPlusIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
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
  EmptyState,
  IconBtn,
  Loading,
  Pagination,
  ResizeHandle,
  SearchInput,
  Toolbar,
} from "../ui";
import { FileTagsButton, TagBadges, TagFilters, useTagFilter, useTags } from "./Tags";
import FilterSheet from "./FilterSheet";
import SaveButton from "./SaveButton";
import CodeEditor from "./CodeEditor";
import { EditorRail, EditorStatus, RailSection } from "./EditorShell";
import { useOutput } from "./OutputPanel";
import { useDarkTheme } from "./useDarkTheme";

const PAGE_SIZE = 50;

const TREE_MIN = 180;
const TREE_MAX = 480;
const TREE_DEFAULT = 256;
const TREE_KEY = "ln_tree_w";

function storedTreeWidth(): number {
  const v = Number(localStorage.getItem(TREE_KEY));
  return Number.isFinite(v) && v >= TREE_MIN && v <= TREE_MAX ? v : TREE_DEFAULT;
}

function fmtSize(n?: number): string {
  if (n === undefined) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Every navigation here is addressable, so the buttons that perform it are
// links: opening a folder or a file in a new tab lands on the same view.
const dirHref = (p: string) => hrefWithQuery({ dir: p || null, file: null, q: null });
const fileHref = (p: string) => hrefWithQuery({ file: p });

function findDir(root: TreeEntry, path: string): TreeEntry | null {
  if (path === "") return root;
  let node: TreeEntry | null = root;
  for (const seg of path.split("/")) {
    node = node?.children?.find((c) => c.isDir && c.name === seg) ?? null;
    if (!node) return null;
  }
  return node;
}

// Directory tree (folders only) for the left navigation pane.
function DirNode({
  entry,
  path,
  depth,
  cwd,
  onSelect,
  onRename,
  onDelete,
}: {
  entry: TreeEntry;
  path: string;
  depth: number;
  cwd: string;
  onSelect: (p: string) => void;
  onRename: (e: TreeEntry) => void;
  onDelete: (e: TreeEntry) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(depth < 1 || cwd.startsWith(path + "/") || cwd === path);
  const dirs = entry.children?.filter((c) => c.isDir) ?? [];
  const active = cwd === path;
  const self = { ...entry, path, isDir: true };

  return (
    <div>
      <div
        className={`group mb-0.5 flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg pr-1 text-[13.5px] transition-colors ${
          active ? "bg-accent-soft font-semibold text-accent-ink" : "hover:bg-hov"
        }`}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          className="flex h-7 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-faint hover:text-fg"
          onClick={() => setOpen(!open)}
          aria-label={open ? "collapse" : "expand"}
        >
          {dirs.length > 0 ? (
            open ? (
              <ChevronDownIcon size={13} />
            ) : (
              <ChevronRightIcon size={13} />
            )
          ) : (
            <span className="w-3" />
          )}
        </button>
        <Link
          href={dirHref(path)}
          onNavigate={() => onSelect(path)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden py-1.5 text-left"
        >
          <FolderIcon size={15} className={active ? "text-accent-ink" : "text-faint"} />
          <span className="truncate">{entry.name}</span>
        </Link>
        {depth > 0 && (
          <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <IconBtn size="xs" onClick={() => onRename(self)} title={t.rename} aria-label={t.rename}>
              <PencilIcon size={13} />
            </IconBtn>
            <IconBtn
              size="xs"
              className="hover:text-danger-ink"
              onClick={() => onDelete(self)}
              title={t.deleteFolder}
              aria-label={t.deleteFolder}
            >
              <TrashIcon size={13} />
            </IconBtn>
          </span>
        )}
      </div>
      {open &&
        dirs.map((d) => (
          <DirNode
            key={d.path}
            entry={d}
            path={path === "" ? d.name : `${path}/${d.name}`}
            depth={depth + 1}
            cwd={cwd}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

export default function ConfigView({
  onAuthLost,
  defaultReload,
}: {
  onAuthLost: () => void;
  defaultReload: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const output = useOutput();
  const ask = useConfirm();
  const askName = usePrompt();
  const notifyReload = useReloadToast();
  const dark = useDarkTheme();
  const loc = useLocation();
  const cwd = loc.searchParams.get("dir") ?? "";
  const fileParam = loc.searchParams.get("file");
  const filter = loc.searchParams.get("q") ?? "";
  const setFilter = (q: string) => setQuery({ q }, { replace: true });
  const tagData = useTags();
  const tagFilter = useTagFilter();
  const [tree, setTree] = useState<TreeEntry | null>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tagPaths, setTagPaths] = useState<string[] | null>(null);
  const [treeWidth, setTreeWidth] = useState(storedTreeWidth);
  const file = useFileEditor(onAuthLost);
  const restored = useRef(false);

  const refresh = useCallback(() => {
    api
      .tree()
      .then((r) => setTree(r.tree))
      .catch((err) => file.handleErr(err, t.loadError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(refresh, [refresh]);

  const dir = tree ? findDir(tree, cwd) : null;
  const entries = useMemo(() => {
    const list = dir?.children ?? [];
    const q = filter.trim().toLowerCase();
    return [...list]
      .filter((e) => {
        const match = (entry: TreeEntry): boolean => entry.isDir
          ? (entry.children ?? []).some(match)
          : tagFilter.matches(entry.tags);
        return (!q || e.name.toLowerCase().includes(q)) && (!tagFilter.active || match(e));
      })
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  }, [dir, filter, tagFilter.key]);

  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = entries.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const eligible = entries.filter(e => !e.isDir && !e.external);
  const selection = useBatchSelection(eligible.map(e => e.path), shown.filter(e => !e.isDir && !e.external).map(e => e.path),
    JSON.stringify([cwd, filter, tagFilter.key, file.path]));

  useEffect(() => setPage(1), [cwd, filter, tagFilter.key]);

  // Restore a deep-linked open file (?file=) once the tree is available.
  useEffect(() => {
    if (restored.current || !tree || !fileParam || file.path !== null) return;
    restored.current = true;
    void file.open(fileParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, fileParam]);

  async function goDir(p: string) {
    if (file.path !== null && !(await file.close())) return;
    setQuery({ dir: p || null, file: null, q: null });
  }

  async function closeFile() {
    if (await file.close()) setQuery({ file: null });
  }

  async function openEntry(e: TreeEntry) {
    if (e.isDir) {
      void goDir(cwd === "" ? e.name : `${cwd}/${e.name}`);
      return;
    }
    if (await file.open(e.path, !!e.external, e.symlink)) setQuery({ file: e.path });
  }

  // Join a bare entered name to the current directory so creation is
  // relative to where the user is, not the config root.
  function inCwd(name: string): string {
    const n = name.trim().replace(/^\/+/, "");
    return cwd === "" ? n : `${cwd}/${n}`;
  }

  async function newFile() {
    const name = await askName({ title: t.newFile, label: t.newFilePrompt, placeholder: "example.conf", confirmLabel: t.create });
    if (!name) return;
    const path = inCwd(name);
    try {
      const res = await api.writeFile(path, "# new file\n");
      notifyReload(res);
      refresh();
      if (await file.open(path)) setQuery({ file: path });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.output) {
        toast(t.saveFailed, "error");
        output(t.output, err.output);
      } else {
        file.handleErr(err, t.actionFailed);
      }
    }
  }

  async function newDir() {
    const name = await askName({ title: t.newDir, label: t.newDirPrompt, placeholder: "snippets", confirmLabel: t.create });
    if (!name) return;
    const path = inCwd(name).replace(/\/+$/, "");
    try {
      await api.mkdir(path);
      refresh();
      void goDir(path);
    } catch (err) {
      file.handleErr(err, t.actionFailed);
    }
  }

  async function renameEntry(e: TreeEntry) {
    const to = await askName({ title: t.rename, label: t.renamePrompt, initial: e.path, confirmLabel: t.rename });
    if (!to || to.trim() === e.path) return;
    try {
      const res = await api.renameFile(e.path, to.trim());
      toast(t.renamed);
      notifyReload(res);
      refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.output) {
        toast(t.saveFailed, "error");
        output(t.output, err.output);
      } else {
        file.handleErr(err, t.actionFailed);
      }
    }
  }

  async function deleteEntry(e: TreeEntry) {
    const opts = e.isDir
      ? { title: t.deleteFolder, message: t.confirmDeleteFolder(e.path), danger: true }
      : { title: t.deleteFile, message: t.confirmDelete(e.path), danger: true };
    if (!(await ask(opts))) return;
    try {
      const res = await api.deleteFile(e.path);
      toast(t.deleted);
      notifyReload(res);
      refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.output) {
        toast(t.saveFailed, "error");
        output(t.output, err.output);
      } else {
        file.handleErr(err, t.actionFailed);
      }
    }
  }

  async function renameOpenFile() {
    if (!file.path) return;
    const from = file.path;
    const to = await askName({ title: t.rename, label: t.renamePrompt, initial: from, confirmLabel: t.rename });
    if (!to || to.trim() === from) return;
    // Close first (single discard prompt if dirty), then move and reopen fresh.
    if (!(await file.close())) return;
    try {
      const res = await api.renameFile(from, to.trim());
      toast(t.renamed);
      notifyReload(res);
      refresh();
      if (await file.open(to.trim())) setQuery({ file: to.trim() });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.output) {
        toast(t.saveFailed, "error");
        output(t.output, err.output);
      } else {
        file.handleErr(err, t.actionFailed);
      }
      if (await file.open(from)) setQuery({ file: from });
    }
  }

  async function deleteOpenFile() {
    if (!file.path) return;
    const p = file.path;
    if (!(await ask({ title: t.deleteFile, message: t.confirmDelete(p), danger: true }))) return;
    try {
      const res = await api.deleteFile(p);
      toast(t.deleted);
      notifyReload(res);
      // The file is gone — clear the editor without a discard prompt.
      file.reset();
      setQuery({ file: null, dir: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : null });
      refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.output) {
        toast(t.saveFailed, "error");
        output(t.output, err.output);
      } else {
        file.handleErr(err, t.actionFailed);
      }
    }
  }

  const breadcrumbs = (
    <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[13.5px] whitespace-nowrap">
      <Link
        href={dirHref("")}
        className="shrink-0 cursor-pointer rounded-md px-2 py-1 font-medium text-dim hover:bg-hov hover:text-fg"
        onNavigate={() => void goDir("")}
      >
        {t.root}
      </Link>
      {cwd !== "" &&
        cwd.split("/").map((seg, i, all) => (
          <span key={i} className="flex shrink-0 items-center gap-0.5">
            <ChevronRightIcon size={13} className="text-faint" />
            <Link
              href={dirHref(all.slice(0, i + 1).join("/"))}
              className={`cursor-pointer rounded-md px-2 py-1 hover:bg-hov ${
                i === all.length - 1 ? "font-semibold" : "text-dim"
              }`}
              onNavigate={() => void goDir(all.slice(0, i + 1).join("/"))}
            >
              {seg}
            </Link>
          </span>
        ))}
    </nav>
  );

  const openDir = file.path?.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";
  const openName = file.path?.slice(openDir.length) ?? "";

  return (
    <div className="config-workspace flex min-h-0 min-w-0 flex-1">
      <aside
        className="relative hidden shrink-0 flex-col border-r border-line bg-panel min-[900px]:flex"
        style={{ width: treeWidth }}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
          <span className="flex-1 text-xs font-medium text-dim">
            {t.folders}
          </span>
          <IconBtn size="sm" onClick={newDir} title={t.newDir} aria-label={t.newDir}>
            <FolderPlusIcon size={16} />
          </IconBtn>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {tree && (
            <DirNode
              entry={{ ...tree, name: t.root }}
              path=""
              depth={0}
              cwd={cwd}
              onSelect={(p) => void goDir(p)}
              onRename={(e) => void renameEntry(e)}
              onDelete={(e) => void deleteEntry(e)}
            />
          )}
        </div>
        <ResizeHandle
          value={treeWidth}
          min={TREE_MIN}
          max={TREE_MAX}
          resetTo={TREE_DEFAULT}
          onChange={setTreeWidth}
          onCommit={(w) => localStorage.setItem(TREE_KEY, String(w))}
          ariaLabel={t.resizeFolders}
        />
      </aside>

      {/* Content */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {file.path !== null ? (
          <>
            <Toolbar className="file-editor-toolbar gap-3">
              <IconBtn onClick={closeFile} aria-label={t.back}>
                <BackIcon size={18} />
              </IconBtn>
              <div className="editor-file-title flex min-w-0 flex-1 flex-col">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="m-0 truncate font-mono text-[14.5px] font-semibold" title={file.path}>
                    {openName}
                  </h1>
                  {file.readOnly && <Badge tone="warn">{t.readOnly}</Badge>}
                  {file.dirty && <Badge tone="warn">{t.unsaved}</Badge>}
                </div>
                <span
                  className="truncate font-mono text-[11.5px] text-faint max-[520px]:hidden"
                  title={file.symlink ? `${file.path} → ${file.symlink}` : undefined}
                >
                  {openDir || t.root}
                  {file.symlink && ` → ${file.symlink}`}
                </span>
              </div>
              <SaveButton
                save={file.save}
                saving={file.saving}
                disabled={!file.dirty || file.saving || file.readOnly}
                defaultReload={defaultReload}
              />
            </Toolbar>
            <div className="flex min-h-0 flex-1 flex-col min-[900px]:flex-row-reverse">
              <EditorRail>
                <RailSection label={t.tags}>
                  <FileTagsButton
                    key={file.path}
                    revision={file.revision}
                    path={file.path}
                    onChanged={refresh}
                    disabled={file.readOnly || file.loading}
                  />
                </RailSection>
                <RailSection label={t.actions}>
                  <Btn
                    className="justify-start max-[899px]:justify-center"
                    onClick={renameOpenFile}
                    disabled={file.readOnly}
                  >
                    <PencilIcon size={15} /> {t.rename}
                  </Btn>
                  <Btn
                    variant="danger"
                    className="justify-start max-[899px]:justify-center"
                    onClick={deleteOpenFile}
                  >
                    <TrashIcon size={15} /> {t.deleteFile}
                  </Btn>
                </RailSection>
              </EditorRail>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {file.loading ? (
                  <Loading />
                ) : (
                  <CodeEditor
                    key={file.path}
                    value={file.content}
                    dark={dark}
                    readOnly={file.readOnly}
                    onChange={file.setContent}
                    onSave={file.save}
                    onCursor={(line, col) => setCursor({ line, col })}
                  />
                )}
                <EditorStatus cursor={cursor} readOnly={file.readOnly} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="workspace-heading"><div><h1>{t.tabEditor}</h1><p>{t.configIntro}</p></div></div>
            <Toolbar className="config-browser-toolbar">
              {breadcrumbs}
              <SearchInput
                value={filter}
                onChange={setFilter}
                placeholder={t.filterEntries}
                className="config-search w-[220px] min-w-0 shrink-0"
              />
              <Btn className="config-filter-button min-[761px]:hidden" aria-label={t.filters} aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}><FilterIcon size={16} />{t.filters}{tagFilter.active && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}</Btn>
              <Btn className="shrink-0" onClick={newDir} title={t.newDir}>
                <FolderPlusIcon size={17} /> <span className="max-[900px]:hidden">{t.newDir}</span>
              </Btn>
              <Btn variant="primary" className="shrink-0" onClick={newFile} title={t.newFile}>
                <PlusIcon size={17} /> <span className="max-[900px]:hidden">{t.newFile}</span>
              </Btn>
            </Toolbar>
            <div className="desktop-filters"><TagFilters tags={tagData.tags} error={tagData.error} onChanged={() => { tagData.refresh(); refresh(); }} /></div>
            <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} active={tagFilter.active} onReset={tagFilter.clear} resultCount={entries.length} tags={tagData.tags} tagError={tagData.error} onTagsChanged={() => { tagData.refresh(); refresh(); }} />
            <BatchSelection count={selection.selected.size} total={eligible.length} canSelectMore={selection.canSelectMore} atLimit={selection.atLimit}
              onClear={selection.clear} onSelectMatching={selection.selectMatching} onTags={() => setTagPaths([...selection.selected])} />
            {tagPaths && <BatchTagsDialog paths={tagPaths} onClose={() => setTagPaths(null)} onChanged={() => { selection.clear(); tagData.refresh(); refresh(); }} />}
            <span role="status" className="sr-only">{t.itemsCount(entries.length)}</span>
            <div className="config-list-area flex min-h-0 flex-1 flex-col overflow-auto p-4 min-[761px]:p-6">
              {!tree ? (
                <Loading />
              ) : entries.length === 0 ? (
                filter || tagFilter.active ? (
                  <EmptyState
                    icon={<FolderIcon size={26} />}
                    title={t.noMatches}
                    hint={t.noMatchesHint}
                  />
                ) : (
                  <EmptyState
                    icon={<FolderIcon size={26} />}
                    title={t.emptyFolder}
                    hint={t.emptyFolderHint}
                    action={
                      <Btn variant="primary" size="lg" onClick={newFile}>
                        <PlusIcon size={17} /> {t.newFile}
                      </Btn>
                    }
                  />
                )
              ) : (
                <div className="flex w-full shrink-0 flex-col gap-3">
                <Card className="config-file-list w-full overflow-hidden">
                  {eligible.length > 0 && <div data-batch-select className="flex min-h-11 items-center gap-3 border-b border-line-soft px-3 min-[761px]:px-4">
                    <Checkbox checked={selection.allPage} indeterminate={selection.somePage} disabled={shown.every(e => e.isDir || e.external) || (selection.atLimit && !selection.allPage)} onChange={selection.togglePage} ariaLabel={t.batchSelectPage} />
                    <span className="text-xs text-dim">{t.itemsCount(entries.length)}</span>
                  </div>}

                  <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
                    {shown.map((e) => (
                      <li
                        key={e.path}
                        className="group flex items-center transition-colors hover:bg-hov"
                      >
                        {eligible.length > 0 && <span className="ml-3 flex w-[19px] shrink-0 items-center min-[761px]:ml-4">
                          {!e.isDir && !e.external && <Checkbox checked={selection.selected.has(e.path)} disabled={selection.atLimit && !selection.selected.has(e.path)} onChange={() => selection.toggle(e.path)} ariaLabel={e.name} />}
                        </span>}
                        <Link
                          href={
                            e.isDir ? dirHref(cwd === "" ? e.name : `${cwd}/${e.name}`) : fileHref(e.path)
                          }
                          className="flex min-h-[56px] min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5 text-left min-[761px]:px-4"
                          onNavigate={() => void openEntry(e)}
                        >
                          <span
                            aria-hidden
                            className="flex w-5 shrink-0 items-center justify-center text-dim"
                          >
                            {e.isDir ? <FolderIcon size={17} /> : <FileIcon size={17} />}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <span className="truncate text-sm leading-5 font-medium">{e.name}</span>
                            <TagBadges ids={e.tags} tags={tagData.tags} />
                            {e.symlink && (
                              <span className="truncate font-mono text-[11.5px] text-faint">
                                → {e.symlink}
                              </span>
                            )}
                          </span>
                          {e.symlink && (
                            <span
                              className={`shrink-0 ${e.external ? "text-warn-ink" : "text-faint"}`}
                              title={e.external ? t.externalLink : t.symlinkTo(e.symlink)}
                            >
                              <LinkIcon size={14} />
                            </span>
                          )}
                          {!e.isDir && (
                            <span className="w-16 shrink-0 text-right text-[12px] text-faint tabular-nums max-[520px]:hidden">
                              {fmtSize(e.size)}
                            </span>
                          )}
                          {e.isDir && (
                            <ChevronRightIcon
                              size={16}
                              className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 max-[760px]:opacity-100"
                            />
                          )}
                        </Link>
                        <span className="flex shrink-0 items-center gap-0.5 pr-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-[760px]:opacity-100">
                          <IconBtn
                            size="sm"
                            onClick={() => void renameEntry(e)}
                            title={t.rename}
                            aria-label={`${t.rename} ${e.name}`}
                          >
                            <PencilIcon size={15} />
                          </IconBtn>
                          <IconBtn
                            size="sm"
                            className="hover:text-danger-ink"
                            onClick={() => void deleteEntry(e)}
                            title={e.isDir ? t.deleteFolder : t.deleteFile}
                            aria-label={`${e.isDir ? t.deleteFolder : t.deleteFile} ${e.name}`}
                          >
                            <TrashIcon size={15} />
                          </IconBtn>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
                {pages > 1 && (
                  <Pagination
                    page={current}
                    pages={pages}
                    onPage={setPage}
                    label={t.pageOf(current, pages)}
                    prevLabel={t.prevPage}
                    nextLabel={t.nextPage}
                  />
                )}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
