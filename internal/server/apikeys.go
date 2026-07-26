package server

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/Buco7854/lightngx/internal/auth"
	"github.com/Buco7854/lightngx/internal/store"
)

// apiKeyScopes is the closed set of actions an API key may be granted. Keys
// are intentionally confined to nginx operations — never config editing,
// log reading or account management — so a leaked key cannot escalate to
// the full UI surface. Extend this list to widen what keys can do.
var apiKeyScopes = []string{"nginx:status", "nginx:test", "nginx:reload", "nginx:restart"}

func validScope(s string) bool {
	for _, v := range apiKeyScopes {
		if v == s {
			return true
		}
	}
	return false
}

type apiKeyCtxKey int

const apiKeyKey apiKeyCtxKey = 0

func withAPIKey(ctx context.Context, k store.APIKey) context.Context {
	return context.WithValue(ctx, apiKeyKey, k)
}

func apiKeyFrom(ctx context.Context) (store.APIKey, bool) {
	k, ok := ctx.Value(apiKeyKey).(store.APIKey)
	return k, ok
}

// bearerToken extracts a token from the Authorization: Bearer header, or
// the X-API-Key header as a convenience for simple clients.
func bearerToken(r *http.Request) string {
	if after, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return strings.TrimSpace(after)
	}
	return strings.TrimSpace(r.Header.Get("X-API-Key"))
}

// requireScopeOrSession admits either a full user session or an API key
// carrying scope. It backs the nginx-control endpoints so automation
// (cert renewal hooks, CI, monitoring) can drive them without a login.
func (s *Server) requireScopeOrSession(scope string, next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if tok := bearerToken(r); tok != "" {
			k, err := s.accounts.Store().VerifyAPIKey(tok)
			if err != nil {
				s.audit(r, "apikey.rejected")
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid api key"})
				return
			}
			if !k.HasScope(scope) {
				s.audit(r, "apikey.forbidden", "key", k.Name, "scope", scope)
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "api key lacks scope " + scope})
				return
			}
			next(w, r.WithContext(withAPIKey(r.Context(), k)))
			return
		}
		sess, ok := s.liveSession(r)
		if !ok || sess.Level != auth.LevelFull {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r.WithContext(withSession(r.Context(), sess)))
	})
}

// ---- admin management (session + admin only) ----

func (s *Server) handleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := s.accounts.Store().ListAPIKeys()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
		return
	}
	if keys == nil {
		keys = []store.APIKey{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": keys, "scopes": apiKeyScopes})
}

func (s *Server) handleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   string   `json:"name"`
		Scopes []string `json:"scopes"`
	}
	if !readJSON(w, r, &req, 4096) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	if len(req.Scopes) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "at least one scope is required"})
		return
	}
	for _, sc := range req.Scopes {
		if !validScope(sc) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown scope " + sc})
			return
		}
	}
	k, token, err := s.accounts.Store().CreateAPIKey(req.Name, req.Scopes)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
		return
	}
	sess, _ := sessionFrom(r.Context())
	s.audit(r, "apikey.created", "by", sess.User, "name", k.Name, "scopes", req.Scopes)
	// The plaintext token is returned exactly once.
	writeJSON(w, http.StatusCreated, map[string]any{"key": k, "token": token})
}

func (s *Server) handleDeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.accounts.Store().DeleteAPIKey(id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "api key not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
		return
	}
	sess, _ := sessionFrom(r.Context())
	s.audit(r, "apikey.deleted", "by", sess.User, "id", id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
