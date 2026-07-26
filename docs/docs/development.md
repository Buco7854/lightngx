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
