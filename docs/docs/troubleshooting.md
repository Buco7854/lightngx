# Troubleshooting

The failure modes people actually hit, with the shortest path out of each.
If yours is not here, [open an issue](https://github.com/buco7854/lightngx/issues).

## A giant Go stack dump when the container stops

A wall of `SIGQUIT: quit` followed by `goroutine … runtime.gopark` in the
container logs at shutdown is not a crash. The nginx base image declares
`STOPSIGNAL SIGQUIT`, and on images older than this fix the binary did not
handle SIGQUIT, so the Go runtime reacted with its default dump-and-exit —
noisy, but it happened while the container was stopping anyway, and no data
is affected. Update the image: lightngx now treats SIGQUIT as a normal
graceful stop (and the image declares `STOPSIGNAL SIGTERM`).

## The UI is up but nginx shows "not running"

That is the design working: in the container Lightngx supervises nginx and
stays reachable when nginx cannot start, precisely so you can repair the
config. Open the editor, run **Test** from the navbar to see the exact
error, fix it, then **Restart**. The startup error is also in
`docker compose logs nginx`.

On bare metal the same status usually means the pidfile does not match —
see the next entry.

## "nginx pidfile: no such file or directory"

Reload and restart find the nginx master through its pidfile, and
`LN_NGINX_PID` (default `/var/run/nginx.pid`) does not match where your
nginx writes it. Check the `pid` directive in `nginx.conf` (or your init
script — Alpine's OpenRC uses `/run/nginx/nginx.pid`) and set
`LN_NGINX_PID` to that path.

## "config test failed" on every save, even valid ones

`nginx -t` itself is failing, not your edit. Two usual causes on bare
metal:

- The nginx binary is not found: `LN_NGINX_BIN` defaults to the bare name
  `nginx`, and the environment Lightngx runs in has no `/usr/sbin` on its
  `PATH`. Set `LN_NGINX_BIN=/usr/sbin/nginx`.
- Lightngx runs without the privileges `nginx -t` needs (it opens the log
  and certificate files). Run it as root, like the nginx master; see
  [what it needs from the system](./without-docker.md#what-it-needs-from-the-system).

The **Test** button shows the full `nginx -t` output, which names the real
culprit.

## A save was rejected — did anything change?

No. Every write, rename, delete and toggle runs `nginx -t` first and rolls
back if it fails; the error you see is nginx's own output and the running
config is untouched. Fix the reported line and save again.

## "File changed on disk"

Someone (or something) else wrote the file between your open and your
save. The editor surfaces the conflict instead of silently clobbering the
other edit: **Overwrite** applies your version anyway, and Cancel keeps
your buffer so you can copy your change, reopen the file, and reapply it
over the latest version.

## The Sites or Streams page is empty or missing

- The directories do not exist: the pages manage the Debian
  `sites-available`/`sites-enabled` convention, which RHEL, Alpine, Arch
  and nginx.org packages do not ship. Create them (and their `include`
  lines) or turn the pages off — see
  [distros without sites-available](./without-docker.md#distros-without-sites-available).
- `LN_SITES=false` or `LN_STREAMS=false` hides them on purpose.

## You log in and immediately land back on the login page

The browser refused or dropped the session cookie. Almost always a
`Secure`-flag mismatch:

- You forced `LN_SECURE_COOKIES=always` (or `true`) but browse over plain
  HTTP — the browser will not send a Secure cookie. Use HTTPS or the
  default `auto`.
- A proxy inside `LN_TRUSTED_PROXIES` forwards `X-Forwarded-Proto: https`
  while you actually browse plain HTTP.

Also worth knowing: login and MFA are rate limited to five failures per
five minutes per IP, so after a burst of wrong passwords a *correct* one
is rejected too until the window passes.

## Everyone is logged out after a container rebuild

The data volume did not survive, so the generated session-signing key was
recreated. Keep the data directory volume mounted (the examples do), or
pin `LN_SESSION_SECRET`. Losing that volume also loses accounts and
two-factor enrollments — treat it as the thing to
[back up](./light.md#backups-and-upgrades).

## WebAuthn will not register or prompt for a key

WebAuthn needs a secure context and a stable hostname:

- HTTPS, or plain HTTP on `localhost` only.
- A hostname, not a bare IP address.
- Behind a proxy, the `Host` header must be preserved. For a stable
  identity across several hostnames, set `LN_WEBAUTHN_RPID` and
  `LN_WEBAUTHN_ORIGINS`.

## Locked out of the UI

- **A user lost their second factor:** any admin resets it (and the
  password) from the **Administration** page.
- **The only admin is locked out:** seed a fresh admin through the
  environment — set `LN_ADMIN_USER` to a *new* username with a matching
  `LN_ADMIN_PASSWORD_HASH` (generated with `lightngx hash`) and restart.
  The account is created alongside the existing ones; log in with it,
  repair the locked account, then remove the variables.
- **Last resort:** deleting the database file in the data directory
  brings back the first-run setup page. All accounts and API keys are
  lost; the nginx config is not touched.

## The live log view stalls or arrives in bursts

A proxy in front is buffering the server-sent events stream. Set
`proxy_buffering off;` on the location proxying Lightngx (the bundled
example vhosts already do). Lightngx also sends `X-Accel-Buffering: no`,
which well-behaved nginx proxies honor on their own.

## The log page shows no files

- In the container with `LN_DOCKER_LOGS=true`, the base image's
  stdout/stderr symlinks are kept, and the viewer cannot read those —
  that trade-off is the point of the flag.
- The paths in `LN_LOG_PATHS` (default `/var/log/nginx`) do not exist or
  are not readable by Lightngx. Symlinked log files are ignored by
  design.

## An API key gets 401 or 403

Keys are confined to nginx operations and each key holds a subset of the
`nginx:status`, `nginx:test`, `nginx:reload` and `nginx:restart` scopes —
a 403 means the key lacks the scope for that endpoint. Config editing,
logs and account management never accept keys, only sessions. Check the
key was sent as `Authorization: Bearer lngx_…` or `X-API-Key`, unmodified.
