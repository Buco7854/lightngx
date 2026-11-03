package server

import (
	"errors"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/Buco7854/lightngx/internal/confdir"
	"github.com/Buco7854/lightngx/internal/store"
	"github.com/Buco7854/lightngx/internal/tags"
)

func tagError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, store.ErrAutomaticTag) {
		status = http.StatusBadRequest
	}
	if errors.Is(err, store.ErrNotFound) {
		status = http.StatusNotFound
	}
	if errors.Is(err, store.ErrExists) {
		status = http.StatusConflict
	}
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
func (s *Server) handleTags(w http.ResponseWriter, r *http.Request) {
	s.mutate.Lock()
	defer s.mutate.Unlock()
	db := s.accounts.Store()
	if r.Method == http.MethodGet {
		list, err := db.ListTags()
		if err != nil {
			tagError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"tags": list})
		return
	}
	var id int64
	if r.PathValue("id") != "" {
		var err error
		id, err = strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || id <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid tag ID"})
			return
		}
	}
	if r.Method == http.MethodDelete {
		if err := db.DeleteTag(id); err != nil {
			tagError(w, err)
			return
		}
		s.audit(r, "tag.deleted", "id", id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
		return
	}
	var t store.Tag
	if !readJSON(w, r, &t, 128<<10) {
		return
	}
	t.ID = id
	if err := tags.Validate(&t); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if id == 0 {
		all, err := db.ListTags()
		if err != nil {
			tagError(w, err)
			return
		}
		if len(all) >= 128 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "maximum of 128 tags reached"})
			return
		}
	}
	t, err := db.SaveTag(t)
	if err != nil {
		tagError(w, err)
		return
	}
	s.audit(r, "tag.saved", "id", t.ID)
	writeJSON(w, http.StatusOK, t)
}
func (s *Server) handleFileTags(w http.ResponseWriter, r *http.Request) {
	s.mutate.Lock()
	defer s.mutate.Unlock()
	path := r.URL.Query().Get("path")
	key, _, err := s.conf.FileInfo(path)
	if err != nil {
		writeJSON(w, statusFor(err), map[string]string{"error": err.Error()})
		return
	}
	db := s.accounts.Store()
	if r.Method == http.MethodPut {
		var req struct {
			Tags []int64 `json:"tags"`
		}
		if !readJSON(w, r, &req, 4096) {
			return
		}
		defs, err := db.ListTags()
		if err != nil {
			tagError(w, err)
			return
		}
		known := map[int64]store.Tag{}
		for _, t := range defs {
			known[t.ID] = t
		}
		if len(req.Tags) > 128 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "too many tags"})
			return
		}
		for _, id := range req.Tags {
			tag, exists := known[id]
			if !exists {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown tag"})
				return
			}
			if tag.Smart() {
				tagError(w, store.ErrAutomaticTag)
				return
			}
		}
		if err := db.SetFileTags(key, req.Tags); err != nil {
			tagError(w, err)
			return
		}
		s.audit(r, "config.tags", "path", key)
	}
	snap, err := s.tags.Snapshot(db)
	if err != nil {
		tagError(w, err)
		return
	}
	manual, err := db.FileTags()
	if err != nil {
		tagError(w, err)
		return
	}
	ids := manual[key]
	if ids == nil {
		ids = []int64{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"manual": ids, "tags": snap.Match(s.conf, key), "automatic": snap.Automatic(s.conf, key)})
}

// metadataPath follows parent aliases but preserves the final entry: renaming
// or deleting a symlink must never move or erase its target's manual labels.
func (s *Server) metadataPath(path string) string {
	abs, err := s.conf.EntryPath(path)
	if err != nil {
		return path
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(abs))
	if err != nil {
		return path
	}
	rel, err := filepath.Rel(s.conf.Root(), filepath.Join(parent, filepath.Base(abs)))
	if err != nil {
		return path
	}
	return filepath.ToSlash(rel)
}

func decorateTree(entry *confdir.Entry, snap *tags.Snapshot, dir *confdir.Dir) {
	if !entry.IsDir && !entry.External {
		entry.Tags = snap.Match(dir, entry.Path)
	}
	for i := range entry.Children {
		decorateTree(&entry.Children[i], snap, dir)
	}
}

// metadataChange runs only after nginx validation. If persisting metadata fails,
// restore the filesystem mutation before returning to the caller.
func (s *Server) metadataChange(w http.ResponseWriter, change func() error, restore func() error) bool {
	if err := change(); err != nil {
		if rollbackErr := restore(); rollbackErr != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "metadata update and filesystem rollback failed; fix manually"})
		} else {
			tagError(w, err)
		}
		return false
	}
	return true
}

func (s *Server) vhostPath(kind, name string) string {
	mgr, _ := s.vhostKind(kind)
	if mgr == nil {
		return ""
	}
	rel, err := filepath.Rel(s.conf.Root(), mgr.FilePath(name))
	if err != nil {
		return ""
	}
	return filepath.ToSlash(rel)
}
