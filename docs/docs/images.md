# Light and full images

One Dockerfile builds two flavours, selected with `--target`.

| Tag | Contents | For |
| --- | --- | --- |
| `ghcr.io/buco7854/lightngx:latest` (also `:light`) | nginx plus the lightngx binary, and nothing else | Plain reverse-proxy management, smallest image |
| `ghcr.io/buco7854/lightngx:full` | Everything in light, plus the CrowdSec lua bouncer, nginx-module-vts, and the lua runtime with `lua-resty-openidc` for nginx-side auth gates | Stacks that want an in-nginx WAF, traffic stats, or OIDC and TOTP gates in front of upstreams |

There is no on/off switch for the extras. Each feature turns on from its own
required input, and on the light image those inputs simply warn and do nothing.
A misapplied variable can never break nginx.

## CrowdSec bouncer (full)

The full image compiles NDK, lua-nginx-module (with the OpenResty LuaJIT) and
nginx-module-vts against the exact nginx it ships, and installs the CrowdSec
nginx bouncer from packagecloud with a pinned GPG fingerprint. A build-time
`nginx -t` loads every module, so upstream breakage fails the build instead of
shipping silently.

The bouncer turns on when you set `CROWDSEC_LAPI_KEY`. At startup the entrypoint
links the lua modules, seeds the bouncer snippet, resolver drop-in and ban and
captcha templates, and writes `CROWDSEC_LAPI_URL` (optional) and
`CROWDSEC_LAPI_KEY` into the bouncer config. With no key, nginx runs plain. The
entrypoint only ever creates what is missing, and never overwrites a file you
have edited.

## Traffic stats with VTS (full)

The full image loads the VTS module by default, but configures nothing else for
it: no zone, no dashboard, no vhost. The module stays inert until you add a
`vhost_traffic_status_zone` and a `vhost_traffic_status_display` server to your
own config. Once you do, it serves a Lightngx-styled dashboard that is compiled
into the module by default.

:::warning Do not load VTS twice
If your config already has its own `load_module` for VTS, remove it. A duplicate
load fails `nginx -t`.
:::

You have three options for the dashboard:

- Ship the stock nginx-module-vts page instead by building with
  `--build-arg VTS_STOCK_DASHBOARD=1`.
- Bake your own at build time by placing it at `docker/vts/status.html`.
- Swap it at runtime with no rebuild: serve your own HTML at the display
  location's exact URI, and let VTS keep the `format/*` and `control`
  sub-paths. The details are in
  [docker/vts/README.md](https://github.com/buco7854/lightngx/blob/main/docker/vts/README.md).

## Auth gates in front of your upstreams (full)

The full image carries the runtime to gate any `server{}` or `location{}`
behind an OIDC or TOTP check before requests reach the proxied app:
lua-nginx-module with LuaJIT, and the whole `lua-resty-openidc` dependency tree,
on the default lua path.

The gate scripts are yours. Mount your own `*_gate.lua` and `include` it per
vhost with `rewrite_by_lua_block`, so it coexists with the CrowdSec bouncer.
Lightngx ships no gate lua and seeds nothing for it.

## Example stack

A full-image reverse proxy with the CrowdSec bouncer wired up. CrowdSec
itself (the LAPI and its database) runs alongside; Lightngx registers as a
bouncer with the key you generate. This is a trimmed version of a working
homelab stack; add a firewall bouncer, a CrowdSec dashboard or a cert
manager as you see fit.

```yaml
services:
  nginx:
    image: ghcr.io/buco7854/lightngx:full
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "127.0.0.1:9000:9000"   # management UI, reach it via a vhost or tunnel
    volumes:
      - ./nginx/conf:/etc/nginx
      - ./nginx/lightngx:/var/lib/lightngx   # keep this: users, sessions, keys
      - /var/log/nginx:/var/log/nginx
      - /etc/ssl/domains:/etc/ssl/domains:ro
    environment:
      - LN_TRUSTED_PROXIES=127.0.0.1
      - LN_SESSION_SECRET=${LN_SESSION_SECRET}
      - CROWDSEC_LAPI_URL=http://crowdsec:8080
      - CROWDSEC_LAPI_KEY=${CROWDSEC_BOUNCER_API_KEY}   # turns the bouncer on

  crowdsec:
    image: crowdsecurity/crowdsec:latest
    restart: unless-stopped
    environment:
      - COLLECTIONS=crowdsecurity/nginx crowdsecurity/http-cve crowdsecurity/appsec-virtual-patching
      - BOUNCER_KEY_nginx=${CROWDSEC_BOUNCER_API_KEY}   # auto-registers on first boot
    volumes:
      - ./crowdsec/conf:/etc/crowdsec
      - ./crowdsec/data:/var/lib/crowdsec/data
      - /var/log/nginx:/var/log/nginx:ro
    ports:
      - "127.0.0.1:8080:8080"   # LAPI, loopback only
```

Set `CROWDSEC_BOUNCER_API_KEY` to any random string in an `.env` file;
CrowdSec registers it on first boot and Lightngx uses the same value to
authenticate. Everything else about the bouncer (ban and captcha templates,
the resolver drop-in) is seeded automatically on start. See
[Configuration](./configuration.md#crowdsec-full-image) for the two CrowdSec
variables.

To automate certificates, point a cert manager (Certbot, CertWarden, acme.sh,
…) at your certificate directory and have it reload nginx through a scoped
[API key](./api-keys.md) with the `nginx:reload` scope.
