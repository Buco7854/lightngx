package tags

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
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
	if err := db.SetFileTags(path, []int64{manual.ID}); err != nil {
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
		{"x", "all", `[{"field":"content","op":"not_regex","value":"["}]`},
		{"x", "all", `[{"field":"content","op":"not_regex","value":"foo(?!bar)"}]`},
		{"x", "all", `[{"field":"content","op":"not_contains","value":" "}]`},
		{"x", "all", `[{"field":"content","op":"exclude","value":"server"}]`},
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

func TestNegativeRules(t *testing.T) {
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
	if err := os.Mkdir(filepath.Join(root, "sites-available"), 0755); err != nil {
		t.Fatal(err)
	}
	const path = "sites-available/blog.conf"
	for name, content := range map[string]string{
		path:     "server {\n PROXY_PASS http://app;\n include snippets/auth-gate.conf;\n}\n",
		"empty":  "",
		"binary": "server\x00",
		"large":  strings.Repeat("x", 2048),
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "unreadable"), []byte("server {}"), 0000); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(t.TempDir(), "outside"), filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	var engine Engine
	for _, tc := range []struct {
		name, path, mode string
		rules            []Rule
		want             bool
	}{
		{"content literal absent", path, "all", []Rule{{Field: "content", Op: "not_contains", Value: "ssl_certificate"}}, true},
		{"content literal present", path, "all", []Rule{{Field: "content", Op: "not_contains", Value: "auth-gate.conf"}}, false},
		{"literal case sensitive", path, "all", []Rule{{Field: "content", Op: "not_contains", Value: "proxy_pass"}}, true},
		{"literal ignore case", path, "all", []Rule{{Field: "content", Op: "not_contains", Value: "proxy_pass", IgnoreCase: true}}, false},
		{"regex absent", path, "all", []Rule{{Field: "content", Op: "not_regex", Value: `ssl_certificate\s+`}}, true},
		{"regex present", path, "all", []Rule{{Field: "content", Op: "not_regex", Value: `include\s+snippets/auth-gate\.conf;`}}, false},
		{"regex case sensitive", path, "all", []Rule{{Field: "content", Op: "not_regex", Value: `proxy_pass\s+https?://`}}, true},
		{"regex ignore case", path, "all", []Rule{{Field: "content", Op: "not_regex", Value: `proxy_pass\s+https?://`, IgnoreCase: true}}, false},
		{"regex negates entire contents", path, "all", []Rule{{Field: "content", Op: "not_regex", Value: `(?m)^\s*include\s+`}}, false},
		{"regex matching empty text", "empty", "all", []Rule{{Field: "content", Op: "not_regex", Value: `^$`}}, false},
		{"path literal absent", path, "all", []Rule{{Field: "path", Op: "not_contains", Value: "streams-available/"}}, true},
		{"path literal ignore case", path, "all", []Rule{{Field: "path", Op: "not_contains", Value: "BLOG", IgnoreCase: true}}, false},
		{"path regex absent", path, "all", []Rule{{Field: "path", Op: "not_regex", Value: `\.bak$`}}, true},
		{"path regex ignore case", path, "all", []Rule{{Field: "path", Op: "not_regex", Value: `BLOG\.CONF$`, IgnoreCase: true}}, false},
		{"all mixed matches", path, "all", []Rule{{Field: "content", Op: "not_contains", Value: "ssl_certificate"}, {Field: "path", Op: "contains", Value: "sites-available/"}}, true},
		{"all mixed rejects", path, "all", []Rule{{Field: "content", Op: "not_contains", Value: "auth-gate.conf"}, {Field: "path", Op: "regex", Value: `\.conf$`}}, false},
		{"any mixed matches", path, "any", []Rule{{Field: "content", Op: "not_regex", Value: `ssl_certificate`}, {Field: "path", Op: "contains", Value: "streams-available/"}}, true},
		{"any mixed rejects", path, "any", []Rule{{Field: "content", Op: "not_regex", Value: `auth-gate`}, {Field: "path", Op: "contains", Value: "streams-available/"}}, false},
		{"path can match binary", "binary", "all", []Rule{{Field: "path", Op: "not_contains", Value: ".bak"}}, true},
		{"path can match oversized", "large", "all", []Rule{{Field: "path", Op: "not_regex", Value: `\.bak$`}}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b, _ := json.Marshal(tc.rules)
			tag := store.Tag{Name: tc.name, Mode: tc.mode, Rules: b}
			if err := Validate(&tag); err != nil {
				t.Fatal(err)
			}
			tag, err := db.SaveTag(tag)
			if err != nil {
				t.Fatal(err)
			}
			snap, err := engine.Snapshot(db)
			if err != nil {
				t.Fatal(err)
			}
			for range 2 { // Cold match and cached result must agree.
				if got := slices.Contains(snap.Automatic(dir, tc.path), tag.ID); got != tc.want {
					t.Fatalf("match = %v, want %v", got, tc.want)
				}
			}
		})
	}
	for _, op := range []string{"not_contains", "not_regex"} {
		t.Run(op+" requires readable contents", func(t *testing.T) {
			b, _ := json.Marshal([]Rule{{Field: "content", Op: op, Value: "absent"}})
			tag, err := db.SaveTag(store.Tag{Name: op, Mode: "all", Rules: b})
			if err != nil {
				t.Fatal(err)
			}
			snap, err := engine.Snapshot(db)
			if err != nil {
				t.Fatal(err)
			}
			for _, path := range []string{"binary", "large", "missing", "escape", "../outside", "sites-available"} {
				if slices.Contains(snap.Automatic(dir, path), tag.ID) {
					t.Errorf("unknown contents falsely matched: %s", path)
				}
			}
			// Root can read mode-000 files; assert permission failures when enforced.
			if _, err := os.ReadFile(filepath.Join(root, "unreadable")); os.IsPermission(err) {
				if slices.Contains(snap.Automatic(dir, "unreadable"), tag.ID) {
					t.Error("unreadable contents falsely matched")
				}
			}
			if !slices.Contains(snap.Automatic(dir, "empty"), tag.ID) {
				t.Error("readable empty file should match an absent snippet")
			}
		})
	}
}

func TestNegativeRuleCacheInvalidation(t *testing.T) {
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
	tag, err := db.SaveTag(store.Tag{Name: "missing auth", Mode: "all", Rules: json.RawMessage(`[{"field":"content","op":"not_contains","value":"auth-gate"}]`)})
	if err != nil {
		t.Fatal(err)
	}
	var engine Engine
	check := func(want bool) {
		t.Helper()
		snap, err := engine.Snapshot(db)
		if err != nil {
			t.Fatal(err)
		}
		if got := slices.Contains(snap.Match(dir, "blog"), tag.ID); got != want {
			t.Fatalf("match = %v, want %v", got, want)
		}
	}
	for _, content := range []string{"server {}", "include auth-gate;", "server {}"} {
		if _, err := dir.Write("blog", []byte(content)); err != nil {
			t.Fatal(err)
		}
		check(!strings.Contains(content, "auth-gate"))
	}
	// Switching polarity must invalidate cached IDs even when the file is unchanged.
	tag.Rules = json.RawMessage(`[{"field":"content","op":"contains","value":"auth-gate"}]`)
	if _, err := db.SaveTag(tag); err != nil {
		t.Fatal(err)
	}
	check(false)
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
