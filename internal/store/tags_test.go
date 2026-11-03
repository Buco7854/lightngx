package store

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
)

func TestTagPersistenceAndFileLifecycle(t *testing.T) {
	s := open(t)
	a, err := s.SaveTag(Tag{Name: "Production", Mode: "all", Rules: json.RawMessage(`[]`)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveTag(Tag{Name: "production", Mode: "all", Rules: json.RawMessage(`[]`)}); !errors.Is(err, ErrExists) {
		t.Fatalf("duplicate: %v", err)
	}
	for _, p := range []string{"a_%/file", "a_%/nested/other", "aXsuffix/keep"} {
		if err := s.SetFileTags(p, []int64{a.ID, a.ID}); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.MoveFileTags("a_%", "copy", true); err != nil {
		t.Fatal(err)
	}
	if err := s.MoveFileTags("a_%", "moved", false); err != nil {
		t.Fatal(err)
	}
	got, err := s.FileTags()
	if err != nil {
		t.Fatal(err)
	}
	want := map[string][]int64{"copy/file": {a.ID}, "copy/nested/other": {a.ID}, "moved/file": {a.ID}, "moved/nested/other": {a.ID}, "aXsuffix/keep": {a.ID}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("lifecycle: %v", got)
	}
	if err := s.SetFileTags("copy/file", []int64{999999}); err == nil {
		t.Fatal("unknown tag accepted")
	}
	got, _ = s.FileTags()
	if !reflect.DeepEqual(got, want) {
		t.Fatal("failed assignment did not roll back")
	}
	if err := s.DeleteFileTags("moved"); err != nil {
		t.Fatal(err)
	}
	got, _ = s.FileTags()
	if len(got) != 3 {
		t.Fatalf("delete subtree: %v", got)
	}
	if err := s.DeleteTag(a.ID); err != nil {
		t.Fatal(err)
	}
	got, _ = s.FileTags()
	if len(got) != 0 {
		t.Fatalf("delete didn't cascade: %v", got)
	}
	if err := s.DeleteTag(a.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
}

func TestTagsSurviveReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tags.db")
	s, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	tag, err := s.SaveTag(Tag{Name: "saved", Mode: "all", Rules: json.RawMessage(`[]`)})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetFileTags("site.conf", []int64{tag.ID}); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	defs, err := s.ListTags()
	if err != nil || len(defs) != 1 || defs[0].Name != "saved" {
		t.Fatalf("definitions: %v, %v", defs, err)
	}
	files, err := s.FileTags()
	if err != nil || len(files["site.conf"]) != 1 {
		t.Fatalf("assignments: %v, %v", files, err)
	}
}
