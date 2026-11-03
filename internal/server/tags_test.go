package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Buco7854/lightngx/internal/accounts"
	"github.com/Buco7854/lightngx/internal/auth"
	"github.com/Buco7854/lightngx/internal/confdir"
	"github.com/Buco7854/lightngx/internal/config"
	"github.com/Buco7854/lightngx/internal/nginxctl"
	"github.com/Buco7854/lightngx/internal/sites"
	"github.com/Buco7854/lightngx/internal/store"
)

func TestTagsAPIAndConfigRollback(t *testing.T) {
	root := t.TempDir()
	for _, dir := range []string{"sites-available", "sites-enabled"} {
		if err := os.Mkdir(filepath.Join(root, dir), 0755); err != nil {
			t.Fatal(err)
		}
	}
	db, err := store.Open(filepath.Join(t.TempDir(), "db"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	cfg := &config.Config{MaxEditSize: 4096}
	acct, err := accounts.New(db, cfg)
	if err != nil {
		t.Fatal(err)
	}
	conf, err := confdir.New(root, 4096)
	if err != nil {
		t.Fatal(err)
	}
	sessions := auth.NewSessions([]byte("01234567890123456789012345678901"), time.Hour, func(*http.Request) bool { return false })
	s := New(cfg, sessions, nil, nginxctl.New("/bin/true", "", "", false, false), conf, nil, sites.New(filepath.Join(root, "sites-available"), filepath.Join(root, "sites-enabled"), filepath.Join(root, ".lightngx"), ""), nil, acct, nil, nil)
	handler := s.Handler()
	cookie := func(level string) *http.Cookie {
		rec := httptest.NewRecorder()
		if err := sessions.Issue(rec, httptest.NewRequest("GET", "http://example.test", nil), auth.Session{User: "tester", Role: "user", Method: "oidc", Level: level}); err != nil {
			t.Fatal(err)
		}
		return rec.Result().Cookies()[0]
	}
	full, partial := cookie(auth.LevelFull), cookie(auth.LevelMFA)
	call := func(method, path, body string, c *http.Cookie, want int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, "http://example.test"+path, bytes.NewBufferString(body))
		r.Header.Set("Origin", "http://example.test")
		if c != nil {
			r.AddCookie(c)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s: %d %s, want %d", method, path, w.Code, w.Body, want)
		}
		return w
	}
	call("GET", "/api/tags", "", nil, 401)
	call("POST", "/api/tags", `{"name":"hidden","mode":"all","rules":[]}`, partial, 401)
	w := call("POST", "/api/tags", `{"name":"proxy","mode":"all","rules":[{"field":"content","op":"contains","value":"proxy_pass"}]}`, full, 200)
	var tag store.Tag
	if err := json.Unmarshal(w.Body.Bytes(), &tag); err != nil {
		t.Fatal(err)
	}
	call("POST", "/api/tags", `{"name":"PROXY","mode":"all","rules":[]}`, full, 409)
	call("POST", "/api/tags", `{"name":"bad","mode":"all","rules":[{"field":"content","op":"regex","value":"["}]}`, full, 400)
	call("PUT", "/api/config/file", `{"path":"sites-available/blog","content":"proxy_pass http://app;"}`, full, 200)
	smartIDs, _ := json.Marshal(map[string]any{"tags": []int64{tag.ID}})
	call("PUT", "/api/config/tags?path=sites-available/blog", string(smartIDs), full, 400)
	w = call("POST", "/api/tags", `{"name":"production","mode":"all","rules":[]}`, full, 200)
	var manual store.Tag
	if err := json.Unmarshal(w.Body.Bytes(), &manual); err != nil {
		t.Fatal(err)
	}
	ids, _ := json.Marshal(map[string]any{"tags": []int64{manual.ID}})
	call("PUT", "/api/config/tags?path=sites-available/blog", string(ids), full, 200)
	// Mixed batches reject the smart tag without erasing valid manual labels.
	mixed, _ := json.Marshal(map[string]any{"tags": []int64{manual.ID, tag.ID}})
	call("PUT", "/api/config/tags?path=sites-available/blog", string(mixed), full, 400)
	call("PUT", "/api/config/tags?path=../escape", string(ids), full, 403)
	call("PUT", "/api/config/tags?path=sites-available/blog", `{"tags":[999]}`, full, 400)
	w = call("GET", "/api/vhosts/sites", "", full, 200)
	var listing struct {
		Sites []sites.Site `json:"sites"`
	}
	json.Unmarshal(w.Body.Bytes(), &listing)
	if len(listing.Sites) != 1 || len(listing.Sites[0].Tags) != 2 {
		t.Fatalf("list missing tags: %s", w.Body)
	}
	// Failed validation must leave both file and labels at the original path.
	s.nginx = nginxctl.New("/bin/false", "", "", false, false)
	call("POST", "/api/config/rename", `{"from":"sites-available/blog","to":"sites-available/moved"}`, full, 422)
	got, _ := db.FileTags()
	if len(got["sites-available/blog"]) != 1 || len(got) != 1 {
		t.Fatalf("rollback metadata: %v", got)
	}
	s.nginx = nginxctl.New("/bin/true", "", "", false, false)
	call("POST", "/api/vhosts/sites/clone", `{"name":"blog","newName":"copy"}`, full, 200)
	call("POST", "/api/config/rename", `{"from":"sites-available/blog","to":"sites-available/moved"}`, full, 200)
	got, _ = db.FileTags()
	if len(got["sites-available/moved"]) != 1 || len(got["sites-available/copy"]) != 1 || len(got) != 2 {
		t.Fatalf("rename/clone metadata: %v", got)
	}
	call("DELETE", "/api/config/file?path=sites-available/moved", "", full, 200)
	got, _ = db.FileTags()
	if len(got) != 1 || len(got["sites-available/copy"]) != 1 {
		t.Fatalf("delete metadata: %v", got)
	}
	call("GET", "/api/config/tree", "", full, 200)
	// A cross-origin request must not edit labels.
	r := httptest.NewRequest("PUT", "http://example.test/api/config/tags?path=sites-available/copy", bytes.NewBuffer(ids))
	r.AddCookie(full)
	r.Header.Set("Origin", "https://other.test")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, r)
	if rec.Code != 403 {
		t.Fatalf("CSRF allowed: %d", rec.Code)
	}
	// Configured available-directory names must use the actual source path.
	call("POST", "/api/config/rename", `{"from":"sites-available","to":"vhosts"}`, full, 200)
	s.sites = sites.New(filepath.Join(root, "vhosts"), filepath.Join(root, "sites-enabled"), filepath.Join(root, ".lightngx"), "")
	w = call("GET", "/api/vhosts/sites", "", full, 200)
	if err := json.Unmarshal(w.Body.Bytes(), &listing); err != nil {
		t.Fatal(err)
	}
	if len(listing.Sites) != 1 || listing.Sites[0].Path != "vhosts/copy" || len(listing.Sites[0].Tags) != 2 {
		t.Fatalf("custom source path: %s", w.Body)
	}
	// A metadata persistence failure must restore a validated filesystem change.
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	call("DELETE", "/api/config/file?path=vhosts/copy", "", full, 500)
	if b, err := os.ReadFile(filepath.Join(root, "vhosts/copy")); err != nil || string(b) != "proxy_pass http://app;" {
		t.Fatalf("storage failure lost file: %q, %v", b, err)
	}

}
