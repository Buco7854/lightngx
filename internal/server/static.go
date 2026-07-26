package server

import (
	"bytes"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"
)

// staticHandler serves the embedded frontend with an index.html fallback
// so client-side navigation works, and long-lived caching for hashed
// asset files. Files are served directly (not via http.FileServer, whose
// /index.html redirect would fight the SPA fallback).
func (s *Server) staticHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" || p == "." {
			p = "index.html"
		}
		b, err := fs.ReadFile(s.static, p)
		if err != nil {
			p = "index.html"
			if b, err = fs.ReadFile(s.static, p); err != nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
		}
		if strings.HasPrefix(p, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		if ct := mime.TypeByExtension(path.Ext(p)); ct != "" {
			w.Header().Set("Content-Type", ct)
		}
		http.ServeContent(w, r, p, time.Time{}, bytes.NewReader(b))
	})
}
