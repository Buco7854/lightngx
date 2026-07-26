package server

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/Buco7854/lightngx/internal/accounts"
	"github.com/Buco7854/lightngx/internal/auth"
	"github.com/Buco7854/lightngx/internal/store"
)

// ---- MFA policy (admin) ----

func (s *Server) handleGetPolicy(w http.ResponseWriter, r *http.Request) {
	p, err := s.accounts.Policy()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleSetPolicy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RequiredRoles []string `json:"requiredRoles"`
	}
	if !readJSON(w, r, &req, 4096) {
		return
	}
	if err := s.accounts.SetPolicy(req.RequiredRoles); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	sess, _ := sessionFrom(r.Context())
	s.audit(r, "policy.set", "by", sess.User, "roles", req.RequiredRoles)
	p, _ := s.accounts.Policy()
	writeJSON(w, http.StatusOK, p)
}

// ---- user management (admin) ----

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.accounts.Store().ListUsers()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
		return
	}
	if users == nil {
		users = []store.User{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if !readJSON(w, r, &req, 4096) {
		return
	}
	if !accounts.ValidRole(req.Role) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "role must be admin or user"})
		return
	}
	if err := accounts.ValidateUsername(req.Username); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := accounts.ValidatePassword(req.Password); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hash error"})
		return
	}
	u, err := s.accounts.Store().CreateUser(req.Username, hash, req.Role)
	if errors.Is(err, store.ErrExists) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "username already exists"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
		return
	}
	sess, _ := sessionFrom(r.Context())
	s.audit(r, "user.created", "by", sess.User, "username", u.Username, "role", u.Role)
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	target, err := s.accounts.Store().GetUser(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "user not found"})
		return
	}
	var req struct {
		Role     *string `json:"role"`
		Password *string `json:"password"`
	}
	if !readJSON(w, r, &req, 4096) {
		return
	}
	sess, _ := sessionFrom(r.Context())

	if req.Role != nil && *req.Role != target.Role {
		if !accounts.ValidRole(*req.Role) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "role must be admin or user"})
			return
		}
		if err := s.accounts.Store().SetRole(id, *req.Role); errors.Is(err, store.ErrLastAdmin) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "cannot demote the last admin"})
			return
		} else if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
			return
		}
		s.audit(r, "user.role_changed", "by", sess.User, "username", target.Username, "role", *req.Role)
	}

	if req.Password != nil {
		if err := accounts.ValidatePassword(*req.Password); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		hash, err := auth.HashPassword(*req.Password)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hash error"})
			return
		}
		if err := s.accounts.Store().SetPassword(id, hash); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
			return
		}
		_ = s.accounts.Store().DeleteUserSessions(id, "")
		_ = s.accounts.Store().ClearTrustedDevices(id)
		s.audit(r, "user.password_reset", "by", sess.User, "username", target.Username)
	}

	u, _ := s.accounts.Store().GetUser(id)
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	sess, _ := sessionFrom(r.Context())
	target, err := s.accounts.Store().GetUser(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "user not found"})
		return
	}
	if target.ID == sess.UserID {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "cannot delete your own account"})
		return
	}
	if err := s.accounts.Store().DeleteUser(id); errors.Is(err, store.ErrLastAdmin) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "cannot delete the last admin"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
		return
	}
	s.audit(r, "user.deleted", "by", sess.User, "username", target.Username)
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleResetUserMFA(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	target, err := s.accounts.Store().GetUser(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "user not found"})
		return
	}
	if err := s.accounts.Store().ClearMFA(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage error"})
		return
	}
	_ = s.accounts.Store().DeleteUserSessions(id, "")
	_ = s.accounts.Store().ClearTrustedDevices(id)
	sess, _ := sessionFrom(r.Context())
	s.audit(r, "user.mfa_reset", "by", sess.User, "username", target.Username)
	u, _ := s.accounts.Store().GetUser(id)
	writeJSON(w, http.StatusOK, u)
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad id"})
		return 0, false
	}
	return id, true
}
