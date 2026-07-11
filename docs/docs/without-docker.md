# Running without Docker

The binary is fully static (pure-Go SQLite, `CGO_ENABLED=0`), so it runs on
any Linux box next to your existing nginx: no container runtime, no shared
libraries, no database server.

:::warning An honest caveat
I run Lightngx in its container, so this bare-metal path has not seen real
production use yet. Everything below is how it is designed to work and it
should work. But if something misbehaves, please
[open an issue](https://github.com/buco7854/lightngx/issues) so it can be
fixed.
:::

What you give up compared to the images: the [full image's](./full.md)
extras (CrowdSec bouncer, VTS traffic stats, the lua runtime for auth
gates) are built into that image's nginx and do not apply to your distro's
nginx, and there is no baked-in supervision or logrotate wiring: your
init system and the distro's logrotate keep those jobs.

## Build the binary

There are no prebuilt release binaries yet, so build from source. You need
Go 1.25+ and Node 22+ once, on any machine (cross-compiling for another
architecture works, e.g. `GOARCH=arm64`):

```sh
git clone https://github.com/buco7854/lightngx
cd lightngx
(cd web/app && npm ci && npm run build)   # frontend -> web/dist (embedded)
CGO_ENABLED=0 go build -trimpath \
    -ldflags "-X main.version=$(git describe --tags --always)" ./cmd/lightngx
```

Copy the resulting `lightngx` binary to the server, for example to
`/usr/local/bin/lightngx`. It embeds everything; nothing else needs to be
deployed. `lightngx version` on the server confirms what you shipped.

## What it needs from the system

Lightngx drives nginx the way an admin at a shell would, so it needs what
that admin has:

- **The nginx binary.** `LN_NGINX_BIN` defaults to the bare name `nginx`,
  resolved from `PATH`. systemd units include `/usr/sbin`, so the unit
  below finds it; an interactive `sudo lightngx` often does not — set
  `LN_NGINX_BIN=/usr/sbin/nginx` if you see *executable file not found*.
- **Read-write access to the config**, `/etc/nginx` by default
  (`LN_NGINX_CONF_DIR`). The editor is confined to this directory.
- **Read access to the logs**, `/var/log/nginx` by default
  (`LN_LOG_PATHS`) — root-owned and group `adm` on Debian.
- **Permission to signal the nginx master** found through its pidfile
  (`LN_NGINX_PID`, default `/var/run/nginx.pid`). A stock install runs the
  master as root, and only root may signal a root process.

In practice that means **running Lightngx as root**, just like the nginx
master itself; the systemd sandboxing below is the way to narrow the blast
radius. Running it as an unprivileged user only works when nginx itself
(master included) runs unprivileged as that same user.

The data directory (`LN_DATA_DIR`, default `/var/lib/lightngx`) is created
on first start with mode 0700. It holds the SQLite database and the
generated session-signing and encryption keys — the one directory worth
backing up.

:::note SELinux and AppArmor
On an SELinux-enforcing system (RHEL family), a service that writes
`/etc/nginx` and signals nginx may be denied by the active policy; check
`ausearch -m avc -ts recent` if actions fail with permission errors that
plain `ls -l` cannot explain, and label or adjust per your policy. This
path is untested — reports welcome.
:::

## First run

Generate a password hash for the first admin (or skip seeding entirely and
use the first-run setup page in the browser):

```sh
lightngx hash    # prompts for a password, prints a bcrypt hash
```

Then start it. On a stock Debian or Ubuntu nginx the defaults already
match, so this is often enough:

```sh
sudo env PATH="$PATH:/usr/sbin" \
     LN_ADMIN_USER=admin \
     LN_ADMIN_PASSWORD_HASH='<hash from above>' \
     lightngx
```

Without `LN_LISTEN` the UI answers on `:9000` on **all interfaces** — fine
for a first login from the LAN, not for staying that way. The systemd unit
below binds it to `127.0.0.1` and leaves reaching it to a front proxy, as
described in [the light setup](./light.md#running-behind-a-front-proxy);
the same proxy snippet works verbatim on bare metal. The
[Configuration](./configuration.md) page lists every variable if your
nginx lives somewhere else.

## A systemd unit

```ini
[Unit]
Description=Lightngx nginx web UI
After=network.target nginx.service

[Service]
ExecStart=/usr/local/bin/lightngx
Environment=LN_LISTEN=127.0.0.1:9000
# Environment=LN_ADMIN_USER=admin
# Environment=LN_ADMIN_PASSWORD_HASH=...
Restart=on-failure

# Optional sandboxing. ProtectSystem=full makes /usr and /etc read-only,
# so the config dir must be granted back; everything under /var (the data
# dir, the logs) stays writable. Extend ReadWritePaths if you move
# LN_NGINX_CONF_DIR, LN_DATA_DIR or the certificates somewhere protected.
ProtectSystem=full
ReadWritePaths=/etc/nginx
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Save as `/etc/systemd/system/lightngx.service`, then
`systemctl enable --now lightngx`.

`lightngx health` probes the UI (it honors `LN_LISTEN`) and exits non-zero
when it does not answer, so it slots straight into any monitoring that can
run a command.

## Reload and restart semantics

Leave `LN_SUPERVISE` at its default `false` when systemd manages nginx.
In this mode:

- **Test** and **Reload** work exactly as in the container: `nginx -t`,
  then SIGHUP to the master process from the pidfile.
- **Restart** sends SIGQUIT to the master and expects the service manager
  to bring nginx back. A stock `nginx.service` does not restart after a
  clean quit, so either stick to Reload (which covers config changes), or
  add a drop-in so systemd respawns it:

```ini
# /etc/systemd/system/nginx.service.d/restart.conf
[Service]
Restart=always
RestartSec=2
```

Alternatively set `LN_SUPERVISE=true` and let Lightngx run nginx as its
own supervised child, like the container does. Then disable
`nginx.service` so the two do not fight over the master process, and set
`LN_LOGROTATE=false` on a distro that ships `/etc/logrotate.d/nginx`:
supervised mode runs that policy on its own hourly timer, which is
redundant next to the distro's logrotate timer.

## Distros without `sites-available`

The Sites and Streams pages manage the Debian symlink convention. RHEL,
Fedora, Alpine, Arch and the nginx.org packages do not ship it — their
nginx only includes `conf.d/*.conf`. Two options:

**Adopt the layout.** Create the directories and include them from
`nginx.conf`:

```sh
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled \
              /etc/nginx/streams-available /etc/nginx/streams-enabled
```

```nginx
http {
    # ...
    include /etc/nginx/sites-enabled/*;
}
stream {
    include /etc/nginx/streams-enabled/*;
}
```

**Or turn the pages off.** Set `LN_SITES=false` and `LN_STREAMS=false`;
the editor, logs and nginx controls do not depend on them.

Two more distro defaults worth checking:

- **Pidfile.** If your nginx uses another `pid` path (Alpine's OpenRC
  service uses `/run/nginx/nginx.pid`), set `LN_NGINX_PID` to match —
  reload and restart find the master through it. `grep pid
  /etc/nginx/nginx.conf` or the init script tells you.
- **Config ownership.** `LN_FIX_CONFIG_PERMS` defaults to `true`, so files
  the UI creates or renames are chowned to the nginx worker user
  (`www-data` on Debian). On a hand-managed box where you prefer your own
  ownership scheme, set it to `false`.

## Upgrades and backups

To upgrade, build the new version, replace the binary and restart the
unit; the database schema migrates itself on start:

```sh
sudo install lightngx /usr/local/bin/lightngx && sudo systemctl restart lightngx
```

Back up the data directory (`/var/lib/lightngx`: accounts, API keys,
settings, session and encryption keys) along with `/etc/nginx`, which your
existing backups likely cover already. Both are plain files.

If something misbehaves, [Troubleshooting](./troubleshooting.md) covers
the common failure modes — several of them specific to bare metal.
