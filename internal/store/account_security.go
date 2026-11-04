package store

import (
	"database/sql"
	"errors"
	"time"
)

func (s *Store) PasswordHashVersion(username string) (id int64, hash string, version int64, err error) {
	err = s.db.QueryRow(`SELECT id,password_hash,auth_version FROM users WHERE username=? COLLATE NOCASE`, username).Scan(&id, &hash, &version)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return
}

// ChangePassword and all associated revocations succeed or fail together.
// expectedHash prevents overlapping password changes from using a stale check.
func (s *Store) ChangePassword(id int64, hash, keepSID string, expectedHash *string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := changePassword(tx, id, hash, keepSID, expectedHash); err != nil {
		return err
	}
	return tx.Commit()
}

func changePassword(tx *sql.Tx, id int64, hash, keepSID string, expectedHash *string) error {
	query := `UPDATE users SET password_hash=?, auth_version=auth_version+1, updated_at=? WHERE id=?`
	args := []any{hash, now(), id}
	if expectedHash != nil {
		query += ` AND password_hash=?`
		args = append(args, *expectedHash)
	}
	res, err := tx.Exec(query, args...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec(`DELETE FROM user_sessions WHERE user_id=? AND sid!=?`, id, keepSID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM trusted_devices WHERE user_id=?`, id); err != nil {
		return err
	}
	return nil
}

func (s *Store) CreateOIDCSession(username, role string, ttl time.Duration) (string, error) {
	sid, err := newSID()
	if err != nil {
		return "", err
	}
	_, err = s.db.Exec(`INSERT INTO oidc_sessions(sid,username,role,created_at,expires_at) VALUES(?,?,?,?,?)`, sid, username, role, now(), time.Now().Add(ttl).UTC().Format(time.RFC3339Nano))
	return sid, err
}
func (s *Store) GetOIDCSession(sid string) (SessionRecord, error) {
	var rec SessionRecord
	var created, expires string
	err := s.db.QueryRow(`SELECT sid,username,role,created_at,expires_at FROM oidc_sessions WHERE sid=?`, sid).Scan(&rec.Sid, &rec.Username, &rec.Role, &created, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	if err != nil {
		return rec, err
	}
	rec.CreatedAt, rec.ExpiresAt = parseTime(created), parseTime(expires)
	if !time.Now().Before(rec.ExpiresAt) {
		return rec, ErrNotFound
	}
	return rec, nil
}
func (s *Store) DeleteOIDCSession(sid string) error {
	return s.touch(`DELETE FROM oidc_sessions WHERE sid=?`, sid)
}

// ChangeAccount keeps a combined role/password update atomic, including the
// last-admin guard and password-related session revocation.
func (s *Store) ChangeAccount(id int64, role, hash *string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if role != nil {
		res, err := tx.Exec(`UPDATE users SET role=?,updated_at=? WHERE id=? AND (role=? OR role!='admin' OR (SELECT COUNT(*) FROM users WHERE role='admin')>1)`, *role, now(), id, *role)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrLastAdmin
		}
	}
	if hash != nil {
		if err := changePassword(tx, id, *hash, "", nil); err != nil {
			return err
		}
	}
	return tx.Commit()
}
