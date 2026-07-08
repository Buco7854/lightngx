package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"time"
)

func (s *Store) aead() (cipher.AEAD, error) {
	block, err := aes.NewCipher(s.encKey)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (s *Store) encrypt(plain string) (string, error) {
	gcm, err := s.aead()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ct := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(ct), nil
}

func (s *Store) decrypt(enc string) (string, error) {
	gcm, err := s.aead()
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(enc)
	if err != nil || len(raw) < gcm.NonceSize() {
		return "", errors.New("bad ciphertext")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// SetPendingTOTP stores an unconfirmed TOTP secret (encrypted). It is not
// yet a valid second factor until ConfirmTOTP is called.
func (s *Store) SetPendingTOTP(id int64, secret string) error {
	enc, err := s.encrypt(secret)
	if err != nil {
		return err
	}
	return s.touch(`UPDATE users SET totp_secret = ?, totp_confirmed = 0, updated_at = ? WHERE id = ?`, enc, now(), id)
}

// ConfirmTOTP marks the pending TOTP secret as an active second factor.
func (s *Store) ConfirmTOTP(id int64) error {
	return s.touch(`UPDATE users SET totp_confirmed = 1, updated_at = ? WHERE id = ? AND totp_secret != ''`, now(), id)
}

// TOTPSecret returns the decrypted secret and whether it is confirmed.
func (s *Store) TOTPSecret(id int64) (secret string, confirmed bool, err error) {
	var enc string
	var conf int
	err = s.db.QueryRow(`SELECT totp_secret, totp_confirmed FROM users WHERE id = ?`, id).Scan(&enc, &conf)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, ErrNotFound
	}
	if err != nil {
		return "", false, err
	}
	if enc == "" {
		return "", false, nil
	}
	secret, err = s.decrypt(enc)
	return secret, conf == 1, err
}

// TOTPLastUsed returns the last TOTP timestep counter consumed for a user.
func (s *Store) TOTPLastUsed(id int64) (int64, error) {
	var c int64
	err := s.db.QueryRow(`SELECT totp_last_used FROM users WHERE id = ?`, id).Scan(&c)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	return c, err
}

// SetTOTPLastUsed advances the last-consumed counter, blocking code replay.
func (s *Store) SetTOTPLastUsed(id, counter int64) error {
	return s.touch(`UPDATE users SET totp_last_used = ? WHERE id = ? AND totp_last_used < ?`, counter, id, counter)
}

// ClearTOTP removes any TOTP enrollment for the user.
func (s *Store) ClearTOTP(id int64) error {
	return s.touch(`UPDATE users SET totp_secret = '', totp_confirmed = 0, updated_at = ? WHERE id = ?`, now(), id)
}

// Credential is a stored WebAuthn credential. Data is the opaque JSON the
// webauthn package serializes (public key, sign count, transports, ...).
type Credential struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Data      []byte    `json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

func (s *Store) webauthnCount(userID int64) (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = ?`, userID).Scan(&n)
	return n, err
}

// AddCredential stores a WebAuthn credential for a user.
func (s *Store) AddCredential(userID int64, id, name string, data []byte) error {
	_, err := s.db.Exec(
		`INSERT INTO webauthn_credentials (id, user_id, name, data, created_at) VALUES (?, ?, ?, ?, ?)`,
		id, userID, name, data, now())
	if isUnique(err) {
		return ErrExists
	}
	return err
}

// Credentials returns a user's WebAuthn credentials.
func (s *Store) Credentials(userID int64) ([]Credential, error) {
	rows, err := s.db.Query(
		`SELECT id, name, data, created_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Credential
	for rows.Next() {
		var c Credential
		var created string
		if err := rows.Scan(&c.ID, &c.Name, &c.Data, &created); err != nil {
			return nil, err
		}
		c.CreatedAt = parseTime(created)
		out = append(out, c)
	}
	return out, rows.Err()
}

// UpdateCredentialData rewrites a credential's serialized data (e.g. an
// advanced sign counter after a successful assertion).
func (s *Store) UpdateCredentialData(id string, data []byte) error {
	return s.touch(`UPDATE webauthn_credentials SET data = ? WHERE id = ?`, data, id)
}

// DeleteCredential removes one of a user's WebAuthn credentials.
func (s *Store) DeleteCredential(userID int64, id string) error {
	return s.touch(`DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?`, id, userID)
}

// ClearMFA removes every second factor for a user: the TOTP secret and all
// WebAuthn credentials. Used by an admin to reset a locked-out account.
func (s *Store) ClearMFA(userID int64) error {
	if _, err := s.db.Exec(`DELETE FROM webauthn_credentials WHERE user_id = ?`, userID); err != nil {
		return err
	}
	return s.ClearTOTP(userID)
}
