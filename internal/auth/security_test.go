package auth

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Buco7854/lightngx/internal/store"
	"golang.org/x/oauth2"
)

func TestCorruptKeysAreNeverOverwritten(t *testing.T) {
	for _, name := range []string{"data.key", "session.key"} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, name)
			if err := os.WriteFile(path, []byte("damaged-key"), 0600); err != nil {
				t.Fatal(err)
			}
			var err error
			if name == "data.key" {
				_, err = LoadOrCreateDataKey(dir)
			} else {
				_, err = LoadOrCreateSecret("", dir)
			}
			if err == nil {
				t.Fatal("invalid key silently replaced")
			}
			b, err := os.ReadFile(path)
			if err != nil || string(b) != "damaged-key" {
				t.Fatal("original key overwritten")
			}
		})
	}
}

func TestOIDCStateIsConsumedBeforeCodeExchange(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "db"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var exchanges atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		exchanges.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(400)
		w.Write([]byte(`{"error":"invalid_grant"}`))
	}))
	defer provider.Close()
	o := &OIDC{sessions: NewSessions([]byte("01234567890123456789012345678901"), time.Hour, insecure), challenges: db, oauth: oauth2.Config{ClientID: "client", Endpoint: oauth2.Endpoint{AuthURL: provider.URL + "/authorize", TokenURL: provider.URL + "/token", AuthStyle: oauth2.AuthStyleInParams}}}
	w := httptest.NewRecorder()
	o.Begin(w, httptest.NewRequest("GET", "https://example.test/api/auth/oidc/login", nil))
	if w.Code != 302 {
		t.Fatalf("begin: %d %s", w.Code, w.Body)
	}
	target, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	request := func() *http.Request {
		r := httptest.NewRequest("GET", "https://example.test/api/auth/oidc/callback?state="+url.QueryEscape(target.Query().Get("state"))+"&code=invalid", nil)
		r.AddCookie(w.Result().Cookies()[0])
		return r
	}
	if _, _, err := o.Callback(httptest.NewRecorder(), request()); err == nil {
		t.Fatal("invalid provider code accepted")
	}
	if _, _, err := o.Callback(httptest.NewRecorder(), request()); err == nil {
		t.Fatal("state replay accepted")
	}
	if exchanges.Load() != 1 {
		t.Fatalf("replayed state made %d exchanges", exchanges.Load())
	}
}
