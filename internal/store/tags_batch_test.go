package store

import (
	"errors"
	"reflect"
	"testing"
)

func TestBatchTagsPreserveOtherLabelsAndRollBack(t *testing.T) {
	s := open(t)
	a, err := s.SaveTag(Tag{Name: "a", Mode: "all", Rules: []byte(`[]`)})
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.SaveTag(Tag{Name: "b", Mode: "all", Rules: []byte(`[]`)})
	if err != nil {
		t.Fatal(err)
	}
	smart, err := s.SaveTag(Tag{Name: "smart", Mode: "all", Rules: []byte(`[{"field":"content","op":"contains","value":"x"}]`)})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetFileTags("a.conf", []int64{a.ID}); err != nil {
		t.Fatal(err)
	}
	if err := s.SetFileTags("b.conf", []int64{b.ID}); err != nil {
		t.Fatal(err)
	}
	paths := []string{"a.conf", "b.conf"}
	assert := func(want map[string][]int64) {
		t.Helper()
		got, err := s.FileTags()
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("assignments: %v, %v; want %v", got, err, want)
		}
	}
	original := map[string][]int64{"a.conf": {a.ID}, "b.conf": {b.ID}}
	for _, remove := range []bool{false, true} {
		if err := s.ChangeFileTags(paths, []int64{a.ID, smart.ID}, remove); !errors.Is(err, ErrAutomaticTag) {
			t.Fatalf("smart tag accepted: %v", err)
		}
		if err := s.ChangeFileTags(paths, []int64{a.ID, 9999}, remove); !errors.Is(err, ErrNotFound) {
			t.Fatalf("unknown tag accepted: %v", err)
		}
		assert(original)
	}
	// A failure on the second file must also undo the first file's change.
	if _, err := s.db.Exec(`CREATE TRIGGER fail_batch BEFORE INSERT ON file_tags WHEN NEW.path='b.conf' BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err := s.ChangeFileTags(paths, []int64{b.ID}, false); err == nil {
		t.Fatal("injected failure ignored")
	}
	assert(original)
	if _, err := s.db.Exec(`DROP TRIGGER fail_batch`); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := s.ChangeFileTags(paths, []int64{a.ID, a.ID}, false); err != nil {
			t.Fatal(err)
		}
	}
	assert(map[string][]int64{"a.conf": {a.ID}, "b.conf": {a.ID, b.ID}})
	counts, err := s.FileTagCounts(paths)
	if err != nil || counts[a.ID] != 2 || counts[b.ID] != 1 {
		t.Fatalf("coverage: %v %v", counts, err)
	}
	for range 2 {
		if err := s.ChangeFileTags(paths, []int64{a.ID}, true); err != nil {
			t.Fatal(err)
		}
	}
	assert(map[string][]int64{"b.conf": {b.ID}})
}
