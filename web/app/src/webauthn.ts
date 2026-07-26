// Browser WebAuthn ceremony helpers. The Go backend (go-webauthn) sends
// options with base64url-encoded binary fields and expects the assertion
// serialized back the same way; these adapt to/from the browser's
// ArrayBuffer-based credentials API.

// go-webauthn wraps its options in { publicKey: {...} }.
export interface WebAuthnCreateOptions {
  publicKey: PublicKeyCredentialCreationOptionsJSONLike;
}
export interface WebAuthnGetOptions {
  publicKey: PublicKeyCredentialRequestOptionsJSONLike;
}

interface PublicKeyCredentialCreationOptionsJSONLike {
  challenge: string;
  user: { id: string; name: string; displayName: string };
  [k: string]: unknown;
}
interface PublicKeyCredentialRequestOptionsJSONLike {
  challenge: string;
  allowCredentials?: { id: string; type: string; transports?: string[] }[];
  [k: string]: unknown;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bytesToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function supported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

// createCredential runs navigator.credentials.create and returns the JSON
// the backend expects for FinishRegistration.
export async function createCredential(opts: WebAuthnCreateOptions): Promise<unknown> {
  const pk = opts.publicKey;
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...(pk as unknown as PublicKeyCredentialCreationOptions),
    challenge: b64urlToBytes(pk.challenge),
    user: {
      ...pk.user,
      id: b64urlToBytes(pk.user.id),
    },
    excludeCredentials: (
      pk.excludeCredentials as { id: string; transports?: AuthenticatorTransport[] }[] | undefined
    )?.map((c) => ({
      id: b64urlToBytes(c.id),
      type: "public-key" as const,
      transports: c.transports,
    })),
  };
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  const res = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bytesToB64url(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: bytesToB64url(res.attestationObject),
      clientDataJSON: bytesToB64url(res.clientDataJSON),
    },
  };
}

// getAssertion runs navigator.credentials.get and returns the JSON the
// backend expects for FinishLogin.
export async function getAssertion(opts: WebAuthnGetOptions): Promise<unknown> {
  const pk = opts.publicKey;
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...(pk as unknown as PublicKeyCredentialRequestOptions),
    challenge: b64urlToBytes(pk.challenge),
    allowCredentials: pk.allowCredentials?.map((c) => ({
      id: b64urlToBytes(c.id),
      type: "public-key" as const,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };
  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  const res = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bytesToB64url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bytesToB64url(res.authenticatorData),
      clientDataJSON: bytesToB64url(res.clientDataJSON),
      signature: bytesToB64url(res.signature),
      userHandle: res.userHandle ? bytesToB64url(res.userHandle) : null,
    },
  };
}
