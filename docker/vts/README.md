# Custom VTS dashboard (build-time override slot)

The VTS status page is compiled into the module. The `full` image bakes our
**Lightngx-styled** dashboard by default (from the tracked
`docker/vts-dashboard.html`).

To override it with your own dashboard, drop a `status.html` in THIS
directory before building — it takes precedence:

```sh
cp my-dashboard.html docker/vts/status.html
docker build --target full -t lightngx:full .
```

To ship nginx-module-vts's plain stock page instead:

```sh
docker build --target full --build-arg VTS_STOCK_DASHBOARD=1 -t lightngx:full .
```

The full image loads the VTS module by default (the entrypoint links it into
`modules-enabled`), but otherwise configures nothing for VTS — you wire the
zone + `vhost_traffic_status_display` server in your own nginx config, and it
serves whichever dashboard was baked above.

Nothing in this directory (besides this README) is committed.

## Runtime override (no rebuild)

The baked dashboard is compiled into the module, so replacing it normally
means a rebuild. But you can serve **your own** dashboard at runtime by
mounting an HTML file and handing it out at the display location's exact
URI, while VTS keeps serving the JSON/control sub-paths (`format/json`,
`format/prometheus`, `control`, …) it needs. `location = /status/`
(exact) wins over `location /status/` (prefix), so:

```nginx
server {
    listen 127.0.0.1:9913;

    # VTS owns the format/* and control sub-paths.
    location /status/ {
        vhost_traffic_status_display;
        vhost_traffic_status_display_format html;
    }

    # Your dashboard replaces just the page at the location root.
    location = /status/ {
        alias /etc/nginx/vts-dashboard.html;  # mounted file
        default_type text/html;
    }
}
```

```yaml
# docker-compose.yml
volumes:
  - ./my-dashboard.html:/etc/nginx/vts-dashboard.html:ro
```

Caveat: the `{{uri}}` token is substituted **only** for the compiled
page, not for a file served this way. Your runtime dashboard must point
at the JSON endpoint directly — use a relative `format/json` (resolves
under the same `/status/` prefix) instead of `{{uri}}/format/json`.
