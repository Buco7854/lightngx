# Tags and smart tags

Tags label configuration files without changing their nginx contents. Use them
in **Sites**, **Streams**, and **Configuration** alongside the existing text
and status filters. All fully authenticated users can manage tags, just as they
can edit configuration files. Partial MFA sessions and nginx API keys cannot.

## Create a tag

Open a file, site, or stream and choose **Tags** in the editor rail. Its tag
workspace lets you assign labels, create tags, edit their rules, and delete tags
without navigating away or losing unsaved configuration changes. Assigned labels
are also visible in the rail; select one to edit it directly. **Manage tags**
above any list opens the same workspace without a file context.

Choose **New tag**, enter a name, and select **Manual** or **Smart**. When creating
a manual label from an editor, **Assign to this file** is selected by default. Smart
tags have no assignment checkbox: they are applied only by their rules. Manual assignments
save immediately when you change a checkbox. Definitions and rules use an explicit
save button; closing an edited form offers to keep or discard the draft.

Select **Smart** to add automatic rules. Use a single-line snippet or expand
**Multiline** for larger snippets; pasting multiple lines expands it automatically. For example, create `auth-gate`, add
a **Contents → Contains** condition with the value
`include snippets/auth-gate.conf;`, and save. Every file containing that literal
text now receives the tag. Pasting a multiline snippet works too.

Rules can inspect the **Path** or **Contents**, using a literal
substring or a Go/RE2 regular expression. Matches are case-sensitive unless
**Ignore case** is checked. Choose **All rules** for an AND or **Any rule** for
an OR. For example, combine a path containing `sites-available/` with a content
rule to limit a snippet tag to HTTP sites.

Use **Does not contain** to match files without a literal snippet, or **Does not
match regex** to match files where the expression has no match anywhere in the
selected path or contents. For example, a `missing-auth` tag with **All rules**,
**Contents → Contains → `proxy_pass`**, and **Contents → Does not contain →
`include snippets/auth-gate.conf;`** finds proxy configurations missing that
snippet. These negative conditions support **Ignore case** and work with both
rule modes.

Regular expressions use Go's syntax;
lookaround and backreferences are not supported. Use `(?m)` for line anchors
or `(?s)` to let `.` match newlines.

Paths are relative to the configuration root and resolved through internal
symlinks. An enabled symlink and its available source share labels. Contents
means the file itself, including comments; included files are not expanded.
Content rules skip binary, unreadable, and oversized files (the editor's
`LN_MAX_EDIT_SIZE` limit), including negative conditions: a failed read does not
prove that text is absent. Path rules can still match oversized or binary files.
Escaping symlinks, directories, and special files are never scanned.

Smart tags appear in their own section with a **Matches** or **No match** status.
They cannot be assigned manually, even through the API. Converting a manual tag to
a smart tag removes its existing assignments; older manual pins on smart tags are
also cleaned up automatically when Lightngx starts. Select the
tag’s name in the same workspace to edit its rules, or change the saved file
contents to remove that match. Rules evaluate saved content,
so unsaved editor changes do not affect tags. Reopening a list refreshes matches,
including changes made outside Lightngx.

## Apply manual tags in bulk

Select files with the row checkboxes in **Sites**, **Streams**, or
**Configuration**, then choose **Tags** in the selection bar. The header checkbox
selects only the current page. Selection stays with you across pages; choose
**Select all … matching files** to include other pages explicitly. Batches are
limited to 200 files. For larger results, **Select first 200 matching files**
names that limit before you act. Changing filters or folders clears the selection.
Folders and external links cannot be selected in the config browser.

The dialog shows the manual labels already present. Open **Choose manual tags**
to search and select labels. A partial checkbox and an `n/m` chip mean that only
some selected files have that label; selecting it applies the label to all files.
Remove a chip to remove that label from the selection. The change preview states
each addition and removal, with **Undo** for individual changes. Choose
**Apply changes** to save them together. Untouched labels keep their original
assignments, including partially assigned labels.

**New tag** opens the same creation form used by the file workspace. In a batch
it creates a manual label and stages its assignment; the assignment is saved
when you apply changes. Closing with pending edits offers to keep or discard
those edits. Smart tags remain rule-driven.

The update either succeeds for every selected file or changes none. Missing
files, external links, unknown tags, and tags converted to smart are rejected.
Internal symlink aliases of the same file are counted and updated once. These
metadata changes do not edit nginx contents or require a reload.

## Filter lists

Use the searchable **Include** and **Exclude** pickers above a list. Selected
tags appear as removable chips: `+` for included tags and `−` for excluded tags.
Select a chip to remove that condition. Every included tag must match; a single
excluded tag hides a file. These
conditions combine with the text search and independent **Enabled** and
**Maintenance** filters. Enabled includes sites in maintenance, since their nginx
links are still enabled. Set maintenance to **On** or **Off** to narrow this further;
streams only show the enabled filter. Status selections also live in the URL
(`enabled=true&maintenance=false`), and older `state=...` bookmarks still work. **Clear tag filters** resets only the tag conditions.

Filters live in the URL (`tags=1,2&excludeTags=3`), so bookmarks and browser
back/forward preserve them. Configuration filters apply to the current folder;
folders with matching descendants remain visible for navigation. Site selection
is cleared when filters change so bulk actions do not act on hidden selections.

## Persistence and limits

Definitions and manual assignments live in the existing SQLite database under
`LN_DATA_DIR` (or `LN_DB_PATH`). Include that database in backups. Tags are shared
between users. Renaming files or folders through Lightngx moves assignments;
cloning a site or stream copies them. Successful deletions remove assignments,
and failed nginx validation preserves them. Renames made outside Lightngx do
not move manual assignments; smart tags are reevaluated at the new path.

There can be up to 128 tags, with 48-character names, 16 rules per tag, and
4,096 bytes per rule value. Regular expressions are compiled once per definition
change. Matching reads each needed file at most once per scan, evaluates path
rules first, and caches only matching IDs for up to 4,096 files. File identity,
size, modification time, and mode changes invalidate cached matches. No file
content is retained in this cache or sent to the browser to evaluate rules.

## API

These routes require a full browser session and use the usual same-origin CSRF
protection for mutations:

| Method | Route | Body or result |
| --- | --- | --- |
| GET | `/api/tags` | `{ "tags": [...] }` |
| POST | `/api/tags` | Create `{ "name", "mode", "rules" }` |
| PUT | `/api/tags/{id}` | Replace a definition with the same ID |
| DELETE | `/api/tags/{id}` | Delete the tag and its assignments |
| GET | `/api/config/tags?path=...` | `{ "manual": [id], "automatic": [id], "tags": [id] }` (tags is the union) |
| PUT | `/api/config/tags?path=...` | Replace manual assignments (smart IDs are rejected): `{ "tags": [id] }` |
| POST | `/api/config/tags/batch` | Preview `{ "paths": [...] }`; returns `{ "files": n, "tags": [{ "id", "name", "mode", "rules", "count" }] }` with manual tags only |
| PATCH | `/api/config/tags/batch` | Apply `{ "paths": [...], "tags": [id], "operation": "add" }` or `"remove"`; returns `{ "files": n }` |

The batch PATCH route also accepts `{ "paths": [...], "add": [id], "remove": [id] }`
for mixed edits in one transaction. A tag cannot appear in both arrays; their
combined length is limited to 128. The original `operation`/`tags` format remains
supported, but cannot be combined with `add`/`remove`.

A rule is `{ "field": "content", "op": "contains", "value": "proxy_pass",
"ignoreCase": false }`. Fields are `content` or `path`; operators are `contains`,
`not_contains`, `regex`, or `not_regex`. Mode is `all` or `any`; an empty rules array means manual only.
The existing config-tree and vhost-list responses include matching tag IDs on
files. A vhost also exposes its root-relative source `path`.
