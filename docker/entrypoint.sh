#!/bin/sh
# lightngx container entrypoint: seed config, prepare logs, run
# drop-in hooks, then hand over to lightngx (which supervises nginx).
set -eu

# Seed /etc/nginx from the image template when the (usually bind-mounted)
# directory is empty. An existing config is never touched.
if [ -z "$(ls -A /etc/nginx 2>/dev/null)" ]; then
    echo "[lightngx] /etc/nginx is empty, seeding from /usr/local/etc/nginx"
    cp -a /usr/local/etc/nginx/. /etc/nginx/
fi

# Seed the UI reverse-proxy config once if absent (works for an existing
# config too); never clobber a copy you have edited.
if [ ! -e /etc/nginx/conf.d/lightngx.conf ] \
   && [ -f /usr/share/lightngx/conf/lightngx.conf ]; then
    mkdir -p /etc/nginx/conf.d
    cp /usr/share/lightngx/conf/lightngx.conf /etc/nginx/conf.d/lightngx.conf
    echo "[lightngx] seeded conf.d/lightngx.conf"
fi

# The nginx base image symlinks its logs to /dev/stdout|stderr, which the
# log viewer cannot read. Replace them with real files unless the user
# opts back into docker-style logging with LN_DOCKER_LOGS=true.
if [ "${LN_DOCKER_LOGS:-false}" != "true" ]; then
    for f in access.log error.log; do
        if [ -L "/var/log/nginx/$f" ]; then
            rm -f "/var/log/nginx/$f"
            touch "/var/log/nginx/$f"
        fi
    done
fi

# Drop-in hooks, ordered by name: the replacement for s6 oneshots when
# rebasing images that add integrations (crowdsec, vts, ...). A failing
# hook aborts startup so breakage is loud, not silent.
if [ -d /docker-entrypoint.d ]; then
    for hook in $(find /docker-entrypoint.d -maxdepth 1 -name '*.sh' -type f | sort); do
        if [ -x "$hook" ]; then
            echo "[lightngx] running hook $hook"
            "$hook"
        fi
    done
fi

exec /usr/local/bin/lightngx "$@"
