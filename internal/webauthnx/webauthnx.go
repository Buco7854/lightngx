// Package webauthnx wraps go-webauthn: it adapts store records to the
// library's User/Credential model and builds a relying party from the
// request origin (or configured overrides) so passkeys work behind a
// proxy that preserves Host and scheme.
package webauthnx

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/Buco7854/lightngx/internal/store"
)

type Manager struct {
	rpID        string
	rpOrigins   []string
	displayName string
}

// New builds a manager. rpID/origins may be empty, in which case they are
// derived per-request from the browser origin.
func New(rpID string, origins []string) *Manager {
	return &Manager{rpID: rpID, rpOrigins: origins, displayName: "Lightngx"}
}

// forRequest builds a WebAuthn relying party matching this request. The
// RP ID is the registrable host; origins default to the request's
// scheme://host. Explicit config overrides both.
func (m *Manager) forRequest(r *http.Request) (*webauthn.WebAuthn, error) {
	host := r.Host
	if h, _, ok := strings.Cut(host, ":"); ok {
		host = h
	}
	scheme := "https"
	if xf := r.Header.Get("X-Forwarded-Proto"); xf != "" {
		scheme = xf
	} else if r.TLS == nil {
		scheme = "http"
	}
	rpID := m.rpID
	if rpID == "" {
		rpID = host
	}
	origins := m.rpOrigins
	if len(origins) == 0 {
		origins = []string{scheme + "://" + r.Host}
	}
	return webauthn.New(&webauthn.Config{
		RPID:          rpID,
		RPDisplayName: m.displayName,
		RPOrigins:     origins,
	})
}

// user adapts a store user + its credentials to webauthn.User.
type user struct {
	u     store.User
	creds []webauthn.Credential
}

func (u *user) WebAuthnID() []byte {
	// Stable per-user handle: the 8-byte big-endian user id.
	return binary.BigEndian.AppendUint64(nil, uint64(u.u.ID))
}

// userIDFromHandle inverts WebAuthnID.
func userIDFromHandle(h []byte) (int64, error) {
	if len(h) != 8 {
		return 0, errors.New("bad user handle")
	}
	return int64(binary.BigEndian.Uint64(h)), nil
}
func (u *user) WebAuthnName() string                       { return u.u.Username }
func (u *user) WebAuthnDisplayName() string                { return u.u.Username }
func (u *user) WebAuthnCredentials() []webauthn.Credential { return u.creds }

func loadUser(st *store.Store, u store.User) (*user, error) {
	rows, err := st.Credentials(u.ID)
	if err != nil {
		return nil, err
	}
	creds := make([]webauthn.Credential, 0, len(rows))
	for _, row := range rows {
		var c webauthn.Credential
		if err := json.Unmarshal(row.Data, &c); err != nil {
			return nil, err
		}
		creds = append(creds, c)
	}
	return &user{u: u, creds: creds}, nil
}

// SessionData is the challenge state carried between begin/finish (stored
// in a signed cookie by the HTTP layer).
type SessionData = webauthn.SessionData

// BeginRegister starts credential creation for a user.
func (m *Manager) BeginRegister(r *http.Request, st *store.Store, u store.User) (any, *SessionData, error) {
	w, err := m.forRequest(r)
	if err != nil {
		return nil, nil, err
	}
	wu, err := loadUser(st, u)
	if err != nil {
		return nil, nil, err
	}
	// Prefer discoverable credentials (passkeys) with no attachment
	// restriction, so mobile browsers surface roaming providers like
	// Bitwarden / 1Password alongside the platform authenticator — not
	// just the built-in one. "preferred" (not "required") keeps plain
	// hardware security keys usable too.
	opts, sd, err := w.BeginRegistration(wu, webauthn.WithAuthenticatorSelection(
		protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementPreferred,
			UserVerification: protocol.VerificationPreferred,
		},
	))
	return opts, sd, err
}

// FinishRegister validates the attestation and persists the credential.
func (m *Manager) FinishRegister(r *http.Request, st *store.Store, u store.User, sd *SessionData, name string) error {
	w, err := m.forRequest(r)
	if err != nil {
		return err
	}
	wu, err := loadUser(st, u)
	if err != nil {
		return err
	}
	cred, err := w.FinishRegistration(wu, *sd, r)
	if err != nil {
		return err
	}
	data, err := json.Marshal(cred)
	if err != nil {
		return err
	}
	if name = strings.TrimSpace(name); name == "" {
		name = "Security key"
	}
	return st.AddCredential(u.ID, encodeID(cred.ID), name, data)
}

// BeginLogin starts an assertion for a user known by username.
func (m *Manager) BeginLogin(r *http.Request, st *store.Store, u store.User) (any, *SessionData, error) {
	w, err := m.forRequest(r)
	if err != nil {
		return nil, nil, err
	}
	wu, err := loadUser(st, u)
	if err != nil {
		return nil, nil, err
	}
	return w.BeginLogin(wu)
}

// FinishLogin validates the assertion and advances the stored sign count.
func (m *Manager) FinishLogin(r *http.Request, st *store.Store, u store.User, sd *SessionData) error {
	w, err := m.forRequest(r)
	if err != nil {
		return err
	}
	wu, err := loadUser(st, u)
	if err != nil {
		return err
	}
	cred, err := w.FinishLogin(wu, *sd, r)
	if err != nil {
		return err
	}
	return persistAssertion(st, cred)
}

// BeginPasskeyLogin starts a usernameless assertion. User verification is
// required so the single ceremony carries two factors.
func (m *Manager) BeginPasskeyLogin(r *http.Request) (any, *SessionData, error) {
	w, err := m.forRequest(r)
	if err != nil {
		return nil, nil, err
	}
	return w.BeginDiscoverableLogin(webauthn.WithUserVerification(protocol.VerificationRequired))
}

// FinishPasskeyLogin validates a discoverable assertion, resolving the
// account from the returned user handle.
func (m *Manager) FinishPasskeyLogin(r *http.Request, st *store.Store, sd *SessionData) (store.User, error) {
	w, err := m.forRequest(r)
	if err != nil {
		return store.User{}, err
	}
	handler := func(_, userHandle []byte) (webauthn.User, error) {
		id, err := userIDFromHandle(userHandle)
		if err != nil {
			return nil, err
		}
		u, err := st.GetUser(id)
		if err != nil {
			return nil, err
		}
		return loadUser(st, u)
	}
	wu, cred, err := w.FinishPasskeyLogin(handler, *sd, r)
	if err != nil {
		return store.User{}, err
	}
	if err := persistAssertion(st, cred); err != nil {
		return store.User{}, err
	}
	return wu.(*user).u, nil
}

// persistAssertion stores the advanced sign count, rejecting clones.
func persistAssertion(st *store.Store, cred *webauthn.Credential) error {
	// go-webauthn flags a sign-counter regression rather than erroring; a
	// clone and the original both authenticate unless we reject it here.
	if cred.Authenticator.CloneWarning {
		return errors.New("authenticator clone detected")
	}
	data, err := json.Marshal(cred)
	if err != nil {
		return err
	}
	return st.UpdateCredentialData(encodeID(cred.ID), data)
}

func encodeID(id []byte) string {
	return base64.RawURLEncoding.EncodeToString(id)
}
