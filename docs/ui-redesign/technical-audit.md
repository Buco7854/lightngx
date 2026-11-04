# Lightngx redesign — technical audit

## Implementation Integrity Verdict

**Pass.** The implementation expresses a coherent nginx administration product: real site/stream counts and state controls, real domain and path data, configuration editing, logs, account/security settings, guarded changes, and persistent URLs. Backend operations remain connected. No invented operational data or decorative controls were found in the reviewed changes.

The bundled detector was run **exactly once**, using the required command against `web/app/src`. It returned `[]`. Full output: `impeccable-detector.json`. This is a deterministic source result, not a substitute for rendered review. The example.com nginx server template is intentional product functionality; monospace names, domains, paths, versions and code are appropriate contextual uses.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3/4 | Latest automated checks clean; targeted keyboard focus checks pass. Full screen reader and pending/error-state audit not performed. |
| 2 | Performance | 4/4 | Local subsetted variable fonts, pagination, bounded transitions and no heavy decorative imagery or blur effects in the revised UI. No runtime performance benchmark claimed. |
| 3 | Theming | 4/4 | Shared semantic tokens, functioning theme switching; refreshed light/dark contrast checks clean. |
| 4 | Responsive design | 3/4 | Reviewed surfaces fit at 390/768/1440px; targeted English/French site actions fit at 320px after correction. Physical touch/resize gestures and increased text-size matrix not exercised. |
| 5 | Implementation integrity | 4/4 | Product-specific data/actions remain connected; shared controls and source detector reviewed. |
| **Total** | | **18/20** | **Excellent — no confirmed outstanding blocker in this audit scope** |

## Executive Summary

- Outstanding verified issues: **P0: 0, P1: 0, P2: 0, P3: 0**.
- The earlier primary-button contrast problem is fixed. Refreshed `extras.json` records zero violations across all 16 light/dark/auth checks.
- Two independent browser findings were corrected and independently verified: menu selection focus restoration and site row action clipping at 320px.
- A CSS reset that suppressed component typography was removed; the New site action now computes to its intended 600 font weight.
- No source code was changed by this audit. Only audit scripts/evidence/reports were written under `/tmp/lightngx-redesign`.

## Detailed Findings by Severity

**No unresolved confirmed findings.** Findings discovered during review and resolved by the implementation agent:

### Resolved P1 — Site action menu clipped at 320px

- **Location:** `web/app/src/components/VhostsView.tsx`, row actions; `web/app/src/styles.css`, mobile `.site-row .row-actions`.
- **Category:** Responsive / Accessibility.
- **Impact before fix:** In English at 320px, the More actions button occupied x293–329 while its overflow-hidden card ended at x304, leaving only 11px of its 36px target visible and hiding the ellipsis. French left 21px visible. Document-level overflow checks were false negatives because the card clipped its children.
- **Standard:** WCAG 1.4.10 Reflow; cropped target also impaired practical pointer access.
- **Correction:** Action row uses the full available width and tighter group gaps on mobile.
- **Independent verification:** All three button rectangles fit completely inside the x16–304 card in English and French. More actions is x268–304 in both. See `technical-verification.json`.
- **Suggested command:** `/impeccable adapt` — completed.

### Resolved P2 — Selecting a menu item lost keyboard position

- **Location:** `web/app/src/ui.tsx`, shared `useMenu.close`.
- **Category:** Accessibility.
- **Impact before fix:** Theme → Light removed the focused menu item, left focus on BODY, and made the next Tab restart at Skip to content. Repeated theme/language/action menus could disrupt keyboard workflow.
- **Standard:** Keyboard focus continuity / WCAG 2.4.3 Focus Order.
- **Correction:** Explicit selection close now restores focus to the anchor button. Outside pointer dismissal retains its separate behavior.
- **Independent verification:** Theme → Light leaves `document.activeElement` on the Theme trigger. Dialog Escape restores its invoking New site button. CodeMirror Escape then Tab exits the editor; its indentation handling is not reported as a keyboard trap.
- **Suggested command:** `/impeccable harden` — completed.

### Resolved P3 — Global font reset overrode component typography

- **Location:** `web/app/src/styles.css`, former unlayered `button, input, select, textarea { font: inherit; }`.
- **Category:** Implementation integrity / maintainability.
- **Impact before fix:** The unlayered shorthand overrode Tailwind weight/size utilities. New site carried `font-semibold` but computed to font weight 400, weakening intended emphasis and making component declarations misleading.
- **Correction:** Redundant unlayered reset removed; Tailwind's base normalization remains.
- **Independent verification:** New site computes to font weight 600 and font size 14px. The IBM Plex Sans assets were independently confirmed to be variable fonts; repeated font asset URLs are not a weight-file defect.
- **Suggested command:** `/impeccable polish` — completed.

## Patterns and Systemic Observations

- Shared primitives propagate fixes well: token corrections repair all primary buttons, and `useMenu.close` repairs selection focus for dropdowns and comboboxes.
- Document scroll-width checks alone miss clipped children; include descendant bounds against overflow-hidden ancestors for minimum-width verification.
- The inherited reduced-motion stylesheet globally shortens animation/transition durations to 0.01ms. No task-blocking motion or flashing was observed. This audit did not establish whether every asynchronous loading state provides an appropriate non-motion alternative; that remains outside the verified scope.
- Responsive settings layouts rely partly on structural selectors such as `:nth-child(2)`. Current reviewed markup matches them; no actual breakage was found. Prefer explicit body classes when evolving the shared section structure.

## Positive Findings

- Current data and backend actions remain wired through the existing API layer; no backend code was modified by this review.
- Primary actions now have correct text contrast in both themes. Main surfaces and authentication passed the supplied refreshed automated contrast/accessibility checks.
- A real skip link targets focusable main content; modal/dialog labels, Escape dismissal, focus containment and return behavior are present.
- Mobile navigation makes the main workspace inert while open and restores invoking focus on close.
- Filter and editor options disclosures expose `aria-expanded`/`aria-controls`; native buttons and links retain keyboard and browser behavior.
- Local fonts use `font-display: swap` and language subsets. Domain/path/code typography uses the code face for meaningful data.
- CSS relies on product tokens for foreground, background, separators and states; dark mode also updates CodeMirror surfaces.

## Evidence and Limits

- Source detector: `impeccable-detector.json` (`[]`, one run).
- Broad screenshots/viewport matrix: `review.json` (28 entries, all document overflow false).
- Refreshed axe checks: `extras.json` (16 entries, zero violations).
- Independent keyboard and minimum-width browser observations: `technical-browser.json`, `technical-extra.json`; these record the pre-fix state and are superseded for corrected cases by `technical-verification.json`.
- Independent final verification: `technical-verification.json` (Theme focus restored; English/French 320px controls fit).
- Engine: Playwright Chromium, headless, emulated viewports, seeded local authenticated app at `http://127.0.0.1:5173`. No physical device or screen reader test; no synthesized touch drag was performed. Viewports alone do not prove gesture behavior.
- Broad asynchronous/error states, SSO, platform WebAuthn ceremonies and complete text scaling were not exhaustively audited. No unsupported claim of full WCAG conformance is made.

## Recommended Actions

No unresolved confirmed fixes remain from this pass. Re-run `/impeccable audit` after future changes to shared controls, typography or minimum-width layout. The detector has deliberately not been rerun during this pass.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `/impeccable audit` after fixes to see your score improve.
