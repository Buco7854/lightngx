# Tag picker and internet-facing security review

The existing Lightngx workspace and shared controls are retained. File and batch
assignment share one searchable multi-select and removable label chips. Batch
edits stage additions and removals together, preview their effects, support
individual undo, and save in one transaction. Creation reuses the existing tag
form; a new batch label is assigned only after Apply changes. The shared modal
now portals consistently so a nested discard/password dialog is visible and
focused above its caller. Password prompts preserve whitespace and have linked
labels. Smart tags remain rule-driven.

## Security scope and fixes

The review covered the public authentication endpoints, cookie/session lifecycle,
MFA setup/removal and policy, authorization boundaries, proxy/origin handling,
file/log confinement, and dependencies. It produced these concrete changes:

- First-admin setup requires a server-held token, rather than allowing the first
  public visitor to claim an uninitialized instance. The private token is removed
  after setup and is never returned through a public API.
- OIDC state is single-use server-side, including failed exchanges. OIDC sessions
  have a revocation registry, so logout invalidates copied cookies. Existing
  stateless OIDC cookies require a fresh login after this upgrade.
- Password/reset changes and session/trusted-device revocation are atomic.
  Credential versions reject a login decision that was computed before a reset.
  Combined admin role/password edits roll back together on storage failure.
- MFA enrollment/removal revokes other devices atomically. Required MFA is checked
  on active sessions, including after role/policy changes. Modifying factors from
  a full session requires recent authentication or password confirmation.
- Password checks, public passkey work, and OIDC exchanges have bounded, separate
  concurrency. WebAuthn verification and counter writes serialize with factor
  changes; uploads are read within limits before taking the MFA lock.
- Origin checks include scheme, host and port. WebAuthn and cookies use transport
  metadata only from trusted hops. Client-IP extraction trusts bundled loopback
  nginx and explicit proxies, then walks the chain from the right. Edge templates
  overwrite client-supplied forwarding headers. Previously copied templates need
  the corresponding manual update; existing nginx files are preserved on upgrade.
- Invalid/unreadable persistent keys stop startup instead of being overwritten.
  Application JSON decoding rejects trailing values. Anonymous/partial sessions and nginx API
  keys remain barred from configuration, log and account APIs.

## Verification

Go vet, the complete race suite, frontend and docs builds pass. Go vulnerability
checks and the frontend audit have no findings. Existing docs-only low/moderate
advisories remain documented in the development guide.

Regression tests cover setup-token enforcement, authorization matrices, copied
OIDC cookies after logout, OAuth state replay, proxy spoofing and scheme mismatch,
MFA policy on active sessions, recent-auth requirements, concurrent authenticator
counter reuse, stale login after reset, transactional failure during revocation,
combined account-update rollback, corrupt keys, and mixed tag-delta rollback.
Earlier replay, CSRF, confinement, body-limit, batch-bound and live-stream
revocation tests remain in the suite.

Playwright against the embedded production frontend checked partial label states,
mixed edits, per-label undo, creation staging, discard confirmation and recovery,
failed-save retry, shared single-file assignment/editing, keyboard navigation,
focus, and axe scans. A fresh instance exercised invalid/valid setup tokens,
required TOTP enrollment, partial-cookie invalidation, and recent-password
confirmation (including passwords with surrounding whitespace and wrong-password
retry). Existing negative-rule workflows also passed. Rendered reviews covered
1440, 768, 390 and 320 CSS pixels, English/French and light/dark, including open
pickers and creation forms. Temporary nginx fixtures and captures are not shipped.

The app-screen inspector uses a static authenticated capture with embedded CSS
and fonts. Overlay shadows/covered background text are appropriate to a modal;
example domains belong to temporary fixtures. Small metadata text follows the
existing workspace scale. No new visual direction or sample product data was
introduced.

This is an implementation review with regression tests, not an independent
penetration test. Real identity-provider integration, physical authenticators,
screen readers, live nginx TLS/reload, and network-level denial-of-service tests
were not exercised. Every editing account is a trusted nginx operator. Public
exposure requires the HTTPS, proxy, MFA/SSO-group and data-directory settings in
the security guide; provider-side claim changes take effect on new login/expiry.
