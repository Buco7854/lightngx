package tags

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/Buco7854/lightngx/internal/confdir"
	"github.com/Buco7854/lightngx/internal/store"
)

func TestMatchingAndInvalidation(t *testing.T) {
	root := t.TempDir()
	db, err := store.Open(filepath.Join(t.TempDir(), "tags.db"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	dir, err := confdir.New(root, 1024)
	if err != nil {
		t.Fatal(err)
	}
	path := "sites-available/blog.conf"
	if err := os.MkdirAll(filepath.Join(root, "sites-available"), 0755); err != nil {
		t.Fatal(err)
	}
	write := func(content string) {
		t.Helper()
		if _, err := dir.Write(path, []byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	save := func(name, mode string, rules []Rule) store.Tag {
		t.Helper()
		b, _ := json.Marshal(rules)
		tag := store.Tag{Name: name, Mode: mode, Rules: b}
		if err := Validate(&tag); err != nil {
			t.Fatal(err)
		}
		tag, err := db.SaveTag(tag)
		if err != nil {
			t.Fatal(err)
		}
		return tag
	}
	manual := save("production", "all", nil)
	smart := save("proxy", "all", []Rule{{Field: "content", Op: "contains", Value: "proxy_pass", IgnoreCase: true}, {Field: "path", Op: "regex", Value: `sites-available/.*\.conf$`}})
	any := save("either", "any", []Rule{{Field: "content", Op: "contains", Value: "absent"}, {Field: "path", Op: "contains", Value: "blog"}})
	if err := db.SetFileTags(path, []int64{manual.ID, smart.ID}); err != nil {
		t.Fatal(err)
	}
	write("server { PROXY_PASS http://app; }")
	var engine Engine
	match := func(path string) []int64 {
		t.Helper()
		s, err := engine.Snapshot(db)
		if err != nil {
			t.Fatal(err)
		}
		return s.Match(dir, path)
	}
	got := match(path)
	for _, id := range []int64{manual.ID, smart.ID, any.ID} {
		if !slices.Contains(got, id) {
			t.Fatalf("missing %d in %v", id, got)
		}
	}
	snapshot, err := engine.Snapshot(db)
	if err != nil {
		t.Fatal(err)
	}
	automatic := snapshot.Automatic(dir, path)
	if slices.Contains(automatic, manual.ID) || !slices.Contains(automatic, smart.ID) {
		t.Fatalf("incorrect automatic sources: %v", automatic)
	}
	if len(got) != 3 {
		t.Fatalf("duplicates in %v", got)
	}
	if err := os.Symlink(path, filepath.Join(root, "alias")); err != nil {
		t.Fatal(err)
	}
	if got := match("alias"); len(got) != 3 {
		t.Fatalf("alias tags: %v", got)
	}
	if err := db.SetFileTags(path, []int64{manual.ID}); err != nil {
		t.Fatal(err)
	}
	write("server {}")
	if got := match(path); slices.Contains(got, smart.ID) {
		t.Fatalf("stale cache after save: %v", got)
	}
	smart.Rules = json.RawMessage(`[{"field":"content","op":"contains","value":"server"}]`)
	if _, err := db.SaveTag(smart); err != nil {
		t.Fatal(err)
	}
	if got := match(path); !slices.Contains(got, smart.ID) {
		t.Fatalf("stale cache after rule change: %v", got)
	}
	if err := os.WriteFile(filepath.Join(root, path), []byte("empty!"), 0644); err != nil {
		t.Fatal(err)
	}
	if got := match(path); slices.Contains(got, smart.ID) {
		t.Fatalf("external edit kept smart tag: %v", got)
	}
	if err := os.WriteFile(filepath.Join(root, "binary"), []byte{0, 1}, 0644); err != nil {
		t.Fatal(err)
	}
	if got := match("binary"); len(got) != 0 {
		t.Fatalf("binary matched: %v", got)
	}
	if err := os.WriteFile(filepath.Join(root, "large"), make([]byte, 2048), 0644); err != nil {
		t.Fatal(err)
	}
	if got := match("large"); len(got) != 0 {
		t.Fatalf("oversized content matched: %v", got)
	}
	outside := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(outside, []byte("server proxy_pass"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "outside")); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"outside", "../secret", "sites-available"} {
		if got := match(p); len(got) != 0 {
			t.Fatalf("unsafe match %s: %v", p, got)
		}
	}
}

func TestRuleValidation(t *testing.T) {
	for _, tc := range []struct{ name, mode, rules string }{
		{"", "all", "[]"}, {"x\n", "all", "[]"}, {"x", "other", "[]"}, {"x", "all", `[{"field":"content","op":"regex","value":"["}]`},
		{"x", "all", `[{"field":"content","op":"contains","value":" "}]`}, {"x", "all", `[{"field":"shell","op":"exec","value":"id"}]`},
	} {
		tag := store.Tag{Name: tc.name, Mode: tc.mode, Rules: json.RawMessage(tc.rules)}
		if Validate(&tag) == nil {
			t.Fatalf("accepted invalid tag %+v", tc)
		}
	}
	rules := make([]Rule, 17)
	b, _ := json.Marshal(rules)
	tag := store.Tag{Name: "x", Mode: "all", Rules: b}
	if Validate(&tag) == nil {
		t.Fatal("accepted too many rules")
	}
}

func BenchmarkCachedMatch(b *testing.B) {
	root := b.TempDir()
	os.WriteFile(filepath.Join(root, "site"), []byte("proxy_pass http://app;"), 0644)
	db, err := store.Open(filepath.Join(b.TempDir(), "db"), nil)
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()
	db.SaveTag(store.Tag{Name: "proxy", Mode: "all", Rules: json.RawMessage(`[{"field":"content","op":"contains","value":"proxy_pass"}]`)})
	dir, _ := confdir.New(root, 1024)
	var engine Engine
	snap, _ := engine.Snapshot(db)
	snap.Match(dir, "site")
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		snap.Match(dir, "site")
	}
}
