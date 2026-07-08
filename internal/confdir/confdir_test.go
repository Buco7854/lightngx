package confdir

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func setup(t *testing.T) (*Dir, string) {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "conf.d"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "nginx.conf"), []byte("events {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	d, err := New(root, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	return d, root
}

func TestReadWrite(t *testing.T) {
	d, _ := setup(t)
	if _, err := d.Write("conf.d/site.conf", []byte("server {}\n")); err != nil {
		t.Fatal(err)
	}
	b, err := d.Read("conf.d/site.conf")
	if err != nil || string(b) != "server {}\n" {
		t.Fatalf("read back: %q err=%v", b, err)
	}
}

func TestEscapeRejected(t *testing.T) {
	d, _ := setup(t)
	for _, p := range []string{
		"../etc/passwd",
		"..",
		"conf.d/../../secret",
		"a\x00b",
		"",
	} {
		if _, err := d.Read(p); err == nil {
			t.Errorf("Read(%q) should fail", p)
		}
		if _, err := d.Write(p, []byte("x")); !errors.Is(err, ErrOutsideRoot) &&
			!errors.Is(err, os.ErrNotExist) && err == nil {
			t.Errorf("Write(%q) should fail, got %v", p, err)
		}
	}
}

func TestAbsolutePathConfined(t *testing.T) {
	d, root := setup(t)
	// A leading slash means "relative to the config root", never the host fs.
	if _, err := d.Write("/etc-like/passwd", []byte("x")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "etc-like/passwd")); err != nil {
		t.Error("file should have been created inside the root")
	}
}

func TestSymlinkEscapeRejected(t *testing.T) {
	d, root := setup(t)
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "target"), []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(outside, "target"), filepath.Join(root, "evil")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "evildir")); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Read("evil"); !errors.Is(err, ErrOutsideRoot) {
		t.Errorf("symlinked file read should be rejected, got %v", err)
	}
	if _, err := d.Read("evildir/target"); !errors.Is(err, ErrOutsideRoot) {
		t.Errorf("symlinked dir read should be rejected, got %v", err)
	}
	if _, err := d.Write("evil", []byte("x")); !errors.Is(err, ErrOutsideRoot) {
		t.Errorf("symlinked file write should be rejected, got %v", err)
	}
}

func TestInternalSymlinkFollowed(t *testing.T) {
	d, root := setup(t)
	if err := os.MkdirAll(filepath.Join(root, "sites-available"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "sites-enabled"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "sites-available/a.conf"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("../sites-available/a.conf", filepath.Join(root, "sites-enabled/a.conf")); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Write("sites-enabled/a.conf", []byte("new")); err != nil {
		t.Fatal(err)
	}
	// The symlink must survive and its target must hold the new content.
	if fi, err := os.Lstat(filepath.Join(root, "sites-enabled/a.conf")); err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Error("symlink was replaced by a regular file")
	}
	b, _ := os.ReadFile(filepath.Join(root, "sites-available/a.conf"))
	if string(b) != "new" {
		t.Errorf("target content = %q", b)
	}
}

func TestWriteRestore(t *testing.T) {
	d, root := setup(t)
	restore, err := d.Write("nginx.conf", []byte("broken"))
	if err != nil {
		t.Fatal(err)
	}
	if err := restore(); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(root, "nginx.conf"))
	if string(b) != "events {}\n" {
		t.Errorf("restore failed: %q", b)
	}

	restore, err = d.Write("conf.d/new.conf", []byte("x"))
	if err != nil {
		t.Fatal(err)
	}
	if err := restore(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "conf.d/new.conf")); !errors.Is(err, os.ErrNotExist) {
		t.Error("restore of a created file should remove it")
	}
}

func TestDeleteRestore(t *testing.T) {
	d, root := setup(t)
	restore, err := d.Delete("nginx.conf")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "nginx.conf")); err == nil {
		t.Fatal("file still exists after delete")
	}
	if err := restore(); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(root, "nginx.conf"))
	if string(b) != "events {}\n" {
		t.Errorf("restore failed: %q", b)
	}
}

func TestDeleteDirRestore(t *testing.T) {
	d, root := setup(t)
	if err := os.MkdirAll(filepath.Join(root, "snips/sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "snips/a.conf"), []byte("a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "snips/sub/b.conf"), []byte("b\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	restore, err := d.Delete("snips")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "snips")); err == nil {
		t.Fatal("dir still exists after delete")
	}
	if err := restore(); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(root, "snips/sub/b.conf"))
	if string(b) != "b\n" {
		t.Errorf("nested file not restored: %q", b)
	}
	if info, err := os.Stat(filepath.Join(root, "snips/sub/b.conf")); err != nil || info.Mode().Perm() != 0o600 {
		t.Errorf("restored mode wrong: %v %v", info, err)
	}
}

// A deleted directory can contain empty subdirs and symlinks; the rollback
// must recreate all three faithfully (symlinks as links, not their targets).
func TestDeleteDirRestoreNested(t *testing.T) {
	d, root := setup(t)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(os.MkdirAll(filepath.Join(root, "tree/empty"), 0o755))
	must(os.MkdirAll(filepath.Join(root, "tree/deep/deeper"), 0o755))
	must(os.WriteFile(filepath.Join(root, "tree/deep/deeper/x.conf"), []byte("x\n"), 0o644))
	must(os.WriteFile(filepath.Join(root, "tree/target.conf"), []byte("t\n"), 0o644))
	// Relative symlink pointing within the deleted subtree.
	must(os.Symlink("../target.conf", filepath.Join(root, "tree/deep/link.conf")))

	restore, err := d.Delete("tree")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(root, "tree")); err == nil {
		t.Fatal("tree still exists after delete")
	}
	if err := restore(); err != nil {
		t.Fatal(err)
	}
	// Empty subdir came back.
	if info, err := os.Stat(filepath.Join(root, "tree/empty")); err != nil || !info.IsDir() {
		t.Errorf("empty subdir not restored: %v %v", info, err)
	}
	// Deep nested file came back with content.
	if b, _ := os.ReadFile(filepath.Join(root, "tree/deep/deeper/x.conf")); string(b) != "x\n" {
		t.Errorf("deep file not restored: %q", b)
	}
	// Symlink came back as a link with its original target.
	li, err := os.Lstat(filepath.Join(root, "tree/deep/link.conf"))
	if err != nil || li.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("symlink not restored as a link: %v %v", li, err)
	}
	if tgt, _ := os.Readlink(filepath.Join(root, "tree/deep/link.conf")); tgt != "../target.conf" {
		t.Errorf("symlink target wrong: %q", tgt)
	}
}

func TestRenameDir(t *testing.T) {
	d, root := setup(t)
	if _, err := d.Rename("conf.d", "conf.d2"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "conf.d2")); err != nil {
		t.Fatalf("renamed dir missing: %v", err)
	}
}

func TestBinaryRejected(t *testing.T) {
	d, root := setup(t)
	if err := os.WriteFile(filepath.Join(root, "bin"), []byte{0x7f, 0x00, 0x01}, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Read("bin"); !errors.Is(err, ErrBinary) {
		t.Errorf("want ErrBinary, got %v", err)
	}
}
