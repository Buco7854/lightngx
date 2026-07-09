import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type TreeEntry } from "../api";
import { useConfirm, usePrompt } from "../confirm";
import {
  BackIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../icons";
import { useI18n } from "../i18n";
import { setQuery, useLocation } from "../router";
import { useToast } from "../toast";
import { useFileEditor } from "../useFileEditor";
import { useReloadToast } from "../useReloadToast";
import { Btn, editorPaneCls, EmptyState, Spinner } from "../ui";
import SaveButton from "./SaveButton";
import CodeEditor from "./CodeEditor";
import { useOutput } from "./OutputPanel";
import { useDarkTheme } from "./useDarkTheme";

function fmtSize(n?: number): string {
  if (n === undefined) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

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
        className={`group mb-0.5 flex min-h-[32px] cursor-pointer items-center gap-1 rounded-md pr-1 text-[13px] ${
          active ? "bg-accent/15" : "hover:bg-hov"
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button
          className="flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center text-dim"
          onClick={() => setOpen(!open)}
          aria-label={open ? "collapse" : "expand"}
        >
          {dirs.length > 0 ? (open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />) : <span className="w-3" />}
        </button>
        <button
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 overflow-hidden py-1.5 text-left"
          onClick={() => onSelect(path)}
        >
          <FolderIcon size={14} className={active ? "text-accent" : "text-dim"} />
          <span className="truncate">{entry.name}</span>
        </button>
        {depth > 0 && (
          <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-dim hover:bg-ctrl hover:text-fg"
              onClick={() => onRename(self)}
              title={t.rename}
            >
              <PencilIcon size={13} />
            </button>
            <button
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-dim hover:bg-ctrl hover:text-danger"
              onClick={() => onDelete(self)}
              title={t.deleteFolder}
            >
              <TrashIcon size={13} />
            </button>
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
  const [tree, setTree] = useState<TreeEntry | null>(null);
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
  const entries = dir?.children ?? [];

  // Restore a deep-linked open file (?file=) once the tree is available.
  useEffect(() => {
    if (restored.current || !tree || !fileParam || file.path !== null) return;
    restored.current = true;
    void file.open(fileParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, fileParam]);

  async function goDir(p: string) {
    if (file.path !== null && !(await file.close())) return;
    setQuery({ dir: p || null, file: null });
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
    <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-[13px] whitespace-nowrap">
      <button
        className="shrink-0 cursor-pointer rounded px-1.5 py-0.5 font-medium text-dim hover:bg-ctrl hover:text-fg"
        onClick={() => void goDir("")}
      >
        {t.root}
      </button>
      {cwd !== "" &&
        cwd.split("/").map((seg, i, all) => (
          <span key={i} className="flex shrink-0 items-center gap-1">
            <ChevronRightIcon size={12} className="text-dim" />
            <button
              className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-ctrl"
              onClick={() => void goDir(all.slice(0, i + 1).join("/"))}
            >
              {seg}
            </button>
          </span>
        ))}
    </nav>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* Folder tree pane */}
      <aside className="hidden w-[230px] shrink-0 overflow-auto border-r border-line bg-panel p-2.5 min-[900px]:block">
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
      </aside>

      {/* Content */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {file.path !== null ? (
          <>
            <div className="flex min-h-[56px] flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
              <Btn variant="ghost" className="px-2" onClick={closeFile} aria-label={t.back}>
                <BackIcon />
              </Btn>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  className="min-w-0 truncate font-mono text-[13px] text-dim"
                  title={file.symlink ? `${file.path} → ${file.symlink}` : file.path ?? undefined}
                >
                  {file.path}
                  {file.symlink && <span className="text-dim opacity-70"> → {file.symlink}</span>}
                  {file.readOnly && ` (${t.readOnly})`}
                </span>
                {file.dirty && (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full bg-warn"
                    title={t.unsavedChanges}
                  />
                )}
              </span>
              <SaveButton
                save={file.save}
                saving={file.saving}
                disabled={!file.dirty || file.saving || file.readOnly}
                defaultReload={defaultReload}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col min-[761px]:flex-row-reverse">
              <div className={editorPaneCls}>
                <Btn
                  className="min-h-[36px] justify-start text-[13px] max-[760px]:justify-center"
                  onClick={renameOpenFile}
                  disabled={file.readOnly}
                >
                  <PencilIcon size={14} /> {t.rename}
                </Btn>
                <Btn
                  variant="danger"
                  className="min-h-[36px] justify-start text-[13px] max-[760px]:justify-center"
                  onClick={deleteOpenFile}
                >
                  <TrashIcon size={14} /> {t.deleteFile}
                </Btn>
              </div>
              {file.loading ? (
                <EmptyState>
                  <Spinner />
                </EmptyState>
              ) : (
                <CodeEditor
                  key={file.path}
                  value={file.content}
                  dark={dark}
                  readOnly={file.readOnly}
                  onChange={file.setContent}
                  onSave={file.save}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex min-h-[56px] items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
              {breadcrumbs}
              <Btn className="shrink-0" onClick={newDir} title={t.newDir}>
                <FolderPlusIcon size={16} /> <span className="max-[760px]:hidden">{t.newDir}</span>
              </Btn>
              <Btn className="shrink-0" onClick={newFile} title={t.newFile}>
                <PlusIcon /> <span className="max-[760px]:hidden">{t.newFile}</span>
              </Btn>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 min-[761px]:p-4">
              {!tree ? (
                <EmptyState>
                  <Spinner />
                </EmptyState>
              ) : entries.length === 0 ? (
                <EmptyState>{t.emptyFolder}</EmptyState>
              ) : (
                <ul className="mx-auto flex max-w-4xl flex-col gap-1">
                  {entries.map((e) => (
                    <li key={e.path} className="group flex items-center gap-1 rounded-lg hover:bg-panel">
                      <button
                        className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 text-left"
                        onClick={() => void openEntry(e)}
                      >
                        {e.isDir ? (
                          <FolderIcon className="shrink-0 text-accent/80" />
                        ) : (
                          <FileIcon className="shrink-0 text-dim" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                        {e.symlink && (
                          <LinkIcon
                            size={13}
                            className={`shrink-0 ${e.external ? "text-warn" : "text-dim"}`}
                          />
                        )}
                        {!e.isDir && (
                          <span className="w-16 shrink-0 text-right text-xs text-dim max-[760px]:hidden">
                            {fmtSize(e.size)}
                          </span>
                        )}
                      </button>
                      <span className="flex shrink-0 gap-0.5 pr-2 opacity-0 transition-opacity group-hover:opacity-100 max-[760px]:opacity-100">
                        <Btn
                          variant="ghost"
                          className="min-h-[32px] px-2 text-dim"
                          onClick={() => void renameEntry(e)}
                          title={t.rename}
                        >
                          <PencilIcon size={14} />
                        </Btn>
                        <Btn
                          variant="ghost"
                          className="min-h-[32px] px-2 text-dim hover:text-danger"
                          onClick={() => void deleteEntry(e)}
                          title={e.isDir ? t.deleteFolder : t.deleteFile}
                        >
                          <TrashIcon size={14} />
                        </Btn>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
