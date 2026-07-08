---
sidebar_position: 3
---

# Accounts and access

Local accounts (username, bcrypt password, and a role of `admin` or `user`)
live in the embedded SQLite database. There are three ways to sign in.

- **First-run setup.** When there is no admin yet and `LN_ADMIN_USER` is unset,
  the UI shows a one-time page to create the first admin.
- **Seeded admin.** `LN_ADMIN_USER` and `LN_ADMIN_PASSWORD_HASH` create that
  admin on the first boot. A later password change made in the app is kept.
- **OIDC.** Sign-in is delegated to your identity provider. These logins bypass
  local MFA. The role is `admin` when the identity is in `LN_OIDC_ADMIN_GROUPS`,
  and `user` otherwise.

![The profile and two-factor page](/img/screenshot-mfa.png)

## Two-factor auth

Two-factor auth uses TOTP (an authenticator app) and WebAuthn (security keys
and passkeys). You can enable either or both.

Set `LN_MFA_REQUIRED_ROLES` to pin which roles must use it, for example `admin`
or `admin,user`. Leave it unset to let the first admin choose the policy in the
app instead. A user who is required to enroll is walked through it on their next
login, and can switch freely between TOTP and WebAuthn until they validate one
method.

Anyone can manage their own factors and password from the **Profile** page.
TOTP secrets are encrypted at rest.

## Administration

Admins manage the MFA policy and every account from the **Administration**
page: create users, change roles, and reset passwords. The last remaining admin
cannot be demoted or deleted, so you can never lock yourself out.

![User management on the administration page](/img/screenshot-admin.png)

## OIDC

OIDC login is additional to local accounts, which stay available. Authorization
is group-based.

| Variable | Description |
| --- | --- |
| `LN_OIDC_ISSUER` | Issuer URL, used for discovery |
| `LN_OIDC_CLIENT_ID` and `LN_OIDC_CLIENT_SECRET` | Client credentials |
| `LN_OIDC_REDIRECT_URL` | `https://<host>/api/auth/oidc/callback` |
| `LN_OIDC_SCOPES` | Defaults to `openid,profile,email` |
| `LN_OIDC_GROUPS_CLAIM` | ID-token claim holding the user's groups (default `groups`) |
| `LN_OIDC_ALLOWED_GROUPS` | Groups allowed to log in |
| `LN_OIDC_ADMIN_GROUPS` | Groups granted the admin role |

If `LN_OIDC_ALLOWED_GROUPS` is unset, any authenticated user of the provider is
accepted as role `user`, unless they are in `LN_OIDC_ADMIN_GROUPS`. The flow
uses PKCE with `state` and `nonce`.
