---
sidebar_position: 9
---

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
docker build -t lightngx .                    # light (default)
docker build --target full -t lightngx:full . # full
```

## These docs

The documentation site is a Docusaurus project under `website/`.

```sh
cd website
npm ci
npm run start   # local preview with hot reload
npm run build   # static output in website/build
```

A push to `main` that touches `website/`, and it publishes to GitHub Pages
through the `docs` workflow.

:::tip Custom domain
To serve the docs on your own domain, add `website/static/CNAME` containing
just the domain (for example `lightngx.example.com`), and set the environment
variable `DOCS_BASE_URL="/"` for the build. The default base path assumes the
GitHub project page at `/lightngx/`.
:::
