# Tags and smart tags

Tags label configuration files without changing their nginx contents. Use them
in **Sites**, **Streams**, and **Configuration** alongside the existing text
and status filters. All fully authenticated users can manage tags, just as they
can edit configuration files. Partial MFA sessions and nginx API keys cannot.

## Create a tag

Choose **Manage tags** above a list, enter a name, and save. A tag without rules
is manual: open a file and choose **Tags** to assign or remove it. This also
works immediately after creating a site, stream, or configuration file.

Add rules to make the same tag automatic. For example, create `auth-gate`, add
a **File contents → Contains snippet** rule with the value
`include snippets/auth-gate.conf;`, and save. Every file containing that literal
text now receives the tag. Pasting a multiline snippet works too.

Rules can inspect the **File path** or **File contents**, using a literal
substring or a Go/RE2 regular expression. Matches are case-sensitive unless
**Ignore case** is checked. Choose **All rules** for an AND or **Any rule** for
an OR. For example, combine a path containing `sites-available/` with a content
rule to limit a snippet tag to HTTP sites. Regular expressions use Go's syntax;
lookaround and backreferences are not supported. Use `(?m)` for line anchors
or `(?s)` to let `.` match newlines.

Paths are relative to the configuration root and resolved through internal
symlinks. An enabled symlink and its available source share labels. Contents
means the file itself, including comments; included files are not expanded.
Content rules skip binary, unreadable, and oversized files (the editor's
`LN_MAX_EDIT_SIZE` limit). Path rules can still match oversized or binary files.
Escaping symlinks, directories, and special files are never scanned.

An **Automatic** badge in a file's tag dialog indicates a rule-derived tag.
Unchecking a manual assignment does not override an automatic match. Edit the
rules or saved file contents to remove that match. Rules evaluate saved content,
so unsaved editor changes do not affect tags. Reopening a list refreshes matches,
including changes made outside Lightngx.

## Filter lists

Expand **Tags** and choose **Include**, **Exclude**, or **Any** for each tag.
Every included tag must match; a single excluded tag hides a file. These
conditions combine with the text search and, for sites and streams, the state
filter. **Clear tag filters** resets only the tag conditions.

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
| PUT | `/api/config/tags?path=...` | Replace manual assignments: `{ "tags": [id] }` |

A rule is `{ "field": "content", "op": "contains", "value": "proxy_pass",
"ignoreCase": false }`. Fields are `content` or `path`; operators are `contains`
or `regex`. Mode is `all` or `any`; an empty rules array means manual only.
The existing config-tree and vhost-list responses include matching tag IDs on
files. A vhost also exposes its root-relative source `path`.
