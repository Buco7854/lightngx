package server

import (
	"net/http"

	"github.com/Buco7854/lightngx/internal/store"
)

const maxTagBatchFiles = 200

// POST previews coverage; PATCH adds or removes manual labels. Resolve every
// path before writing so a missing or external file cannot cause partial work.
func (s *Server) handleBatchFileTags(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Paths     []string `json:"paths"`
		Tags      []int64  `json:"tags"`
		Operation string   `json:"operation"`
	}
	if !readJSON(w, r, &req, 256<<10) {
		return
	}
	if len(req.Paths) == 0 || len(req.Paths) > maxTagBatchFiles || len(req.Tags) > 128 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "select between 1 and 200 files and at most 128 tags"})
		return
	}
	if r.Method == http.MethodPatch && (len(req.Tags) == 0 || (req.Operation != "add" && req.Operation != "remove")) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "choose tags and an add or remove operation"})
		return
	}
	s.mutate.Lock()
	defer s.mutate.Unlock()
	paths := make([]string, 0, len(req.Paths))
	seen := map[string]bool{}
	for _, path := range req.Paths {
		key, _, err := s.conf.FileInfo(path)
		if err != nil {
			writeJSON(w, statusFor(err), map[string]string{"error": err.Error()})
			return
		}
		if !seen[key] {
			paths = append(paths, key)
			seen[key] = true
		}
	}
	db := s.accounts.Store()
	if r.Method == http.MethodPatch {
		if err := db.ChangeFileTags(paths, req.Tags, req.Operation == "remove"); err != nil {
			tagError(w, err)
			return
		}
		s.audit(r, "config.tags.batch", "paths", paths, "operation", req.Operation, "tags", req.Tags)
		writeJSON(w, http.StatusOK, map[string]any{"files": len(paths)})
		return
	}
	defs, err := db.ListTags()
	if err != nil {
		tagError(w, err)
		return
	}
	counts, err := db.FileTagCounts(paths)
	if err != nil {
		tagError(w, err)
		return
	}
	type coverage struct {
		store.Tag
		Count int `json:"count"`
	}
	manual := []coverage{}
	for _, tag := range defs {
		if !tag.Smart() {
			manual = append(manual, coverage{tag, counts[tag.ID]})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": len(paths), "tags": manual})
}
