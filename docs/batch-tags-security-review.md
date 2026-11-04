# Batch tags and authentication hardening

This change keeps the existing Lightngx workspace, typography, colors, and shared
controls. Sites, Streams, and Configuration now answer the same selection
question: which files will this action affect? Page selection is separate from
the explicit selection of up to 200 matching files. The tag dialog applies an
add/remove delta, shows coverage, and offers manual-tag creation in context.

Bulk writes validate every canonical file and tag before applying one SQLite
transaction. Coverage queries use the path index and only inspect the selected
files' metadata. Smart tags are never assignable; unrelated manual labels remain
intact. Internal aliases are counted once. Failed writes preserve selection and
can be retried idempotently.

## Verification

- Go vet and the complete race test suite pass. Regression tests cover atomic
  batch rollback, label preservation, aliases, confinement, bounds, authentication,
  CSRF, one-use WebAuthn challenges, expiry, MFA session rotation, TOTP replay and
  throttling, stale enrollment, bounded concurrent rate limiting, oversized
  uploads, and revocation during an active log stream.
- The frontend production build passes; its dependency audit has no findings.
  The Go vulnerability scan has no module, package, or symbol findings after
  pinning the upstream OpenPGP-removal revision of `x/crypto`. Existing docs-only
  low/moderate advisories remain described in the development guide.
- Playwright against the embedded production frontend checked add/remove,
  preservation, coverage, smart-tag exclusion, staged inline creation, failure
  recovery, Config integration, page selection, explicit matching selection,
  the 200-file bound, filter reset, keyboard containment, and focus restoration.
- Rendered review covered 1440, 768, 390, and 320 CSS pixels, English and French,
  light and dark. Axe scans of the new dialog passed in both languages and
  themes. Screenshots led to shorter operation tabs, an icon menu on phones,
  stacked coverage labels on narrow screens, and a wrapping creation form and
  footer. The existing shared modal, segmented control, dropdown, search,
  checkbox, button, and input components are reused.

The app-screen inspector was run on a static capture of the authenticated
dialog, with fonts and CSS embedded because it does not support authenticated
sessions. Its overlay-shadow and covered-background-text checks were allowed
for the open modal; its example-domain check was allowed for the temporary nginx
fixtures. Small text is limited to metadata, coverage, and hints. These fixture
configs and captures are not shipped. No new visual direction or sample product
data was introduced. Physical authenticators, screen readers, real nginx reloads,
and production identity providers were not exercised by these fixture checks.
