import CodeBlock from "@theme/CodeBlock";
import fullCompose from "!!raw-loader!@site/../example/full/docker-compose.yml";
import fullEnv from "!!raw-loader!@site/../example/full/.env.example";
import vtsVhost from "!!raw-loader!@site/../example/full/conf.d/20-vhost-traffic-status.conf";
import crowdsecLocal from "!!raw-loader!@site/../example/full/crowdsec/conf/config.yaml.local";

# Full setup

The full image is the [light setup](./getting-started.md) plus three extras
built into one image: an in-nginx CrowdSec WAF bouncer, traffic stats (VTS), and
the lua runtime for nginx-side auth gates. [Choosing a setup](./setups.md)
compares the three flavours. In a hurry, jump to the
[one-shot script](#one-shot-setup).

This page wires up a full-image reverse proxy with the CrowdSec bouncer:
CrowdSec (the LAPI and its Postgres database) runs alongside, and Lightngx
registers as a bouncer with a key you generate. It is a trimmed working homelab
stack; add a firewall bouncer, a CrowdSec dashboard or a cert manager as you see
fit.

## Set up the stack

Save this as `docker-compose.yml` in an empty directory:

<CodeBlock language="yaml" title="docker-compose.yml">{fullCompose}</CodeBlock>

Save this as `.env` beside it and set the two required secrets (the bouncer key
is any random string, shared with CrowdSec):

<CodeBlock language="ini" title=".env">{fullEnv}</CodeBlock>

CrowdSec reads its database connection from a mounted `config.yaml.local` (the
image has no `DB_*` env, so without it CrowdSec silently uses SQLite and ignores
the Postgres service). Save this as `crowdsec/conf/config.yaml.local`; it takes
the credentials from the same `.env`:

<CodeBlock language="yaml" title="crowdsec/conf/config.yaml.local">{crowdsecLocal}</CodeBlock>

Then start it:

```sh
docker compose up -d
```

Open the UI the same way as the [light setup](./getting-started.md#reaching-the-ui-from-another-machine).
[Configuration](./configuration.md) is the full variable list.

## CrowdSec bouncer

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

## Traffic stats with VTS

The full image loads the VTS module by default, but configures nothing else for
it: no zone, no dashboard, no vhost. The module stays inert until you add a
`vhost_traffic_status_zone` and a `vhost_traffic_status_display` server to your
own config. Once you do, it serves a Lightngx-styled dashboard that is compiled
into the module by default.

Save this as `nginx/conf/conf.d/20-vhost-traffic-status.conf`, then uncomment the
matching `127.0.0.1:9113:9113` port bind in the compose to reach the page at
`http://127.0.0.1:9113/status`:

<CodeBlock language="nginx" title="nginx/conf/conf.d/20-vhost-traffic-status.conf">{vtsVhost}</CodeBlock>

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

## Auth gates in front of your upstreams

The full image carries the runtime to gate any `server{}` or `location{}`
behind an OIDC or TOTP check before requests reach the proxied app:
lua-nginx-module with LuaJIT, and the whole `lua-resty-openidc` dependency tree,
on the default lua path. lua loads by default on the full image (like VTS), so
a `rewrite_by_lua_block` gate works with no CrowdSec and no extra module wiring;
it stays inert until you add one.

The gate scripts are yours. Mount your own `*_gate.lua` and `include` it per
vhost with `rewrite_by_lua_block`, so it coexists with the CrowdSec bouncer.
The [hardened setup](./hardened.md) is a complete, ready-to-run example of
exactly this: an OIDC gate with a TOTP fallback (and a standalone TOTP gate)
put in front of the Lightngx UI itself.

## One-shot setup

Prefer to skip the steps? This copies the full stack into `./lightngx`,
generates the secrets, starts it, and leaves nothing else behind:

```sh
tmp=$(mktemp -d)
git clone --depth 1 https://github.com/buco7854/lightngx "$tmp"
mkdir -p lightngx && cp -a "$tmp/example/full/." ./lightngx/ && rm -rf "$tmp"
cd lightngx
{ echo "CROWDSEC_BOUNCER_KEY=$(openssl rand -hex 16)"
  echo "CROWDSEC_DB_PASSWORD=$(openssl rand -hex 16)"
  echo "LN_SESSION_SECRET=$(openssl rand -hex 32)"; } > .env
docker compose up -d
```

To automate certificates, point a cert manager (Certbot, CertWarden, acme.sh,
…) at your certificate directory and have it reload nginx through a scoped
[API key](./api-keys.md) with the `nginx:reload` scope.
