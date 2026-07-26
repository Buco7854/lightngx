package logs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestListAndAllowed(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "access.log"), []byte("a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("x\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := New([]string{dir})
	files := s.List()
	if len(files) != 1 || filepath.Base(files[0].Path) != "access.log" {
		t.Fatalf("List() = %+v", files)
	}
	if _, err := s.ReadTail(filepath.Join(dir, "notes.txt"), 0, 1024); !errors.Is(err, ErrNotAllowed) {
		t.Errorf("non-log file should be rejected, got %v", err)
	}
	if _, err := s.ReadTail("/etc/passwd", 0, 1024); !errors.Is(err, ErrNotAllowed) {
		t.Errorf("outside path should be rejected, got %v", err)
	}
	if _, err := s.ReadTail(dir+"/../"+filepath.Base(dir)+"/access.log", 0, 1024); err != nil {
		t.Errorf("clean path should be allowed after normalization, got %v", err)
	}
}

func TestReadTailPaging(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "access.log")
	content := "line1\nline2\nline3\nline4\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	s := New([]string{dir})

	chunk, err := s.ReadTail(path, 0, 12)
	if err != nil {
		t.Fatal(err)
	}
	if len(chunk.Lines) != 2 || chunk.Lines[0] != "line3" || chunk.Lines[1] != "line4" {
		t.Fatalf("tail lines = %v", chunk.Lines)
	}
	if chunk.AtEnd {
		t.Error("should not be at end yet")
	}

	older, err := s.ReadTail(path, chunk.Offset, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if len(older.Lines) != 2 || older.Lines[0] != "line1" || !older.AtEnd {
		t.Fatalf("older chunk = %+v", older)
	}
}

func TestFollow(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "error.log")
	if err := os.WriteFile(path, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := New([]string{dir})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	got := make(chan []string, 4)
	go func() {
		_ = s.Follow(ctx, path, 4, func(lines []string) error {
			got <- lines
			return nil
		})
	}()

	time.Sleep(100 * time.Millisecond)
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	f.WriteString("new1\nnew2\n")
	f.Close()

	select {
	case lines := <-got:
		if len(lines) != 2 || lines[0] != "new1" {
			t.Fatalf("lines = %v", lines)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for followed lines")
	}
}
