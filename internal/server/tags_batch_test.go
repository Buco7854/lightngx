package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/Buco7854/lightngx/internal/auth"
	"github.com/Buco7854/lightngx/internal/confdir"
	"github.com/Buco7854/lightngx/internal/store"
)

func TestBatchTagsAPI(t *testing.T) {
	f := newSecurityFixture(t)
	root := t.TempDir()
	for _, name := range []string{"a.conf", "b.conf"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("server {}"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink("a.conf", filepath.Join(root, "alias")); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside")
	if err := os.WriteFile(outside, []byte("outside"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	var err error
	f.s.conf, err = confdir.New(root, 4096)
	if err != nil {
		t.Fatal(err)
	}
	manual, err := f.db.SaveTag(store.Tag{Name: "manual", Mode: "all", Rules: []byte(`[]`)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.SaveTag(store.Tag{Name: "smart", Mode: "all", Rules: []byte(`[{"field":"content","op":"contains","value":"server"}]`)}); err != nil {
		t.Fatal(err)
	}
	full, partial := f.cookie(t, auth.LevelFull), f.cookie(t, auth.LevelMFA)
	body := func(paths []string, ids []int64, op string) string {
		b, _ := json.Marshal(map[string]any{"paths": paths, "tags": ids, "operation": op})
		return string(b)
	}
	request := body([]string{"a.conf", "alias", "b.conf"}, []int64{manual.ID}, "add")
	for _, method := range []string{"POST", "PATCH"} {
		for _, cookies := range [][]*http.Cookie{nil, {partial}} {
			if w := f.call(method, "/api/config/tags/batch", request, cookies...); w.Code != 401 {
				t.Fatalf("unauthorized %s: %d %s", method, w.Code, w.Body)
			}
		}
	}
	if w := f.call("PATCH", "/api/config/tags/batch", request, full); w.Code != 200 {
		t.Fatalf("batch add: %d %s", w.Code, w.Body)
	}
	w := f.call("POST", "/api/config/tags/batch", request, full)
	var preview struct {
		Files int
		Tags  []struct {
			Name  string
			Count int
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &preview); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || preview.Files != 2 || len(preview.Tags) != 1 || preview.Tags[0].Name != "manual" || preview.Tags[0].Count != 2 {
		t.Fatalf("preview: %d %s", w.Code, w.Body)
	}
	original, err := f.db.FileTags()
	if err != nil {
		t.Fatal(err)
	}
	for _, paths := range [][]string{{"b.conf", "escape"}, {"a.conf", "missing"}, {"a.conf", ".."}, {"a.conf", "../outside"}} {
		w := f.call("PATCH", "/api/config/tags/batch", body(paths, []int64{manual.ID}, "remove"), full)
		if w.Code < 400 {
			t.Fatalf("invalid paths accepted: %d %s", w.Code, w.Body)
		}
		got, err := f.db.FileTags()
		if err != nil || !reflect.DeepEqual(got, original) {
			t.Fatalf("partial update: %v %v", got, err)
		}
	}
	for _, invalid := range []string{`{}`, body(make([]string, 201), []int64{manual.ID}, "add"), body([]string{"a.conf"}, make([]int64, 129), "add"), body([]string{"a.conf"}, []int64{manual.ID}, "replace"), body([]string{"a.conf"}, nil, "add")} {
		if w := f.call("PATCH", "/api/config/tags/batch", invalid, full); w.Code != 400 {
			t.Fatalf("invalid batch accepted: %d %s", w.Code, w.Body)
		}
	}
	// The real handler's CSRF middleware protects this mutation too.
	r, _ := http.NewRequest("PATCH", "https://example.test/api/config/tags/batch", strings.NewReader(request))
	r.Header.Set("Origin", "https://attacker.test")
	r.AddCookie(full)
	w = httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("cross-origin batch: %d", w.Code)
	}
}
