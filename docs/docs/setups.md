# Choosing a setup

Lightngx runs three ways. Start light and add the next layer only when you need
it; each builds on the one before.

| Setup | Image | Adds | Pick it when |
| --- | --- | --- | --- |
| [Light](./getting-started.md) | `:latest` (`:light`) | nginx plus the Lightngx UI, nothing else | Most setups. Smallest image, plain reverse-proxy management |
| [Full](./images.md) | `:full` | An in-nginx CrowdSec WAF bouncer, traffic stats (VTS), and the lua runtime (`lua-resty-openidc`) for nginx-side auth gates | You want a WAF, traffic stats, or OIDC/TOTP gates in front of upstreams |
| [Hardened](./hardened.md) | `:full` plus a gate | Everything in full, plus an nginx-level OIDC/TOTP gate in front of the Lightngx login itself | You expose the UI to the internet and want a wall before the app |

## What the full image adds

The full image is built from one Dockerfile with `--target full`. There is no
on/off switch for the extras: each turns on from its own required input, and on
the light image those inputs simply warn and do nothing, so a misapplied
variable can never break nginx.

- **CrowdSec bouncer** — an in-nginx WAF that bans bad actors at the edge. Turns
  on when you set `CROWDSEC_LAPI_KEY`.
- **Traffic stats (VTS)** — a per-host dashboard. The module loads but stays
  inert until you add a `vhost_traffic_status_zone` and a display vhost.
- **Auth-gate runtime** — lua-nginx-module with the whole `lua-resty-openidc`
  dependency tree on the lua path, so a `rewrite_by_lua_block` gate works with no
  extra wiring.

The [Full setup](./images.md) wires up CrowdSec and shows the VTS and gate
extras. The [Hardened setup](./hardened.md) uses that gate runtime to put an
OIDC/TOTP check in front of the Lightngx UI itself.

## Not using Docker?

The binary is a single static file with the frontend embedded; see [Running
without Docker](./without-docker.md).
