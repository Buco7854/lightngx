package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"time"
)

// SessionRecord is a persisted login session. Local sessions are stored so a
// user can list and revoke their devices. OIDC sessions use their own registry.
type SessionRecord struct {
	VerifiedAt  time.Time `json:"-"`
	MFAEnrolled bool      `json:"-"`
	Sid         string    `json:"sid"`
	UserID      int64     `json:"-"`
	Username    string    `json:"-"`
	Role        string    `json:"-"`
	Level       string    `json:"-"`
	Method      string    `json:"-"`
	UserAgent   string    `json:"userAgent"`
	IP          string    `json:"ip"`
	CreatedAt   time.Time `json:"createdAt"`
	LastSeen    time.Time `json:"lastSeen"`
	ExpiresAt   time.Time `json:"-"`
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
	u, err := s.GetUser(userID)
	if err != nil {
		return "", err
	}
	return s.CreateUserSession(u, level, method, ua, ip, ttl)
}

// Guard against a password reset completing while a login was verifying the
// previous hash. A stale login decision cannot mint a replacement session.
func (s *Store) CreateUserSession(u User, level, method, ua, ip string, ttl time.Duration) (string, error) {
	sid, err := newSID()
	if err != nil {
		return "", err
	}
	t := now()
	exp := time.Now().Add(ttl).UTC().Format(time.RFC3339Nano)
	err = s.touch(
		`INSERT INTO user_sessions (sid, user_id, level, method, user_agent, ip, created_at, last_seen, expires_at, verified_at)
		 SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ? FROM users WHERE id=? AND auth_version=?`,
		sid, level, method, ua, ip, t, t, exp, time.Now().Unix(), u.ID, u.AuthVersion)
	return sid, err
}

// GetSession returns a session with its user's current username and role,
// so a role change takes effect on the next request without re-login.
func (s *Store) GetSession(sid string) (SessionRecord, error) {
	var r SessionRecord
	var created, seen, exp string
	var verified int64
	err := s.db.QueryRow(
		`SELECT s.sid, s.user_id, u.username, u.role, s.level, s.method,
		        s.user_agent, s.ip, s.created_at, s.last_seen, s.expires_at, s.verified_at,
 (u.totp_confirmed=1 AND u.totp_secret!='') OR EXISTS(SELECT 1 FROM webauthn_credentials WHERE user_id=u.id)
		 FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.sid = ?`, sid).
		Scan(&r.Sid, &r.UserID, &r.Username, &r.Role, &r.Level, &r.Method,
			&r.UserAgent, &r.IP, &created, &seen, &exp, &verified, &r.MFAEnrolled)
	if errors.Is(err, sql.ErrNoRows) {
		return r, ErrNotFound
	}
	if err != nil {
		return r, err
	}
	r.VerifiedAt = time.Unix(verified, 0)
	r.CreatedAt, r.LastSeen, r.ExpiresAt = parseTime(created), parseTime(seen), parseTime(exp)
	if !time.Now().Before(r.ExpiresAt) {
		return r, ErrNotFound
	}
	return r, nil
}

// TouchSession updates a session's last-seen time and IP.
func (s *Store) TouchSession(sid, ip string) error {
	_, err := s.db.Exec(`UPDATE user_sessions SET last_seen = ?, ip = ? WHERE sid = ?`, now(), ip, sid)
	return err
}

// UpgradeSession rotates the identifier when raising authentication level.
// A copied password-only cookie must not acquire the verified session's rights.
func (s *Store) UpgradeSession(sid, level string, ttl time.Duration) (string, error) {
	replacement, err := newSID()
	if err != nil {
		return "", err
	}
	exp := time.Now().Add(ttl).UTC().Format(time.RFC3339Nano)
	err = s.touch(`UPDATE user_sessions SET sid = ?, level = ?, expires_at = ?, verified_at=? WHERE sid = ? AND julianday(expires_at) > julianday(?)`, replacement, level, exp, time.Now().Unix(), sid, now())
	return replacement, err
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
	if _, err := s.db.Exec(`DELETE FROM user_sessions WHERE julianday(expires_at) <= julianday(?)`, now()); err != nil {
		return err
	}
	_, err := s.db.Exec(`DELETE FROM oidc_sessions WHERE julianday(expires_at) <= julianday(?)`, now())
	return err
}

func (s *Store) MarkReauthenticated(sid string, id, version int64) error {
	return s.touch(`UPDATE user_sessions SET verified_at=? WHERE sid=? AND user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=?)`, time.Now().Unix(), sid, id, id, version)
}
