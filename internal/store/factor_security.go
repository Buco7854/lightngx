package store

import (
	"database/sql"
	"encoding/json"
	"strings"
)

// FactorChange updates the factor and revokes other devices atomically.
func (s *Store) factorChange(id int64, keepSID string, change func(*sql.Tx) error) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := change(tx); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE users SET auth_version=auth_version+1 WHERE id=?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM user_sessions WHERE user_id=? AND sid!=?`, id, keepSID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM trusted_devices WHERE user_id=?`, id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) ConfirmTOTPForSession(id, counter int64, keepSID string) error {
	return s.factorChange(id, keepSID, func(tx *sql.Tx) error {
		res, err := tx.Exec(`UPDATE users SET totp_confirmed=1,totp_last_used=?,updated_at=? WHERE id=? AND totp_secret!='' AND totp_confirmed=0`, counter, now(), id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}
func (s *Store) AddCredentialForSession(userID int64, id, name string, data []byte, keepSID string) error {
	return s.factorChange(userID, keepSID, func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO webauthn_credentials(id,user_id,name,data,created_at) VALUES(?,?,?,?,?)`, id, userID, name, data, now())
		return err
	})
}
func (s *Store) RemoveFactor(id int64, credentialID, keepSID string) error {
	return s.factorChange(id, keepSID, func(tx *sql.Tx) error {
		var res sql.Result
		var err error
		if credentialID == "" {
			res, err = tx.Exec(`UPDATE users SET totp_secret='',totp_confirmed=0,totp_last_used=0 WHERE id=?`, id)
		} else {
			res, err = tx.Exec(`DELETE FROM webauthn_credentials WHERE user_id=? AND id=?`, id, credentialID)
		}
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}

func enforceMFA(tx *sql.Tx, roles []string) error {
	encoded, _ := json.Marshal(roles)
	condition := `role IN (SELECT value FROM json_each(?)) AND totp_confirmed=0 AND NOT EXISTS(SELECT 1 FROM webauthn_credentials WHERE user_id=users.id)`
	if _, err := tx.Exec(`UPDATE users SET auth_version=auth_version+1 WHERE `+condition, string(encoded)); err != nil {
		return err
	}
	for _, table := range []string{"user_sessions", "trusted_devices"} {
		if _, err := tx.Exec(`DELETE FROM `+table+` WHERE user_id IN (SELECT id FROM users WHERE `+condition+`)`, string(encoded)); err != nil {
			return err
		}
	}
	return nil
}
func (s *Store) SetMFAPolicy(roles []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for key, value := range map[string]string{"mfa_required_roles": strings.Join(roles, ","), "mfa_policy_decided": "1"} {
		if _, err := tx.Exec(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, value); err != nil {
			return err
		}
	}
	if err := enforceMFA(tx, roles); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) EnforceMFAPolicy(roles []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := enforceMFA(tx, roles); err != nil {
		return err
	}
	return tx.Commit()
}
