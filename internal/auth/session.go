// Package auth implements sessions, local login and OIDC.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const SessionCookie = "ln_session"

var ErrInvalidSession = errors.New("invalid session")

// Session levels. A login that still owes a second factor gets a
// short-lived partial session that only unlocks the MFA endpoints.
const (
	LevelFull   = "full"   // fully authenticated
	LevelMFA    = "mfa"    // password ok, awaiting TOTP/WebAuthn verification
	LevelEnroll = "enroll" // password ok, must enrol a required second factor
)

// Session is the authenticated principal carried by the session cookie.
type Session struct {
	UserID    int64     `json:"id"`
	User      string    `json:"u"`
	Role      string    `json:"r"`
	Method    string    `json:"m"` // "local" or "oidc"
	Level     string    `json:"l"` // LevelFull / LevelMFA / LevelEnroll
	IssuedAt  time.Time `json:"iat"`
	ExpiresAt time.Time `json:"exp"`
}

// IsAdmin reports whether the session principal has the admin role.
func (s *Session) IsAdmin() bool { return s.Role == "admin" }

// Sessions issues and verifies HMAC-signed session tokens. Tokens are
// stateless: payload JSON + SHA-256 HMAC, both base64url encoded.
type Sessions struct {
	secret []byte
	ttl    time.Duration
	secure bool
}

func NewSessions(secret []byte, ttl time.Duration, secure bool) *Sessions {
	return &Sessions{secret: secret, ttl: ttl, secure: secure}
}

// LoadOrCreateSecret returns the configured secret, or a random one
// persisted under dataDir so sessions survive restarts.
func LoadOrCreateSecret(configured, dataDir string) ([]byte, error) {
	if configured != "" {
		if len(configured) < 32 {
			return nil, errors.New("LN_SESSION_SECRET must be at least 32 characters")
		}
		return []byte(configured), nil
	}
	path := filepath.Join(dataDir, "session.key")
	if b, err := os.ReadFile(path); err == nil && len(b) >= 32 {
		return b, nil
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, fmt.Errorf("data dir: %w", err)
	}
	if err := os.WriteFile(path, key, 0o600); err != nil {
		return nil, fmt.Errorf("persist session key: %w", err)
	}
	return key, nil
}

func (s *Sessions) sign(payload []byte) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." +
		base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Sessions) verify(token string) ([]byte, error) {
	payloadB64, sigB64, ok := strings.Cut(token, ".")
	if !ok {
		return nil, ErrInvalidSession
	}
	payload, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, ErrInvalidSession
	}
	sig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return nil, ErrInvalidSession
	}
	mac := hmac.New(sha256.New, s.secret)
	mac.Write(payload)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return nil, ErrInvalidSession
	}
	return payload, nil
}

// Issue sets a session cookie carrying sess. Partial sessions (not
// LevelFull) get a short 10-minute TTL; full sessions get the normal TTL.
func (s *Sessions) Issue(w http.ResponseWriter, sess Session) error {
	now := time.Now()
	ttl := s.ttl
	if sess.Level != LevelFull {
		ttl = 10 * time.Minute
	}
	sess.IssuedAt = now
	sess.ExpiresAt = now.Add(ttl)
	payload, err := json.Marshal(sess)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookie,
		Value:    s.sign(payload),
		Path:     "/",
		MaxAge:   int(ttl.Seconds()),
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
	return nil
}

// Sign returns an HMAC-signed, tamper-evident token for an arbitrary
// payload (used for short-lived WebAuthn challenge cookies).
func (s *Sessions) Sign(payload []byte) string { return s.sign(payload) }

// Unsign verifies and returns the payload of a Sign token.
func (s *Sessions) Unsign(token string) ([]byte, error) { return s.verify(token) }

// Clear expires the session cookie.
func (s *Sessions) Clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// FromRequest returns the valid session attached to r, if any.
func (s *Sessions) FromRequest(r *http.Request) (*Session, error) {
	c, err := r.Cookie(SessionCookie)
	if err != nil {
		return nil, ErrInvalidSession
	}
	payload, err := s.verify(c.Value)
	if err != nil {
		return nil, err
	}
	var sess Session
	if err := json.Unmarshal(payload, &sess); err != nil {
		return nil, ErrInvalidSession
	}
	if time.Now().After(sess.ExpiresAt) {
		return nil, ErrInvalidSession
	}
	return &sess, nil
}
