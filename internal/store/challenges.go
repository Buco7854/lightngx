package store

import "time"

// SaveChallenge records a short-lived ceremony. A signed client cookie alone
// cannot enforce one-time use, even when the authenticator has a sign counter.
func (s *Store) SaveChallenge(purpose, challenge string, expires time.Time) error {
	if _, err := s.db.Exec(`DELETE FROM auth_challenges WHERE expires_at <= ?`, time.Now().Unix()); err != nil {
		return err
	}
	_, err := s.db.Exec(`INSERT INTO auth_challenges (challenge, purpose, expires_at) VALUES (?, ?, ?)`, challenge, purpose, expires.Unix())
	return err
}

// ConsumeChallenge atomically admits one finish request, including across
// concurrent connections. A rejected assertion also consumes its challenge.
func (s *Store) ConsumeChallenge(purpose, challenge string) error {
	return s.touch(`DELETE FROM auth_challenges WHERE challenge = ? AND purpose = ? AND expires_at > ?`, challenge, purpose, time.Now().Unix())
}
