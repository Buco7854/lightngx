package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"time"
)

// SessionRecord is a persisted login session. Local sessions are stored so a
// user can list and revoke their devices; OIDC sessions stay stateless.
type SessionRecord struct {
	Sid       string    `json:"sid"`
	UserID    int64     `json:"-"`
	Username  string    `json:"-"`
	Role      string    `json:"-"`
	Level     string    `json:"-"`
	Method    string    `json:"-"`
	UserAgent string    `json:"userAgent"`
	IP        string    `json:"ip"`
	CreatedAt time.Time `json:"createdAt"`
	LastSeen  time.Time `json:"lastSeen"`
	ExpiresAt time.Time `json:"-"`
}

func newSID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// CreateSession records a new session and returns its id.
func (s *Store) CreateSession(userID int64, level, method, ua, ip string, ttl time.Duration) (string, error) {
	sid, err := newSID()
	if err != nil {
		return "", err
	}
	t := now()
	exp := time.Now().Add(ttl).UTC().Format(time.RFC3339Nano)
	_, err = s.db.Exec(
		`INSERT INTO user_sessions (sid, user_id, level, method, user_agent, ip, created_at, last_seen, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		sid, userID, level, method, ua, ip, t, t, exp)
	return sid, err
}

// GetSession returns a session with its user's current username and role,
// so a role change takes effect on the next request without re-login.
func (s *Store) GetSession(sid string) (SessionRecord, error) {
	var r SessionRecord
	var created, seen, exp string
	err := s.db.QueryRow(
		`SELECT s.sid, s.user_id, u.username, u.role, s.level, s.method,
		        s.user_agent, s.ip, s.created_at, s.last_seen, s.expires_at
		 FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.sid = ?`, sid).
		Scan(&r.Sid, &r.UserID, &r.Username, &r.Role, &r.Level, &r.Method,
			&r.UserAgent, &r.IP, &created, &seen, &exp)
	if errors.Is(err, sql.ErrNoRows) {
		return r, ErrNotFound
	}
	if err != nil {
		return r, err
	}
	r.CreatedAt, r.LastSeen, r.ExpiresAt = parseTime(created), parseTime(seen), parseTime(exp)
	return r, nil
}

// TouchSession updates a session's last-seen time and IP.
func (s *Store) TouchSession(sid, ip string) error {
	_, err := s.db.Exec(`UPDATE user_sessions SET last_seen = ?, ip = ? WHERE sid = ?`, now(), ip, sid)
	return err
}

// UpgradeSession raises a session's level (mfa -> full) and extends it.
func (s *Store) UpgradeSession(sid, level string, ttl time.Duration) error {
	exp := time.Now().Add(ttl).UTC().Format(time.RFC3339Nano)
	return s.touch(`UPDATE user_sessions SET level = ?, expires_at = ? WHERE sid = ?`, level, exp, sid)
}

// ListSessions returns a user's unexpired sessions, most recent first.
func (s *Store) ListSessions(userID int64) ([]SessionRecord, error) {
	rows, err := s.db.Query(
		`SELECT sid, user_agent, ip, created_at, last_seen FROM user_sessions
		 WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC`, userID, now())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SessionRecord
	for rows.Next() {
		var r SessionRecord
		var created, seen string
		if err := rows.Scan(&r.Sid, &r.UserAgent, &r.IP, &created, &seen); err != nil {
			return nil, err
		}
		r.CreatedAt, r.LastSeen = parseTime(created), parseTime(seen)
		out = append(out, r)
	}
	return out, rows.Err()
}

// DeleteSession revokes one session belonging to a user.
func (s *Store) DeleteSession(sid string, userID int64) error {
	return s.touch(`DELETE FROM user_sessions WHERE sid = ? AND user_id = ?`, sid, userID)
}

// DeleteUserSessions revokes every session of a user (except an optional one
// to keep, e.g. the session performing a password change).
func (s *Store) DeleteUserSessions(userID int64, keepSid string) error {
	_, err := s.db.Exec(`DELETE FROM user_sessions WHERE user_id = ? AND sid != ?`, userID, keepSid)
	return err
}

// DeleteExpiredSessions prunes expired rows.
func (s *Store) DeleteExpiredSessions() error {
	_, err := s.db.Exec(`DELETE FROM user_sessions WHERE expires_at <= ?`, now())
	return err
}
