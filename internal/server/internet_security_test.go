package server

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/Buco7854/lightngx/internal/auth"
)

func securitySQL(t *testing.T, f *securityFixture, query string, args ...any) {
	t.Helper()
	db, err := sql.Open("sqlite", f.dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(query, args...); err != nil {
		t.Fatal(err)
	}
}

func TestProxyClientAddressCannotBeSpoofed(t *testing.T) {
	f := newSecurityFixture(t)
	_, proxy, _ := net.ParseCIDR("10.1.0.0/16")
	f.s.cfg.TrustedProxies = []*net.IPNet{proxy}
	for _, tc := range []struct{ peer, chain, want string }{
		{"127.0.0.1:9000", "198.51.100.5", "198.51.100.5"},
		{"127.0.0.1:9000", "192.0.2.10,198.51.100.5", "198.51.100.5"},
		{"203.0.113.5:9000", "192.0.2.10", "203.0.113.5"},
		{"10.1.0.2:9000", "192.0.2.10,198.51.100.5,10.1.0.3", "198.51.100.5"},
		{"127.0.0.1:9000", "invalid", "127.0.0.1"},
	} {
		r := httptest.NewRequest("GET", "http://example.test", nil)
		r.RemoteAddr = tc.peer
		r.Header.Set("X-Forwarded-For", tc.chain)
		if got := f.s.clientIP(r); got != tc.want {
			t.Fatalf("%s via %s: %s", tc.chain, tc.peer, got)
		}
	}
}

func TestInvalidPasswordCannotPartiallyPromoteUser(t *testing.T) {
	f := newSecurityFixture(t)
	if err := f.db.SetRole(f.user.ID, "admin"); err != nil {
		t.Fatal(err)
	}
	target, err := f.db.CreateUser("target", "hash", "user")
	if err != nil {
		t.Fatal(err)
	}
	w := f.call("PATCH", "/api/admin/users/"+strconv.FormatInt(target.ID, 10), `{"role":"admin","password":"short"}`, f.cookie(t, auth.LevelFull))
	if w.Code != 400 {
		t.Fatal(w.Code, w.Body)
	}
	current, err := f.db.GetUser(target.ID)
	if err != nil || current.Role != "user" {
		t.Fatal("failed request promoted target", current, err)
	}
}

func TestAnonymousPartialAndAPIKeyCannotReachEditingRoutes(t *testing.T) {
	f := newSecurityFixture(t)
	partial := f.cookie(t, auth.LevelMFA)
	_, token, err := f.db.CreateAPIKey("status-only", []string{"nginx:status"})
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/tags", "/api/config/tree", "/api/config/file?path=nginx.conf", "/api/vhosts/sites", "/api/logs", "/api/logs/stream", "/api/account/sessions", "/api/admin/users"} {
		for _, mode := range []string{"anonymous", "partial", "key"} {
			r := httptest.NewRequest("GET", "https://example.test"+path, nil)
			if mode == "partial" {
				r.AddCookie(partial)
			}
			if mode == "key" {
				r.Header.Set("Authorization", "Bearer "+token)
			}
			w := httptest.NewRecorder()
			f.handler.ServeHTTP(w, r)
			if w.Code != 401 {
				t.Fatalf("%s reached %s: %d", mode, path, w.Code)
			}
		}
	}
	if w := f.call("GET", "/api/admin/users", "", f.cookie(t, auth.LevelFull)); w.Code != 403 {
		t.Fatal("regular user reached admin API")
	}
}

func TestConcurrentCounterAssertionsCannotBothAuthenticate(t *testing.T) {
	f := newSecurityFixture(t)
	sign := softwareAssertion(t, f, 1)
	a, ca := beginPasskey(t, f)
	b, cb := beginPasskey(t, f)
	results := make(chan int, 2)
	start := make(chan struct{})
	for _, attempt := range []struct {
		challenge string
		cookie    *http.Cookie
	}{{a, ca}, {b, cb}} {
		assertion := sign(attempt.challenge)
		go func(cookie *http.Cookie) {
			<-start
			results <- f.call("POST", "/api/auth/passkey/finish", assertion, cookie).Code
		}(attempt.cookie)
	}
	close(start)
	successes := 0
	for range 2 {
		if <-results == 200 {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("same nonzero counter authenticated %d times", successes)
	}
}
func TestFirstAdminRequiresServerToken(t *testing.T) {
	f := newSecurityFixture(t)
	for _, token := range []string{"", "incorrect"} {
		body, _ := json.Marshal(map[string]string{"username": "owner", "password": "Strong-setup-password-42!", "token": token})
		if w := f.call("POST", "/api/auth/setup", string(body)); w.Code != 403 {
			t.Fatalf("anonymous setup: %d %s", w.Code, w.Body)
		}
	}
	if n, _ := f.db.CountAdmins(); n != 0 {
		t.Fatal("unauthorized admin created")
	}
	body, _ := json.Marshal(map[string]string{"username": "owner", "password": "Strong-setup-password-42!", "token": f.s.sessions.BootstrapToken()})
	if w := f.call("POST", "/api/auth/setup", string(body)); w.Code != 200 {
		t.Fatalf("owner setup: %d %s", w.Code, w.Body)
	}
	if w := f.call("POST", "/api/auth/setup", string(body)); w.Code != 409 {
		t.Fatal("setup token reused")
	}
	if n, _ := f.db.CountAdmins(); n != 1 {
		t.Fatalf("admins=%d", n)
	}
}

func TestOIDCLogoutRevokesCopiedCookie(t *testing.T) {
	f := newSecurityFixture(t)
	cookie := func(sid string) *http.Cookie {
		w := httptest.NewRecorder()
		if err := f.s.sessions.Issue(w, httptest.NewRequest("GET", "https://example.test", nil), auth.Session{User: "SSO operator", Role: "admin", Method: "oidc", Level: auth.LevelFull, Sid: sid}); err != nil {
			t.Fatal(err)
		}
		return w.Result().Cookies()[0]
	}
	sid, err := f.db.CreateOIDCSession("SSO operator", "admin", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	full := cookie(sid)
	if w := f.call("GET", "/api/tags", "", full); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	if w := f.call("POST", "/api/auth/logout", "{}", full); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	if w := f.call("GET", "/api/tags", "", full); w.Code != 401 {
		t.Fatal("logged out SSO cookie replayed")
	}
	if w := f.call("GET", "/api/tags", "", cookie("")); w.Code != 401 {
		t.Fatal("legacy stateless SSO session accepted")
	}
	expired, err := f.db.CreateOIDCSession("SSO operator", "admin", -time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if w := f.call("GET", "/api/tags", "", cookie(expired)); w.Code != 401 {
		t.Fatal("expired SSO session accepted")
	}
}

func TestOriginIncludesSchemeAndTrustsOnlyProxyTransport(t *testing.T) {
	f := newSecurityFixture(t)
	full := f.cookie(t, auth.LevelFull)
	_, proxy, _ := net.ParseCIDR("10.1.0.0/16")
	f.s.cfg.TrustedProxies = []*net.IPNet{proxy}
	f.handler = f.s.Handler()
	for i, tc := range []struct {
		url, origin, peer, proto string
		want                     int
	}{
		{"https://example.test", "http://example.test", "203.0.113.1:1234", "", 403},
		{"http://example.test", "https://example.test", "203.0.113.1:1234", "https", 403},
		{"http://example.test", "https://example.test", "10.1.0.2:1234", "https", 200},
		{"https://example.test", "https://example.test/", "203.0.113.1:1234", "", 403},
		{"https://example.test", "https://user@example.test", "203.0.113.1:1234", "", 403},
		{"https://example.test", "https://example.test.attacker.test", "203.0.113.1:1234", "", 403},
	} {
		r := httptest.NewRequest("POST", tc.url+"/api/tags", bytes.NewBufferString(`{"name":"origin","mode":"all","rules":[]}`))
		r.RemoteAddr = tc.peer
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("X-Forwarded-Proto", tc.proto)
		r.AddCookie(full)
		w := httptest.NewRecorder()
		f.handler.ServeHTTP(w, r)
		if w.Code != tc.want {
			t.Fatalf("case %d: %d %s", i, w.Code, w.Body)
		}
	}
}

func TestMFAPolicyAppliesToExistingAndStaleLoginSessions(t *testing.T) {
	f := newSecurityFixture(t)
	old := f.cookie(t, auth.LevelFull)
	if err := f.s.accounts.SetPolicy([]string{"user"}); err != nil {
		t.Fatal(err)
	}
	if w := f.call("GET", "/api/tags", "", old); w.Code != 401 {
		t.Fatal("old password-only session bypassed MFA policy")
	}
	// Even an old or erroneous full-level decision must be checked live.
	fresh := f.cookie(t, auth.LevelFull)
	if w := f.call("GET", "/api/tags", "", fresh); w.Code != 401 {
		t.Fatal("MFA requirement not enforced live")
	}
	w := f.call("GET", "/api/me", "", fresh)
	if w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"level":"enroll"`)) {
		t.Fatalf("enrollment status: %d %s", w.Code, w.Body)
	}
}

func TestMFAModificationRequiresRecentPasswordConfirmation(t *testing.T) {
	f := newSecurityFixture(t)
	hash, err := auth.HashPassword("Current-password-42!")
	if err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetPassword(f.user.ID, hash); err != nil {
		t.Fatal(err)
	}
	full := f.cookie(t, auth.LevelFull)
	securitySQL(t, f, `UPDATE user_sessions SET verified_at=?`, time.Now().Add(-6*time.Minute).Unix())
	if w := f.call("POST", "/api/mfa/totp/begin", "{}", full); w.Code != 403 {
		t.Fatalf("stale session changed MFA: %d %s", w.Code, w.Body)
	}
	if w := f.call("POST", "/api/account/reauth", `{"password":"incorrect"}`, full); w.Code != 403 {
		t.Fatal("wrong password accepted")
	}
	if w := f.call("POST", "/api/account/reauth", `{"password":"Current-password-42!"}`, full); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	if w := f.call("POST", "/api/mfa/totp/begin", "{}", full); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
}

func TestPasswordVerificationConcurrencyIsBounded(t *testing.T) {
	f := newSecurityFixture(t)
	for range cap(f.s.passwordWork) {
		f.s.passwordWork <- struct{}{}
	}
	w := f.call("POST", "/api/auth/login", `{"username":"operator","password":"incorrect"}`)
	if w.Code != 503 || w.Header().Get("Retry-After") == "" {
		t.Fatalf("overloaded authentication queued: %d %s", w.Code, w.Body)
	}
	for range cap(f.s.passwordWork) {
		<-f.s.passwordWork
	}
}
