---
sidebar_label: Screenshots
---

import ThemedImage from "@theme/ThemedImage";
import useBaseUrl from "@docusaurus/useBaseUrl";

export const Shot = ({ name, alt }) => (
  <ThemedImage
    alt={alt}
    sources={{
      light: useBaseUrl(`/img/${name}.png`),
      dark: useBaseUrl(`/img/${name}-dark.png`),
    }}
  />
);

# Screenshots

A tour of the interface. Every shot follows your light or dark preference.

## Configuration editor

Guarded editing with nginx syntax highlighting. Saves run `nginx -t` and roll
back on failure.

<Shot name="screenshot-editor" alt="The configuration editor" />

## File browser

<Shot name="screenshot-config" alt="The config file browser" />

## Sites

<Shot name="screenshot-sites" alt="The sites list" />

## Streams

<Shot name="screenshot-streams" alt="The streams list" />

## Live logs

<Shot name="screenshot-logs" alt="The live log viewer" />

## Profile and two-factor

<Shot name="screenshot-mfa" alt="Profile with password and two-factor settings" />

## Active sessions

Every signed-in device, with its browser and last activity, revocable one by
one.

<Shot name="screenshot-sessions" alt="Active sessions list with revoke buttons" />

## Administration

<Shot name="screenshot-admin" alt="User management, MFA policy and API keys" />

## Mobile

<Shot name="screenshot-mobile" alt="The sites list on a phone" />
