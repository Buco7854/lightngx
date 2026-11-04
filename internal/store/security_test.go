package store

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSessionExpiryAndUpgradeRotation(t *testing.T) {
	s := open(t)
	u, err := s.CreateUser("operator", "hash", "user")
	if err != nil {
		t.Fatal(err)
	}
	expired, err := s.CreateSession(u.ID, "mfa", "local", "", "", -time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetSession(expired); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired session found: %v", err)
	}
	if _, err := s.UpgradeSession(expired, "full", time.Hour); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired session upgraded: %v", err)
	}
	old, err := s.CreateSession(u.ID, "mfa", "local", "", "", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	replacement, err := s.UpgradeSession(old, "full", time.Hour)
	if err != nil || replacement == old {
		t.Fatalf("upgrade: %q %v", replacement, err)
	}
	if _, err := s.GetSession(old); !errors.Is(err, ErrNotFound) {
		t.Fatal("old identifier still valid")
	}
	if rec, err := s.GetSession(replacement); err != nil || rec.Level != "full" {
		t.Fatalf("replacement: %+v %v", rec, err)
	}
	if _, err := s.UpgradeSession(old, "full", time.Hour); !errors.Is(err, ErrNotFound) {
		t.Fatalf("partial identifier reused: %v", err)
	}
}

func TestChallengePurposeExpiryAndSingleUse(t *testing.T) {
	s := open(t)
	if err := s.SaveChallenge("login", "expired", time.Now().Add(-time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := s.ConsumeChallenge("login", "expired"); !errors.Is(err, ErrNotFound) {
		t.Fatal("expired challenge accepted")
	}
	if err := s.SaveChallenge("login", "live", time.Now().Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := s.ConsumeChallenge("register", "live"); !errors.Is(err, ErrNotFound) {
		t.Fatal("wrong purpose accepted")
	}
	var admitted atomic.Int32
	var wg sync.WaitGroup
	for range 16 {
		wg.Go(func() {
			if s.ConsumeChallenge("login", "live") == nil {
				admitted.Add(1)
			}
		})
	}
	wg.Wait()
	if admitted.Load() != 1 {
		t.Fatalf("challenge admitted %d requests", admitted.Load())
	}
}
