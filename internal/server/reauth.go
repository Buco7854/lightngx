package server

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Buco7854/lightngx/internal/auth"
)

const recentAuthentication = 5 * time.Minute

func (s *Server) requireRecentAuthentication(w http.ResponseWriter, r *http.Request) bool {
	sess, _ := sessionFrom(r.Context())
	if sess.Method != "local" || time.Since(sess.VerifiedAt) > recentAuthentication {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "confirm your password before changing authentication settings", "reauthRequired": true})
		return false
	}
	return true
}
func (s *Server) handleReauthStatus(w http.ResponseWriter, r *http.Request) {
	sess, _ := sessionFrom(r.Context())
	writeJSON(w, 200, map[string]bool{"required": sess.Method == "local" && time.Since(sess.VerifiedAt) > recentAuthentication})
}
func (s *Server) handleReauthenticate(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.localSession(w, r)
	if !ok {
		return
	}
	key := "reauth:" + strconv.FormatInt(sess.UserID, 10)
	if !s.limiter.Allow(s.clientIP(r)) || !s.limiter.Allow(key) {
		writeJSON(w, 429, map[string]string{"error": "too many attempts, try again later"})
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req, 1024) {
		return
	}
	id, hash, version, err := s.accounts.Store().PasswordHashVersion(sess.User)
	if err != nil || id != sess.UserID || !auth.CheckPassword(hash, req.Password) {
		writeJSON(w, 403, map[string]string{"error": "password is incorrect"})
		return
	}
	if err := s.accounts.Store().MarkReauthenticated(sess.Sid, id, version); err != nil {
		writeJSON(w, 401, map[string]string{"error": "session changed; sign in again"})
		return
	}
	s.limiter.Reset(key)
	s.limiter.Reset(s.clientIP(r))
	s.audit(r, "account.reauthenticated")
	writeJSON(w, 200, map[string]string{"status": "verified"})
}
