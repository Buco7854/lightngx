// Package logs exposes nginx log files: listing from configured paths,
// chunked backwards reads for history, and live tailing.
package logs

import (
	"compress/gzip"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

var ErrNotAllowed = errors.New("log path not allowed")

type Store struct {
	paths []string
}

type File struct {
	Path    string    `json:"path"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
	Gzip    bool      `json:"gzip"`
}

// New builds a store from configured entries: each entry is a file or a
// directory scanned (non-recursively) for log files.
func New(paths []string) *Store {
	abs := make([]string, 0, len(paths))
	for _, p := range paths {
		if a, err := filepath.Abs(p); err == nil {
			abs = append(abs, a)
		}
	}
	return &Store{paths: abs}
}

func isLogName(name string) bool {
	return strings.Contains(name, ".log") || strings.HasSuffix(name, ".gz") ||
		strings.HasPrefix(name, "access") || strings.HasPrefix(name, "error")
}

// List returns every readable log file under the configured paths.
func (s *Store) List() []File {
	var out []File
	seen := map[string]bool{}
	add := func(path string, info os.FileInfo) {
		if seen[path] || !info.Mode().IsRegular() {
			return
		}
		seen[path] = true
		out = append(out, File{
			Path:    path,
			Size:    info.Size(),
			ModTime: info.ModTime(),
			Gzip:    strings.HasSuffix(path, ".gz"),
		})
	}
	for _, p := range s.paths {
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		if !info.IsDir() {
			add(p, info)
			continue
		}
		entries, err := os.ReadDir(p)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !isLogName(e.Name()) {
				continue
			}
			full := filepath.Join(p, e.Name())
			if info, err := os.Lstat(full); err == nil {
				add(full, info)
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out
}

// allowed verifies that path is a configured file or lives directly in a
// configured directory. Everything served by this package goes through it.
func (s *Store) allowed(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil || strings.Contains(path, "\x00") {
		return "", ErrNotAllowed
	}
	abs = filepath.Clean(abs)
	for _, p := range s.paths {
		ok := abs == p
		if !ok && filepath.Dir(abs) == p && isLogName(filepath.Base(abs)) {
			info, err := os.Stat(p)
			ok = err == nil && info.IsDir()
		}
		if !ok {
			continue
		}
		// Lstat, not Stat: reject symlinks too, so a log-named symlink
		// cannot point the reader at an arbitrary file outside the dir.
		if info, err := os.Lstat(abs); err != nil || !info.Mode().IsRegular() {
			return "", ErrNotAllowed
		}
		return abs, nil
	}
	return "", ErrNotAllowed
}

type Chunk struct {
	Lines  []string `json:"lines"`
	Offset int64    `json:"offset"` // byte offset of the first returned line
	Size   int64    `json:"size"`   // file size at read time
	AtEnd  bool     `json:"atEnd"`  // offset 0 reached (no older data)
}

// ReadTail reads up to maxBytes ending at `before` (file size if <=0),
// split into whole lines. Older history is fetched by passing the
// returned Offset as the next `before`.
func (s *Store) ReadTail(path string, before, maxBytes int64) (*Chunk, error) {
	abs, err := s.allowed(path)
	if err != nil {
		return nil, err
	}
	if strings.HasSuffix(abs, ".gz") {
		return s.readGzip(abs, maxBytes)
	}
	f, err := os.Open(abs)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	size := info.Size()
	if before <= 0 || before > size {
		before = size
	}
	start := before - maxBytes
	if start < 0 {
		start = 0
	}
	// Read one extra byte before start to detect a line-aligned boundary.
	readStart := start
	if start > 0 {
		readStart = start - 1
	}
	buf := make([]byte, before-readStart)
	if _, err := f.ReadAt(buf, readStart); err != nil && err != io.EOF {
		return nil, err
	}
	offset := start
	if start > 0 {
		if buf[0] == '\n' {
			buf = buf[1:]
		} else if i := strings.IndexByte(string(buf), '\n'); i >= 0 {
			// Chunk starts mid-line: drop the partial first line.
			offset = readStart + int64(i) + 1
			buf = buf[i+1:]
		} else {
			buf = nil
			offset = before
		}
	}
	text := strings.TrimSuffix(string(buf), "\n")
	var lines []string
	if text != "" {
		lines = strings.Split(text, "\n")
	}
	return &Chunk{Lines: lines, Offset: offset, Size: size, AtEnd: offset == 0}, nil
}

// readGzip decompresses a rotated log and returns its last maxBytes.
func (s *Store) readGzip(abs string, maxBytes int64) (*Chunk, error) {
	f, err := os.Open(abs)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	// Keep only the tail while streaming so memory stays bounded.
	keep := make([]byte, 0, maxBytes)
	buf := make([]byte, 64<<10)
	for {
		n, err := zr.Read(buf)
		if n > 0 {
			keep = append(keep, buf[:n]...)
			if int64(len(keep)) > maxBytes {
				keep = keep[int64(len(keep))-maxBytes:]
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
	}
	text := strings.TrimSuffix(string(keep), "\n")
	var lines []string
	if text != "" {
		lines = strings.Split(text, "\n")
		if len(lines) > 0 && int64(len(keep)) == maxBytes {
			lines = lines[1:]
		}
	}
	return &Chunk{Lines: lines, Offset: 0, Size: int64(len(keep)), AtEnd: true}, nil
}

// Follow streams appended lines until ctx is done. It polls the file so
// no filesystem-notification dependency is needed, and it survives
// truncation/rotation by reopening from the start of the new file.
func (s *Store) Follow(ctx context.Context, path string, from int64, send func(lines []string) error) error {
	abs, err := s.allowed(path)
	if err != nil {
		return err
	}
	if strings.HasSuffix(abs, ".gz") {
		return errors.New("cannot follow a compressed log")
	}
	offset := from
	var partial string
	ticker := time.NewTicker(700 * time.Millisecond)
	defer ticker.Stop()
	for {
		info, err := os.Stat(abs)
		if err == nil {
			size := info.Size()
			if size < offset {
				offset = 0 // truncated or rotated
				partial = ""
			}
			if size > offset {
				f, err := os.Open(abs)
				if err == nil {
					n := size - offset
					if n > 1<<20 {
						offset = size - 1<<20
						n = 1 << 20
						partial = ""
					}
					buf := make([]byte, n)
					if _, err := f.ReadAt(buf, offset); err == nil || err == io.EOF {
						offset += int64(len(buf))
						data := partial + string(buf)
						lines := strings.Split(data, "\n")
						partial = lines[len(lines)-1]
						lines = lines[:len(lines)-1]
						if len(lines) > 0 {
							if err := send(lines); err != nil {
								f.Close()
								return nil
							}
						}
					}
					f.Close()
				}
			}
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}
