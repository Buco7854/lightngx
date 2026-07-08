// Package store persists local users, their MFA enrollment and app
// settings in a single SQLite file (pure-Go driver, no cgo). TOTP secrets
// are encrypted at rest with a key derived from the app session secret.
package store

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var (
	ErrNotFound = errors.New("not found")
	ErrExists   = errors.New("already exists")
)

type Store struct {
	db     *sql.DB
	encKey []byte
}

// User is the non-sensitive view of an account.
type User struct {
	ID            int64     `json:"id"`
	Username      string    `json:"username"`
	Role          string    `json:"role"`
	TOTPEnrolled  bool      `json:"totpEnrolled"`
	WebAuthnCount int       `json:"webauthnCount"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// MFAEnrolled reports whether the user has any confirmed second factor.
func (u User) MFAEnrolled() bool { return u.TOTPEnrolled || u.WebAuthnCount > 0 }

// Open opens (creating and migrating if needed) the SQLite database. encKey
// keys at-rest encryption and must be stable across restarts; it is
// independent of the session secret so that can be rotated without orphaning
// TOTP secrets.
func Open(path string, encKey []byte) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // SQLite writer serialization; simplest correct choice
	s := &Store{db: db, encKey: encKey}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	// Restrict the DB (hashes, encrypted secrets) rather than trust the umask.
	for _, p := range []string{path, path + "-wal", path + "-shm"} {
		if _, err := os.Stat(p); err == nil {
			_ = os.Chmod(p, 0o600)
		}
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    totp_secret   TEXT NOT NULL DEFAULT '',
    totp_confirmed INTEGER NOT NULL DEFAULT 0,
    totp_last_used INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_sessions (
    sid         TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level       TEXT NOT NULL,
    method      TEXT NOT NULL,
    user_agent  TEXT NOT NULL DEFAULT '',
    ip          TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE TABLE IF NOT EXISTS trusted_devices (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    user_agent  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trusted_user ON trusted_devices(user_id);
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    data        BLOB NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wac_user ON webauthn_credentials(user_id);
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    prefix       TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    scopes       TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    last_used_at TEXT
);
`)
	if err != nil {
		return err
	}
	if _, err := s.db.Exec("ALTER TABLE users ADD COLUMN totp_last_used INTEGER NOT NULL DEFAULT 0"); err != nil &&
		!strings.Contains(err.Error(), "duplicate column") {
		return err
	}
	return nil
}

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func parseTime(s string) time.Time {
	t, _ := time.Parse(time.RFC3339Nano, s)
	return t
}

func scanUser(row interface{ Scan(...any) error }) (User, error) {
	var u User
	var created, updated string
	var totpSecret string
	var totpConfirmed int
	if err := row.Scan(&u.ID, &u.Username, &u.Role, &totpSecret, &totpConfirmed,
		&created, &updated, &u.WebAuthnCount); err != nil {
		return u, err
	}
	u.TOTPEnrolled = totpConfirmed == 1 && totpSecret != ""
	u.CreatedAt = parseTime(created)
	u.UpdatedAt = parseTime(updated)
	return u, nil
}

// userCols folds the WebAuthn credential count into a correlated subquery
// so a single row query is self-contained — no nested query while a rows
// cursor is open (which would deadlock the single-connection pool).
const userCols = "id, username, role, totp_secret, totp_confirmed, created_at, updated_at, " +
	"(SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = users.id)"

// CountAdmins returns the number of admin accounts.
func (s *Store) CountAdmins() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'admin'`).Scan(&n)
	return n, err
}

// CountUsers returns the total account count.
func (s *Store) CountUsers() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// CreateUser inserts a new account. role must be "admin" or "user".
func (s *Store) CreateUser(username, passwordHash, role string) (User, error) {
	t := now()
	res, err := s.db.Exec(
		`INSERT INTO users (username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		username, passwordHash, role, t, t)
	if err != nil {
		if isUnique(err) {
			return User{}, ErrExists
		}
		return User{}, err
	}
	id, _ := res.LastInsertId()
	return s.GetUser(id)
}

var ErrNotFirstAdmin = errors.New("an admin already exists")

// CreateFirstAdmin inserts the first admin only if none exists, atomically.
func (s *Store) CreateFirstAdmin(username, passwordHash string) (User, error) {
	t := now()
	res, err := s.db.Exec(
		`INSERT INTO users (username, password_hash, role, created_at, updated_at)
		 SELECT ?, ?, 'admin', ?, ? WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`,
		username, passwordHash, t, t)
	if err != nil {
		if isUnique(err) {
			return User{}, ErrExists
		}
		return User{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return User{}, ErrNotFirstAdmin
	}
	id, _ := res.LastInsertId()
	return s.GetUser(id)
}

func (s *Store) GetUser(id int64) (User, error) {
	u, err := scanUser(s.db.QueryRow(`SELECT `+userCols+` FROM users WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	return u, nil
}

func (s *Store) GetUserByUsername(username string) (User, error) {
	u, err := scanUser(s.db.QueryRow(`SELECT `+userCols+` FROM users WHERE username = ? COLLATE NOCASE`, username))
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	return u, nil
}

// PasswordHash returns the stored bcrypt hash for a username.
func (s *Store) PasswordHash(username string) (int64, string, error) {
	var id int64
	var hash string
	err := s.db.QueryRow(`SELECT id, password_hash FROM users WHERE username = ? COLLATE NOCASE`, username).Scan(&id, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", ErrNotFound
	}
	return id, hash, err
}

func (s *Store) ListUsers() ([]User, error) {
	rows, err := s.db.Query(`SELECT ` + userCols + ` FROM users ORDER BY username COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

var ErrLastAdmin = errors.New("cannot remove the last admin")

func (s *Store) SetPassword(id int64, hash string) error {
	return s.touch(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, hash, now(), id)
}

// SetRole changes a role, refusing to demote the last admin atomically.
func (s *Store) SetRole(id int64, role string) error {
	res, err := s.db.Exec(
		`UPDATE users SET role = ?, updated_at = ?
		 WHERE id = ? AND (role = ? OR role != 'admin'
		   OR (SELECT COUNT(*) FROM users WHERE role = 'admin') > 1)`,
		role, now(), id, role)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return s.roleChangeError(id)
	}
	return nil
}

// DeleteUser removes an account, refusing to delete the last admin atomically.
func (s *Store) DeleteUser(id int64) error {
	res, err := s.db.Exec(
		`DELETE FROM users WHERE id = ?
		 AND (role != 'admin' OR (SELECT COUNT(*) FROM users WHERE role = 'admin') > 1)`,
		id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return s.roleChangeError(id)
	}
	return nil
}

// roleChangeError tells "no such user" apart from the last-admin guard after
// a guarded write affected zero rows.
func (s *Store) roleChangeError(id int64) error {
	if _, err := s.GetUser(id); errors.Is(err, ErrNotFound) {
		return ErrNotFound
	}
	return ErrLastAdmin
}

func (s *Store) touch(query string, args ...any) error {
	res, err := s.db.Exec(query, args...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func isUnique(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE") || strings.Contains(msg, "2067") // SQLITE_CONSTRAINT_UNIQUE
}

func (s *Store) settingGet(key string) (string, bool, error) {
	var v string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return v, err == nil, err
}

func (s *Store) settingSet(key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value)
	return err
}

// GetSetting / SetSetting expose the key-value settings table.
func (s *Store) GetSetting(key string) (string, bool, error) { return s.settingGet(key) }
func (s *Store) SetSetting(key, value string) error          { return s.settingSet(key, value) }
