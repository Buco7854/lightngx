# Security

Lightngx manages nginx configuration and processes. Every account with editing
access is a trusted server operator, including the `user` role; this is not a
multi-tenant hosting panel. Public access requires HTTPS and a deliberate
authentication and proxy configuration.

- State-changing requests require a same-origin `Origin` or `Sec-Fetch-Site`
  header, which blocks cross-site request forgery. Sessions are HMAC-signed,
  HttpOnly cookies. Authentication attempts reserve their rate-limit allowance
  before verification: at most five per IP per five minutes, with an additional
  per-account limit for password and TOTP attempts. Successful verification
  resets its allowance. Sensitive actions are written to an audit log with the
  user and IP.
- Security headers are strict: a Content-Security-Policy of `default-src
  'self'`, `frame-ancestors 'none'`, nosniff, and a no-referrer policy.
- The editor is confined to the config directory. Both lexical path traversal
  and symlink escapes are blocked. Log access is limited to the configured
  paths, and to regular files only.
- Config mutations are serialized server-side, so concurrent saves never test
  or roll back against each other's half-applied changes. Saving a file that
  changed since you opened it returns a conflict the editor surfaces, rather
  than silently overwriting the other edit; your buffer is kept either way.
- Passwords use bcrypt at cost 12. A login that still owes a second factor gets
  a partial session that unlocks only the MFA endpoints. TOTP secrets are
  encrypted with AES-GCM at rest. WebAuthn uses the audited `go-webauthn`
  library with sign-counter checks and server-stored, single-use challenges
  that expire after five minutes. Completing MFA rotates the session ID; copied
  partial-session cookies remain invalid. Stale enrollment sessions cannot
  replace an established second factor. The last admin cannot be demoted or
  deleted.
- API responses use `Cache-Control: no-store`. Request bodies have size and read
  time limits, including WebAuthn uploads. Live log streams recheck session
  validity before sending each frame and enforce a write deadline, so revoked
  or expired local sessions stop receiving new log data.
- First-run setup requires a server-held token from `<LN_DATA_DIR>/setup-token`.
  It is never returned by a public API and becomes unusable once an admin exists.
- OIDC uses PKCE, nonce validation, and expiring single-use server-side state.
  Sessions are registered server-side, so logout revokes copied OIDC cookies.
  Local password and MFA changes revoke other sessions and remembered devices
  atomically. A login started before a reset cannot create a session afterward.
- MFA policy is checked on active local sessions. Authentication-factor changes
  require recent sign-in/password confirmation. Password verification and OIDC
  exchanges have separate concurrency bounds to limit resource exhaustion.
- CSRF checks compare scheme, host, and port. Forwarded transport/client headers
  are trusted only from loopback nginx or configured proxies. Existing invalid
  or unreadable key files stop startup instead of being silently overwritten.

## Recommended front proxy

Terminate TLS at the proxy with HTTP/2, and forward to
`http://127.0.0.1:9000`. Loopback is trusted by default. For a separate proxy,
set `LN_TRUSTED_PROXIES` to its address so forwarded client IPs are trusted; on a separate (non-loopback) proxy this also
lets the default `auto` cookie policy see the HTTPS scheme and set `Secure`.
Force it with `LN_SECURE_COOKIES=true` if you prefer.

The live log stream is server-sent events, so the proxy must not buffer it. Set
`proxy_buffering off;`. The app also sends `X-Accel-Buffering: no` as a second
line of defense.

If you copied an older UI proxy example, replace its unconditional
`$http_x_forwarded_proto`/`$http_x_forwarded_host` maps with the updated edge
configuration. The shipped templates overwrite those headers using `$scheme`
and preserve the request authority with `$http_host`. Existing bind-mounted
nginx configuration is deliberately not overwritten by an image upgrade. A
separate TLS terminator needs a dedicated, restricted internal proxy setup.

## Exposing it to the internet

Before publishing the UI:

- Terminate HTTPS at the reverse proxy and redirect plain HTTP to HTTPS. Bind
  the upstream UI port to loopback or keep it on an internal container network.
  The bundled loopback nginx proxy is trusted automatically; list separate
  proxy addresses explicitly in `LN_TRUSTED_PROXIES`. Overwrite forwarded headers
  at the edge instead of trusting headers supplied by external clients.
- Set `LN_SECURE_COOKIES=true` for a public HTTPS deployment and pin
  `LN_WEBAUTHN_RPID` and `LN_WEBAUTHN_ORIGINS` to the public hostname/origin.
- Set `LN_MFA_REQUIRED_ROLES=admin,user` for local accounts. If using OIDC, enforce
  MFA at the identity provider and set `LN_OIDC_ALLOWED_GROUPS` to trusted
  operators; an empty allow-list permits any authenticated identity at that
  provider to edit configuration. Keep the admin-group mapping narrow.
- Complete setup with the server-held token, or pre-seed a strong admin password
  hash. Protect and persist the data directory and encryption keys. Keep it
  outside the configuration directory and all web-served roots.
- Limit incoming connections and requests at the edge, and monitor the audit
  log. In-process throttles and concurrency/body/time limits are not a substitute
  for network-level denial-of-service protection. Keep runtime/base images current.

The [hardened setup](./hardened.md) adds another authentication layer before the
UI: an OIDC gate (with a TOTP fallback) or a standalone TOTP gate. Its files are in
[`example/hardened/`](https://github.com/buco7854/lightngx/tree/main/example/hardened).

The implementation review follows the relevant OWASP guidance on
[authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
[session revocation](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
and [origin verification](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
Regression tests and dependency scans check specific failure modes. They do not
constitute an independent penetration test or guarantee against every attack.
