# Development

Build the frontend, then the binary, then run the tests.

```sh
cd web/app && npm ci && npm run build   # frontend -> web/dist (embedded)
go build ./cmd/lightngx                 # single binary
go test ./...
```

`npm run dev` in `web/app` proxies `/api` to `127.0.0.1:9000` for live frontend
work. The committed `web/dist/index.html` is a placeholder so `go build` works
before the first frontend build. Do not commit build output over it.

## Docker images

```sh
docker build --target light -t lightngx .     # light
docker build --target full  -t lightngx:full . # full
```

Always pass a `--target`: the full stage is the last one in the Dockerfile,
so a bare `docker build .` produces the full image, not the light one.

## These docs

The documentation site is a Docusaurus project under `docs/`.

```sh
cd docs
npm ci
npm run start   # local preview with hot reload
npm run build   # static output in docs/build
```

Any push to `main` that touches `docs/` is published to GitHub Pages by the
`docs` workflow.

:::tip Custom domain
To serve the docs on your own domain, add `docs/static/CNAME` containing
just the domain (for example `lightngx.example.com`), and set the environment
variable `DOCS_BASE_URL="/"` for the build. The default base path assumes the
GitHub project page at `/lightngx/`.
:::

## Dependency security checks

Use Go 1.27.3 or newer and Node 22.15 or newer. Run the dependency checks alongside
builds and tests:

```sh
go run golang.org/x/vuln/cmd/govulncheck@latest ./...
(cd web/app && npm audit)
(cd docs && npm audit)
```

The documentation project's overrides keep `serialize-javascript`, `tinypool`,
`qs`, and `uuid` on patched versions. Keep the official Docusaurus packages on
the same exact version, and verify both `build` and `serve` when changing them.

As of November 2026, the docs toolchain still reports two underlying advisories:
[`minimatch`](https://github.com/advisories/GHSA-g3hv-75wg-m249) through Docusaurus's `serve-handler` (moderate glob denial of service)
and [`deepmerge`](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) through SVGR (low prototype poisoning). There is no compatible
patched dependency release in those chains. Forcing the newer minimatch major
breaks `serve-handler`'s callable API. These dependencies are used to build or
preview trusted documentation; they are absent from the Lightngx frontend bundle,
Go binary, and runtime images. Do not expose the docs preview server publicly or
build untrusted documentation/configuration. Track upstream patches instead of
suppressing these audit results. `npm audit` may also list affected parent
packages, so its total is larger than two.

The stable `golang.org/x/crypto` release also retains a module-level advisory for
its unused, deprecated `openpgp` package. Lightngx does not import it;
`govulncheck` reports no affected imported packages or reachable symbols.
