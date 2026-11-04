package server

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Buco7854/lightngx/internal/accounts"
	"github.com/Buco7854/lightngx/internal/auth"
	"github.com/Buco7854/lightngx/internal/config"
	"github.com/Buco7854/lightngx/internal/logs"
	"github.com/Buco7854/lightngx/internal/store"
	"github.com/Buco7854/lightngx/internal/webauthnx"
	"github.com/fxamacker/cbor/v2"
	"github.com/go-webauthn/webauthn/webauthn"
)

type securityFixture struct {
	s       *Server
	db      *store.Store
	user    store.User
	handler http.Handler
}

func newSecurityFixture(t *testing.T) *securityFixture {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "db"), bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	user, err := db.CreateUser("operator", "unused password hash", "user")
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{}
	acct, err := accounts.New(db, cfg)
	if err != nil {
		t.Fatal(err)
	}
	sessions := auth.NewSessions(bytes.Repeat([]byte{2}, 32), time.Hour, func(*http.Request) bool { return true })
	s := New(cfg, sessions, nil, nil, nil, nil, nil, nil, acct, webauthnx.New("example.test", []string{"https://example.test"}), nil)
	return &securityFixture{s, db, user, s.Handler()}
}
func (f *securityFixture) cookie(t *testing.T, level string) *http.Cookie {
	t.Helper()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "https://example.test", nil)
	if err := f.s.issueSession(w, r, f.user, "local", level); err != nil {
		t.Fatal(err)
	}
	return w.Result().Cookies()[0]
}
func (f *securityFixture) call(method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "https://example.test"+path, bytes.NewBufferString(body))
	r.Header.Set("Origin", "https://example.test")
	r.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		r.AddCookie(c)
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	return w
}
func testTOTP(t *testing.T, secret string) string {
	t.Helper()
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		t.Fatal(err)
	}
	mac := hmac.New(sha1.New, key)
	mac.Write(binary.BigEndian.AppendUint64(nil, uint64(time.Now().Unix()/30)))
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 15
	return fmt.Sprintf("%06d", (binary.BigEndian.Uint32(sum[offset:offset+4])&0x7fffffff)%1000000)
}

func TestStaleEnrollmentCannotReplaceEstablishedMFA(t *testing.T) {
	f := newSecurityFixture(t)
	stale := f.cookie(t, auth.LevelEnroll)
	secret, err := auth.NewTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetPendingTOTP(f.user.ID, secret); err != nil {
		t.Fatal(err)
	}
	if err := f.db.ConfirmTOTP(f.user.ID); err != nil {
		t.Fatal(err)
	}
	// This password-only session predates a completed enrollment on another device.
	w := f.call("POST", "/api/mfa/totp/begin", "{}", stale)
	if w.Code != http.StatusForbidden {
		t.Errorf("stale enrollment can replace TOTP: %d %s", w.Code, w.Body)
		var response struct {
			Secret string `json:"secret"`
		}
		json.Unmarshal(w.Body.Bytes(), &response)
		if response.Secret != "" {
			confirm := f.call("POST", "/api/mfa/totp/confirm", `{"code":"`+testTOTP(t, response.Secret)+`"}`, stale)
			if confirm.Code == http.StatusOK {
				t.Errorf("password-only session upgraded using attacker-selected TOTP: %s", confirm.Body)
			}
		}
	}
	w = f.call("POST", "/api/mfa/webauthn/register/begin", "{}", stale)
	if w.Code != http.StatusForbidden {
		t.Errorf("stale enrollment can add a security key: %d %s", w.Code, w.Body)
	}
}

// A valid ES256 software authenticator with a zero sign counter models the
// counter behavior permitted for passkeys; replay protection must use challenges.
func softwareAssertion(t *testing.T, f *securityFixture) func(string) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	cose, err := cbor.Marshal(map[int]any{1: 2, 3: -7, -1: 1, -2: key.X.FillBytes(make([]byte, 32)), -3: key.Y.FillBytes(make([]byte, 32))})
	if err != nil {
		t.Fatal(err)
	}
	id := []byte("security-audit-software-credential")
	credential := webauthn.Credential{ID: id, PublicKey: cose, AttestationFormat: "none"}
	data, err := json.Marshal(credential)
	if err != nil {
		t.Fatal(err)
	}
	encode := base64.RawURLEncoding.EncodeToString
	if err := f.db.AddCredential(f.user.ID, encode(id), "Software authenticator", data); err != nil {
		t.Fatal(err)
	}
	return func(challenge string) string {
		client, _ := json.Marshal(map[string]any{"type": "webauthn.get", "challenge": challenge, "origin": "https://example.test", "crossOrigin": false})
		rpHash := sha256.Sum256([]byte("example.test"))
		authData := append(rpHash[:], 5, 0, 0, 0, 0) // UP + UV, counter zero.
		clientHash := sha256.Sum256(client)
		signed := sha256.Sum256(append(append([]byte{}, authData...), clientHash[:]...))
		signature, err := ecdsa.SignASN1(rand.Reader, key, signed[:])
		if err != nil {
			t.Fatal(err)
		}
		handle := binary.BigEndian.AppendUint64(nil, uint64(f.user.ID))
		b, _ := json.Marshal(map[string]any{"id": encode(id), "rawId": encode(id), "type": "public-key", "response": map[string]string{"authenticatorData": encode(authData), "clientDataJSON": encode(client), "signature": encode(signature), "userHandle": encode(handle)}})
		return string(b)
	}
}
func beginPasskey(t *testing.T, f *securityFixture) (string, *http.Cookie) {
	t.Helper()
	w := f.call("POST", "/api/auth/passkey/begin", "{}")
	if w.Code != 200 {
		t.Fatalf("begin passkey: %d %s", w.Code, w.Body)
	}
	var options struct {
		PublicKey struct {
			Challenge string `json:"challenge"`
		} `json:"publicKey"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &options); err != nil {
		t.Fatal(err)
	}
	for _, c := range w.Result().Cookies() {
		if c.Name == waCookiePasskey {
			return options.PublicKey.Challenge, c
		}
	}
	t.Fatal("missing challenge cookie")
	return "", nil
}
func TestPasskeyAssertionCannotBeReplayed(t *testing.T) {
	f := newSecurityFixture(t)
	sign := softwareAssertion(t, f)
	challenge, cookie := beginPasskey(t, f)
	assertion := sign(challenge)
	first := f.call("POST", "/api/auth/passkey/finish", assertion, cookie)
	if first.Code != 200 {
		t.Fatalf("valid assertion: %d %s", first.Code, first.Body)
	}
	// Logout revokes the resulting session. Replaying its original assertion
	// and signed challenge must not mint a replacement session.
	for _, c := range first.Result().Cookies() {
		if c.Name == auth.SessionCookie {
			f.call("POST", "/api/auth/logout", "{}", c)
		}
	}
	replay := f.call("POST", "/api/auth/passkey/finish", assertion, cookie)
	if replay.Code == 200 {
		t.Fatalf("replayed assertion created a new session after logout: %s", replay.Body)
	}
}
func TestConcurrentPasskeyAssertionConsumedOnce(t *testing.T) {
	f := newSecurityFixture(t)
	sign := softwareAssertion(t, f)
	challenge, cookie := beginPasskey(t, f)
	assertion := sign(challenge)
	var successes atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for range 16 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if f.call("POST", "/api/auth/passkey/finish", assertion, cookie).Code == 200 {
				successes.Add(1)
			}
		}()
	}
	close(start)
	wg.Wait()
	if got := successes.Load(); got != 1 {
		t.Fatalf("one assertion created %d sessions, want 1", got)
	}
}
func TestWebAuthnChallengeHasServerExpiry(t *testing.T) {
	f := newSecurityFixture(t)
	_, cookie := beginPasskey(t, f)
	payload, err := f.s.sessions.Unsign(cookie.Value)
	if err != nil {
		t.Fatal(err)
	}
	var sd webauthnx.SessionData
	if err := json.Unmarshal(payload, &sd); err != nil {
		t.Fatal(err)
	}
	if sd.Expires.IsZero() || sd.Expires.Before(time.Now()) || sd.Expires.After(time.Now().Add(5*time.Minute+time.Second)) {
		t.Fatalf("invalid server-enforced challenge expiry: %v", sd.Expires)
	}
}
func TestTOTPFailuresLimitedAcrossClientIPs(t *testing.T) {
	f := newSecurityFixture(t)
	cookie := f.cookie(t, auth.LevelMFA)
	for i := range 6 {
		r := httptest.NewRequest("POST", "https://example.test/api/auth/mfa/verify/totp", bytes.NewBufferString(`{"code":"invalid"}`))
		r.Header.Set("Origin", "https://example.test")
		r.RemoteAddr = fmt.Sprintf("203.0.113.%d:1234", i+1)
		r.AddCookie(cookie)
		w := httptest.NewRecorder()
		f.handler.ServeHTTP(w, r)
		want := http.StatusUnauthorized
		if i == 5 {
			want = http.StatusTooManyRequests
		}
		if w.Code != want {
			t.Fatalf("attempt %d from a new IP: %d, want %d", i+1, w.Code, want)
		}
	}
}

func TestTOTPVerificationRotatesPartialSession(t *testing.T) {
	f := newSecurityFixture(t)
	secret, err := auth.NewTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetPendingTOTP(f.user.ID, secret); err != nil {
		t.Fatal(err)
	}
	if err := f.db.ConfirmTOTP(f.user.ID); err != nil {
		t.Fatal(err)
	}
	partial := f.cookie(t, auth.LevelMFA)
	code := testTOTP(t, secret)
	w := f.call("POST", "/api/auth/mfa/verify/totp", `{"code":"`+code+`"}`, partial)
	if w.Code != 200 {
		t.Fatalf("verify: %d %s", w.Code, w.Body)
	}
	var upgraded *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == auth.SessionCookie {
			upgraded = c
		}
	}
	if upgraded == nil || upgraded.Value == partial.Value {
		t.Fatal("session cookie not rotated")
	}
	if w := f.call("GET", "/api/tags", "", partial); w.Code != 401 {
		t.Fatalf("copied partial cookie gained access: %d", w.Code)
	}
	if w := f.call("GET", "/api/tags", "", upgraded); w.Code != 200 {
		t.Fatalf("new cookie rejected: %d %s", w.Code, w.Body)
	}
	other := f.cookie(t, auth.LevelMFA)
	if w := f.call("POST", "/api/auth/mfa/verify/totp", `{"code":"`+code+`"}`, other); w.Code != 401 {
		t.Fatalf("TOTP replay accepted: %d %s", w.Code, w.Body)
	}
}

func TestTOTPEnrollmentAttemptsLimited(t *testing.T) {
	f := newSecurityFixture(t)
	cookie := f.cookie(t, auth.LevelEnroll)
	secret, err := auth.NewTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetPendingTOTP(f.user.ID, secret); err != nil {
		t.Fatal(err)
	}
	for i := range 6 {
		w := f.call("POST", "/api/mfa/totp/confirm", `{"code":"invalid"}`, cookie)
		want := 401
		if i == 5 {
			want = 429
		}
		if w.Code != want {
			t.Fatalf("enrollment attempt %d: %d %s", i+1, w.Code, w.Body)
		}
	}
}

func TestAPIBodyLimitsAndNoStore(t *testing.T) {
	f := newSecurityFixture(t)
	cookie := f.cookie(t, auth.LevelFull)
	for _, chunked := range []bool{false, true} {
		r := httptest.NewRequest("POST", "https://example.test/api/mfa/webauthn/register/finish", strings.NewReader(strings.Repeat(" ", (1<<20)+1)))
		if chunked {
			r.ContentLength = -1
		}
		r.Header.Set("Origin", "https://example.test")
		r.AddCookie(cookie)
		w := httptest.NewRecorder()
		f.handler.ServeHTTP(w, r)
		if w.Code != 413 && w.Code != 400 {
			t.Fatalf("oversized upload (chunked %v): %d", chunked, w.Code)
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("API response can be cached")
		}
	}
	if w := f.call("GET", "/api/auth/me", ""); w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("anonymous auth response can be cached")
	}
}

func TestRevokedSessionStopsLiveLogData(t *testing.T) {
	f := newSecurityFixture(t)
	path := filepath.Join(t.TempDir(), "access.log")
	if err := os.WriteFile(path, nil, 0600); err != nil {
		t.Fatal(err)
	}
	f.s.logs = logs.New([]string{path})
	cookie := f.cookie(t, auth.LevelFull)
	server := httptest.NewServer(f.handler)
	defer server.Close()
	request, err := http.NewRequest("GET", server.URL+"/api/logs/stream?from=0&path="+url.QueryEscape(path), nil)
	if err != nil {
		t.Fatal(err)
	}
	request.AddCookie(cookie)
	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("open stream: %d", response.StatusCode)
	}
	if err := f.db.DeleteUserSessions(f.user.ID, ""); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("confidential log line\n"), 0600); err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("revoked stream did not close: %v", err)
	}
	if len(data) != 0 {
		t.Fatalf("revoked session received log data: %s", data)
	}
}
