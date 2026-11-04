# Lightngx interface redesign

The application now uses one restrained design system across its operational workspace, editor, logs, authentication, security, user management, tags, API keys and dialogs. The existing React/TypeScript/Tailwind stack, routes and APIs are preserved.

## Direction and rationale

**Framed sheet**, design-taste seed **1375836007**. A pale green-grey frame, white work sheet, precise row rules, restrained nginx green and locally hosted IBM Plex Sans/Mono. The product-specific signature is a state summary computed from actual site/stream flags, followed by the list and guarded editor workflow. “Serving” deliberately excludes maintenance; the independent Enabled filter still follows the underlying enabled flag.

The alternatives were a dark monitoring console, an achromatic ledger and a narrow icon rail. The selected frame gives infrequent administrators explicit navigation while reserving the working canvas for configuration and logs. Impeccable Operate mode informed hierarchy, native controls, accessibility, responsive reflow and the independent finish review; its concept seed was `seed:d7dc657b9ea0c3f4`. Visual decisions were made autonomously as the user requested; no aesthetic approval round was required.

The system is documented in [DESIGN.md](../DESIGN.md). Product constraints are in [PRODUCT.md](../PRODUCT.md). Reference research used [Vercel's operational areas](https://vercel.com/docs/projects) and [Linear's grouped navigation and settings](https://linear.app/changelog/2024-12-18-personalized-sidebar).

## What changed

- A 228px labelled sidebar and an inset work sheet replace the heavier bordered shell. Navigation folds below 1100px, giving tablet workflows the full canvas.
- Sites and streams gain contextual titles, computed state summaries, clearer domain/filename hierarchy and flat operational lists. Status and tag filters remain independent, URL-backed and available behind a disclosure on phones. A dot identifies active collapsed filters.
- Profile and administration use descriptive section columns beside their controls. Account, MFA, sessions, users and API keys retain their existing operations.
- Configuration uses plain file/folder rows; editors retain syntax highlighting, save/reload choices, file operations, tags, state controls and keyboard shortcuts. Secondary editor controls collapse below 900px.
- Authentication uses a branded desktop composition and focused mobile form. Setup, sign-in, MFA verification and forced enrolment share it.
- Semantic colour tokens cover both themes, with English/French strings paired. Fonts ship as six deduplicated WOFF2 subsets (133,052 bytes total), with no third-party font requests.
- Keyboard work adds a skip link, navigation-drawer focus containment, main-content inertness while the drawer is open, menu-trigger focus restoration and a named, focusable editor scroll region.
- A null/empty log-file list now renders safely instead of throwing.

No backend logic was modified for the redesign. Existing unrelated edits in `internal/sites/` and `docs/docs/sites.md` were left intact. There is no production sample-data layer or invented telemetry.

## Rendered review and corrections

The first pass exposed excessive mobile filter height, insufficient muted-text contrast, an unnamed editor field and the empty-log-list exception. Subsequent independent review caught incorrect primary-action foregrounds, a truncated French editor filename, clipped 320px row menus and focus loss after menu selection. All were fixed and recaptured. A redundant unlayered font reset was also removed so component typography takes effect.

Primary-action text now measures **5.57:1** in light and **5.83:1** in dark. The independent reviewer returned **ship for the two scored visual fixes**. The independent technical audit reports **18/20**, with no unresolved confirmed findings in its tested scope. [Detailed technical audit](ui-redesign/technical-audit.md).

| Measured property | Before | After |
|---|---|---|
| Desktop navigation | 248px | 228px |
| Desktop page title | 17px | 26px |
| Visible mobile page heading | None | 24px |
| Tablet navigation at 768px | Persistent sidebar | Drawer |
| Mobile first site row, 390px | y344 | y412 |
| Page overflow at 1440/768/390px | None | None |

The added title and live state summary consume 68px above the first mobile site row. Secondary filters collapse to keep that trade deliberate. Minimum-width checks also inspect clipped descendants: document overflow alone did not catch the original clipped row menu.

The design-taste standalone inspector was attempted twice but failed to establish a usable Chromium CDP session in this environment. Equivalent viewport captures, DOM/layout measurements and accessibility checks ran successfully through Playwright Chromium. Its source lint's `example.com` findings refer to the existing nginx new-site template and filename prompt; those are intentional editable template content. Monospace findings refer to code and technical identifiers. Impeccable's mechanical detector ran once and returned `[]`.

## Verification

- `npm --prefix web/app run build` — passes TypeScript and production compilation. Vite retains its existing large-chunk advisory for the editor-inclusive application bundle.
- `go test ./...` — passes.
- `go build ./cmd/lightngx` — passes; a freshly built binary served the embedded production assets, authenticated Sites view, four fixture rows and local font files with no failed responses or page errors.
- **32 axe scans** covering the main screens, French light/dark minimum-width views, sign-in, setup, MFA verification and forced enrolment — zero violations in the final scans. Automated results do not constitute complete WCAG certification.
- **13 browser workflow groups** pass: search and persisted URLs; status filters; bulk selection; site creation/edit/save; enable confirmation; cloning; deletion; tags; configuration browsing/editing; log history/pause/filter; administration dialog; mobile filters/drawer keyboard flow; theme/language switching. No page errors.
- No horizontal page overflow in checked 1440, 768, 390 and 320px layouts. Row action bounds independently verified in English and French at 320px. Null-log-list and empty-search states also rendered successfully.

The backend ran against an isolated temporary configuration and SQLite database with `/bin/true` as the nginx command fixture. Thus file/API/UI workflows were exercised; real nginx signal/reload behavior was not established by this browser run. Setup/MFA screenshot states used intercepted auth responses. Actual OIDC providers, physical security keys, screen readers and physical touch devices were not tested.

[Machine-readable verification](ui-redesign/verification.json) contains the final results and measurements without credentials. Screenshot content is a local test fixture: user `designer`, four sites (`blog`, `logging`, `staging`, `static`), the `ingress` stream, temporary review tags, and RFC-reserved example domains/IP addresses. None is injected into the shipped application.

## Screenshots

| View | Desktop | Tablet | Mobile |
|---|---|---|---|
| Sites before | [1440px](ui-redesign/screenshots/before-sites-1440.png) | [768px](ui-redesign/screenshots/before-sites-768.png) | [390px](ui-redesign/screenshots/before-sites-390.png) |
| Sites after | [1440px](ui-redesign/screenshots/sites-1440.png) | [768px](ui-redesign/screenshots/sites-768.png) | [390px](ui-redesign/screenshots/sites-390.png), [French dark 320px](ui-redesign/screenshots/sites-fr-dark-320.png) |
| Editor | [1440px](ui-redesign/screenshots/editor-1440.png) | — | [French dark 320px](ui-redesign/screenshots/editor-fr-dark-320.png) |
| Configuration | — | [768px](ui-redesign/screenshots/config-768.png) | — |
| Profile | [1440px](ui-redesign/screenshots/profile-1440.png) | — | — |
| Administration | [1440px](ui-redesign/screenshots/admin-1440.png) | — | — |
| Sign in | [1440px](ui-redesign/screenshots/login-1440.png) | — | [390px](ui-redesign/screenshots/login-390.png) |
| Setup / MFA | — | — | [Setup](ui-redesign/screenshots/setup-320.png), [Verify](ui-redesign/screenshots/verify-320.png), [Enrol](ui-redesign/screenshots/enroll-320.png) |

Questions skipped: the user explicitly delegated all design choices and requested autonomous implementation and iteration.

## Documentation publication assets

All 18 live documentation screenshots (nine light/dark pairs) were recaptured from the redesigned app: editor, file browser, sites, streams, logs, profile/MFA, active sessions, administration and mobile. The README uses the refreshed banner and editor/mobile screenshots. Banner and social-card SVG/PNG pairs, logo, favicon and touch icon now share the application palette. The docs theme uses the same locally hosted IBM Plex Sans and neutral dark surfaces.

The banner embeds a real editor capture and its font, rather than an invented interface. To regenerate its SVG and social-card source after a new editor capture, run `node scripts/update-doc-artwork.mjs /path/to/editor-work-sheet.png`, then render those SVGs to PNG at their declared dimensions. The sessions images crop the real section; demonstration browser sessions were created through the local fixture's login API. No production account or configuration was used.

## Mobile follow-up: filter organization and session overflow

User review found that the inline expanded filter rows were disordered on phones and the Profile sessions panel could scroll horizontally. The earlier viewport-only overflow check missed that inner-panel defect; its broad mobile conclusion should not be read as proof of internal containment.

Mobile Sites, Streams and Configuration now share a focused bottom sheet. Status fields align, tag fields occupy full rows, Reset clears the existing URL-backed selections, and a fixed results action closes the sheet without losing the list position. The same controls remain inline on desktop. Configuration's phone toolbar has two explicit rows: location/actions, then search/filters.

Settings grid items and session rows now shrink to their tracks. Device details, IPv6 addresses and timestamps wrap within the available width, and Revoke remains accessible. Secondary settings actions, filter-sheet Close/Manage tags and session Revoke have 44px mobile targets. The nested tag manager stacks search and New tag on phones; French 320px search text space increased from 0px to 172px. Work-sheet and modal foregrounds are explicitly theme-aware, including first paint.

The final production build was checked across **121 layout states**: seven application views at 320/375/390/430/768/1024/1440px in English/light, minimum-width views in both languages/themes, and 30 open filter sheets. Checks inspect inner scroll widths and clipped content, excluding intentional screen-reader text, ellipsis and the folder resize handle. No unintended overflow or page errors remained; 12 broad axe scans and a focused sheet scan passed. Status/tag/reset behavior, nested tag management, Escape, focus return and Configuration's tag-only sheet passed functional checks.

An independent audit additionally exercised populated users/API keys, long sessions, nested tag forms and synthesized touch scrolling on a 568px-high screen. Its remaining French search-field finding was fixed and reverified in light/dark. A fresh visual reviewer confirmed dark hierarchy, 44px targets, session containment and the pinned footer. These targeted results supersede the earlier mobile findings.

All documentation screenshots were refreshed again, with a new light/dark mobile-filter pair added to the gallery. [Mobile verification](ui-redesign/mobile-verification.json) · [Independent mobile audit](ui-redesign/mobile-audit.md) · [Filter sheet](ui-redesign/screenshots/mobile-filters-320.png) · [French dark sessions](ui-redesign/screenshots/mobile-sessions-fr-dark-320.png).
