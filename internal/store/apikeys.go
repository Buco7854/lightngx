package store

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

// apiKeyTokenPrefix marks a Lightngx API token so it is recognisable in
// logs and config files and cheaply rejected when malformed.
const apiKeyTokenPrefix = "lngx_"

// APIKey is the non-secret view of a stored key. The token itself is never
// persisted or returned after creation — only its SHA-256 hash is kept.
type APIKey struct {
	ID         int64      `json:"id"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	Scopes     []string   `json:"scopes"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
}

// HasScope reports whether the key grants the given scope.
func (k APIKey) HasScope(scope string) bool {
	for _, s := range k.Scopes {
		if s == scope {
			return true
		}
	}
	return false
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// CreateAPIKey generates a new key with the given name and scopes. It
// returns the stored record and the plaintext token, which the caller must
// surface exactly once — it cannot be recovered afterwards.
func (s *Store) CreateAPIKey(name string, scopes []string) (APIKey, string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return APIKey{}, "", err
	}
	token := apiKeyTokenPrefix + base64.RawURLEncoding.EncodeToString(raw)
	prefix := token[:12]
	t := now()
	res, err := s.db.Exec(
		`INSERT INTO api_keys (name, prefix, key_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?)`,
		name, prefix, hashToken(token), strings.Join(scopes, ","), t)
	if err != nil {
		return APIKey{}, "", err
	}
	id, _ := res.LastInsertId()
	return APIKey{ID: id, Name: name, Prefix: prefix, Scopes: scopes, CreatedAt: parseTime(t)}, token, nil
}

func scanAPIKey(row interface{ Scan(...any) error }) (APIKey, error) {
	var k APIKey
	var scopes, created string
	var lastUsed sql.NullString
	if err := row.Scan(&k.ID, &k.Name, &k.Prefix, &scopes, &created, &lastUsed); err != nil {
		return k, err
	}
	if scopes != "" {
		k.Scopes = strings.Split(scopes, ",")
	}
	k.CreatedAt = parseTime(created)
	if lastUsed.Valid && lastUsed.String != "" {
		t := parseTime(lastUsed.String)
		k.LastUsedAt = &t
	}
	return k, nil
}

const apiKeyCols = "id, name, prefix, scopes, created_at, last_used_at"

// ListAPIKeys returns every stored key (metadata only), newest first.
func (s *Store) ListAPIKeys() ([]APIKey, error) {
	rows, err := s.db.Query(`SELECT ` + apiKeyCols + ` FROM api_keys ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []APIKey
	for rows.Next() {
		k, err := scanAPIKey(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// DeleteAPIKey revokes a key by id.
func (s *Store) DeleteAPIKey(id int64) error {
	return s.touch(`DELETE FROM api_keys WHERE id = ?`, id)
}

// VerifyAPIKey resolves a plaintext token to its key, recording the use.
// Returns ErrNotFound when the token is unknown or malformed.
func (s *Store) VerifyAPIKey(token string) (APIKey, error) {
	if !strings.HasPrefix(token, apiKeyTokenPrefix) {
		return APIKey{}, ErrNotFound
	}
	k, err := scanAPIKey(s.db.QueryRow(
		`SELECT `+apiKeyCols+` FROM api_keys WHERE key_hash = ?`, hashToken(token)))
	if errors.Is(err, sql.ErrNoRows) {
		return APIKey{}, ErrNotFound
	}
	if err != nil {
		return APIKey{}, err
	}
	_, _ = s.db.Exec(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`, now(), k.ID)
	return k, nil
}
