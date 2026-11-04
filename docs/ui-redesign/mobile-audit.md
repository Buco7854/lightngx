# Independent mobile refinement audit

Audit date: 2026-11-04. Scope: current Lightngx filter sheets, nested tag management, Profile sessions, populated users/API keys, logs controls and editor controls. Read-only audit; no source or git mutations. The current Operate direction in `/workspace/lightngx/DESIGN.md` was preserved.

## Implementation integrity verdict

**Pass with one P2 responsive correction.** The new filters present one focused mobile task with status fields, full-width include/exclude fields and a persistent Reset/results footer. Session metadata wraps within its grid track, including full-length IPv6 addresses and long browser/OS labels. No systemic design drift was found. The single Impeccable source detector run returned `[]`, exit 0; saved in `detector.json`.

## Scope health

These scores apply only to the inspected surfaces. This was a responsive audit, not a performance benchmark or a complete accessibility certification.

| Dimension | Score | Evidence |
|---|---:|---|
| Accessibility | 3/4 | Four axe WCAG A/AA scans of the French dark filter and nested tag dialogs returned no violations; focus return and touch activation inspected. Physical-device and full assistive-technology testing not performed. |
| Performance | 3/4 | No browser exceptions across the completed matrix; no performance trace collected. |
| Theming | 4/4 | Light/dark inspected at both widths and languages; controls, status and dialog hierarchy remain coherent. |
| Responsive | 3/4 | Core reported faults fixed. One French 320px tag-management search field collapses internally. |
| Implementation integrity | 4/4 | Detector clean; semantic tokens and the established product system remain coherent. |
| **Total** | **17/20** | **Good, within focused scope** |

## Confirmed finding

### [P2] French tag management leaves no visible search text at 320px

- **Location:** `/workspace/lightngx/web/app/src/components/tags/TagWorkspace.tsx:255`; shared search input padding at `/workspace/lightngx/web/app/src/ui.tsx:375`.
- **Category:** Responsive design.
- **Reproduction:** At a 320px viewport, choose French, open Sites → Filtres → Gérer les étiquettes, then enter `Production` in the search field. Reproduced in both themes and with a 20-tag catalogue.
- **Measured evidence:** Search wrapper `clientWidth=66`, `scrollWidth=74`; input width `74px`, left/right padding `36px` each, border `2px` total. The usable text area is **0px**. The input value contains `Production`, but the screenshot displays only the search and clear icons. The sibling `Nouvelle étiquette` action consumes the remainder of the nonwrapping toolbar.
- **Impact:** Users can filter the catalogue but cannot read the query they entered or see the search placeholder. It is easy to mistake the field for an icon button. This is contained internal overflow, even though document width remains correct.
- **Evidence:** `search-proof.png`, `search-proof.json`, `independent-manage-tags-320-fr-light.png`, `independent-manage-tags-320-fr-dark.png`, `independent-stress-nested-many-tags-320.png`.
- **Recommendation:** Let this toolbar wrap or stack at narrow content widths, retaining a useful full-width search field and the existing new-tag action. Adding overflow clipping would preserve the unusable zero-width text area.
- **Suggested command:** `/impeccable adapt`, followed by `/impeccable polish` after verifying the correction.
- **Severity counts:** P0: 0; P1: 0; P2: 1; P3: 0.

## Verified working behavior

- **Filter sheet:** Sites, Streams and Configuration filters tested at 320×740 and 390×740, English/French, light/dark. Status and tag menus open within the viewport; selections remain in the sheet and update the URL/results. French Reset/results labels fit in the final layout.
- **Selected-tag stress case:** Twelve selected tags from a 20-tag catalogue at 320×568 and 390×568 in French dark. The sheet body scrolls while its footer remains available. Reset clears the filter query parameters.
- **Touch evidence:** Chromium mobile emulation with `hasTouch`, real Playwright touchscreen taps, and CDP-synthesized touch movement. On the short sheets, a vertical touch gesture changed body scrollTop from 0→265 at 320px and 0→338 at 390px. This verifies synthesized Chromium touch behavior, not iOS Safari or physical hardware.
- **Nested tag management:** Manual/smart tag lists and smart-rule menus fit; Escape from menus preserves the containing dialog. Closing tag management returns focus to its original Manage tags trigger.
- **Profile:** Current and revocable sessions with long IPv6 addresses, long browser/OS names, dates and localized labels stay inside the cards. Device metadata wraps and Revoke remains visible.
- **Populated access settings:** A valid 64-character username, MFA states, role menu, long API-key names, four granted scopes, timestamps and a security key remain within their rows/cards.
- **Logs/editor:** Log file menu and toolbar, expanded editor settings/actions and code area inspected at both widths in all language/theme combinations. No additional confirmed responsive defect.
- **Errors:** No page exceptions recorded in any of the eight completed combinations.

## Evidence and checks

- Test matrix: `independent-audit.cjs`, results `independent-results.json` — 232 measured layout states plus eight browser-error summaries across the eight viewport/language/theme combinations.
- Short-screen/catalogue/touch/accessibility checks: `independent-stress.cjs`, results `independent-stress.json`.
- Typed-query reproduction: `search-proof.cjs`, `search-proof.json`, `search-proof.png`.
- Detector: `detector.json` — one source scan of `web/app/src`, `[]`, exit 0.
- Screenshots: `independent-*.png` and `independent-stress-*.png` in this directory.

Every layout scan measured descendant `scrollWidth/clientWidth` and controls against clipping ancestors, alongside document overflow. The document did not overflow in the completed matrix. Expected screen-reader-only one-pixel nodes, intentionally truncated text and Configuration's explicitly horizontally scrollable breadcrumb were reviewed as false positives, not reported as defects.

A shared fixture-backend outage interrupted the preliminary run; it was not classified as a product fault. The entire matrix was rerun after the parent restored the backend and froze UI edits. This report uses the completed final matrix.

## Next action

Apply `/impeccable adapt` to the narrow tag-management toolbar, verify French 320px with a populated query, then finish with `/impeccable polish`. Re-run the targeted responsive check after that correction. No unrelated visual changes are indicated by this audit.

## Fix verification — 2026-11-04

**The sole P2 finding is resolved.** Rechecked only the French 320px text-entry reproduction in both light and dark, through Sites → Filtres → Gérer les étiquettes, using touchscreen taps and a populated `Production` query.

- Search field now has a **172px usable text area**, compared with 0px before; the typed query is visible in both screenshots.
- Search and `Nouvelle étiquette` action occupy separate grid rows and measure **44px** high.
- Search wrapper has no internal horizontal overflow; the visible nested dialog has no unexpected descendant overflow and document width remains 320px.
- The catalogue filters correctly to Production. No page exceptions were recorded.
- Work sheet and nested modal foregrounds both resolve to `rgb(27, 41, 34)` in light and `rgb(237, 237, 237)` in dark; the settled screenshots show readable text in both themes. This verifies the resulting theme presentation, not a cold-load first-paint filmstrip.
- No detector rerun was performed.

Current severity counts: **P0: 0; P1: 0; P2: 0; P3: 0.** Responsive score improves from 3/4 to **4/4**. The focused scope health score is now **18/20 (Excellent)**; the other dimensions and verification limits are unchanged.

Verification artifacts: `search-fix-verification.cjs`, `search-fix-verification.json`, `search-fix-light-320-fr.png`, `search-fix-dark-320-fr.png`. Original failure evidence is preserved above and in `search-proof.*`.
