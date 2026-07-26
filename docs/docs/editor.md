import ThemedImage from "@theme/ThemedImage";
import useBaseUrl from "@docusaurus/useBaseUrl";

# Editor and logs

The two pages you will live in: the guarded config editor and the live log
viewer.

## The config editor

The **Config** page is a file browser and editor over the nginx config
directory (`LN_NGINX_CONF_DIR`, `/etc/nginx` by default) with nginx syntax
highlighting. It is confined to that directory: nothing outside it is
readable or writable, lexically or through symlinks.

<ThemedImage
  alt="The configuration editor"
  sources={{
    light: useBaseUrl("/img/screenshot-editor.png"),
    dark: useBaseUrl("/img/screenshot-editor-dark.png"),
  }}
/>

You can create files and folders, and rename or delete them from the
tree. Files up to `LN_MAX_EDIT_SIZE` (2 MB by default) open in the
editor.

### Every change is guarded

Every write, rename, delete and site toggle runs `nginx -t` before it
counts. If the test fails, the change is rolled back and the editor shows
you nginx's own error output — the running config is never left in a state
nginx would reject. This is why there is no "are you sure?" friction on
saves: the guard is the safety net.

### The Save button

**Save** is a split button. Plain save applies the configured default
(`LN_DEFAULT_RELOAD_ON_SAVE`, reload by default); the dropdown offers
**Save and reload nginx** and **Save without reloading** per change, so
you can stage several edits and reload once at the end. Either way the
`nginx -t` guard runs first.

### Concurrent edits

Saving a file that changed on disk since you opened it raises a conflict
instead of silently overwriting the other edit. You choose: overwrite with
your version, or cancel and keep your buffer to copy, reopen and reapply.
Config mutations are also serialized server-side, so two saves can never
test or roll back against each other's half-applied state.

## The log viewer

The **Logs** page follows any file under `LN_LOG_PATHS`
(`/var/log/nginx` by default; several files or directories, separated by
commas or colons).

<ThemedImage
  alt="The live log viewer"
  sources={{
    light: useBaseUrl("/img/screenshot-logs.png"),
    dark: useBaseUrl("/img/screenshot-logs-dark.png"),
  }}
/>

- **Follow** streams new lines live over server-sent events. Untick it to
  pause; ticking it again resumes from the current end of file.
- **Load older** pages backwards through the file 64 KB at a time, so a
  multi-gigabyte access log opens instantly.
- **Rotated history included:** `.gz` files in the log directories open in
  the same viewer (paged, no follow — they do not grow).
- **Filter** narrows the visible lines as you type; warnings and errors
  are colored. The current file and filter live in the URL, so a view is
  shareable and survives a refresh.

Only regular files inside the configured paths are readable — symlinks are
ignored, so a stray link cannot point the viewer outside the log
directory.
