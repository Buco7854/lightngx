package store

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"strings"
	"time"
)

// AddTrustedDevice records a device that may skip MFA and returns the cookie
// value (id + secret); only the secret's hash is stored.
func (s *Store) AddTrustedDevice(userID int64, ua string, ttl time.Duration) (string, error) {
	idb, secb := make([]byte, 16), make([]byte, 32)
	if _, err := rand.Read(idb); err != nil {
		return "", err
	}
	if _, err := rand.Read(secb); err != nil {
		return "", err
	}
	id := base64.RawURLEncoding.EncodeToString(idb)
	secret := base64.RawURLEncoding.EncodeToString(secb)
	exp := time.Now().Add(ttl).UTC().Format(time.RFC3339Nano)
	_, err := s.db.Exec(
		`INSERT INTO trusted_devices (id, user_id, token_hash, user_agent, created_at, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		id, userID, hashToken(secret), ua, now(), exp)
	if err != nil {
		return "", err
	}
	return id + ":" + secret, nil
}

// TrustedDevice reports whether cookieValue is a valid, unexpired trusted
// device for userID.
func (s *Store) TrustedDevice(userID int64, cookieValue string) bool {
	id, secret, ok := strings.Cut(cookieValue, ":")
	if !ok {
		return false
	}
	var hash, exp string
	err := s.db.QueryRow(
		`SELECT token_hash, expires_at FROM trusted_devices WHERE id = ? AND user_id = ?`, id, userID).
		Scan(&hash, &exp)
	if err != nil || parseTime(exp).Before(time.Now()) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(hash), []byte(hashToken(secret))) == 1
}

// ClearTrustedDevices removes every trusted device for a user.
func (s *Store) ClearTrustedDevices(userID int64) error {
	_, err := s.db.Exec(`DELETE FROM trusted_devices WHERE user_id = ?`, userID)
	return err
}
