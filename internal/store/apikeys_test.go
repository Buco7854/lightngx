package store

import (
	"errors"
	"strings"
	"testing"
)

func TestAPIKeyLifecycle(t *testing.T) {
	s := open(t)

	k, token, err := s.CreateAPIKey("certwarden", []string{"nginx:reload", "nginx:test"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(token, "lngx_") {
		t.Fatalf("token missing prefix: %q", token)
	}
	if k.Prefix != token[:12] {
		t.Fatalf("prefix = %q, token[:12] = %q", k.Prefix, token[:12])
	}
	if !k.HasScope("nginx:reload") || k.HasScope("nginx:restart") {
		t.Fatalf("scopes = %v", k.Scopes)
	}

	// Verify resolves the token and records the use.
	got, err := s.VerifyAPIKey(token)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got.ID != k.ID || got.Name != "certwarden" {
		t.Fatalf("verified = %+v", got)
	}
	after, _ := s.VerifyAPIKey(token)
	if after.LastUsedAt == nil {
		t.Fatal("last_used_at not recorded")
	}

	// Wrong / malformed tokens are rejected as not-found.
	if _, err := s.VerifyAPIKey(token + "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("tampered token err = %v", err)
	}
	if _, err := s.VerifyAPIKey("not-a-key"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bad prefix err = %v", err)
	}

	keys, err := s.ListAPIKeys()
	if err != nil || len(keys) != 1 {
		t.Fatalf("list = %v, %v", keys, err)
	}

	if err := s.DeleteAPIKey(k.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.VerifyAPIKey(token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("verify after delete = %v", err)
	}
	if err := s.DeleteAPIKey(k.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("double delete = %v", err)
	}
}
