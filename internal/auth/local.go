package auth

import (
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// CheckPassword verifies a password against a bcrypt hash.
func CheckPassword(hash, pass string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pass)) == nil
}

// HashPassword generates a bcrypt hash for use in LN_ADMIN_PASSWORD_HASH.
func HashPassword(pass string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pass), 12)
	return string(b), err
}

// RateLimiter reserves attempts before expensive authentication work, so
// concurrent requests cannot all pass the same remaining allowance.
type RateLimiter struct {
	mu       sync.Mutex
	window   time.Duration
	burst    int
	failures map[string][]time.Time
	nextGC   time.Time
}

const maxRateLimitEntries = 10000

func NewRateLimiter(burst int, window time.Duration) *RateLimiter {
	return &RateLimiter{window: window, burst: burst, failures: map[string][]time.Time{}}
}

// Allow atomically reserves an attempt. Successful authentication may Reset
// the key; rejected and in-flight attempts retain their reservation.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	recent := rl.recent(ip)
	if len(recent) >= rl.burst {
		return false
	}
	now := time.Now()
	if len(recent) == 0 && len(rl.failures) >= maxRateLimitEntries {
		if now.Before(rl.nextGC) {
			return false
		}
		rl.gc()
		rl.nextGC = now.Add(time.Second)
		if len(rl.failures) >= maxRateLimitEntries {
			return false
		}
	}
	rl.failures[ip] = append(recent, now)
	return true
}

// Reset clears failures for ip after a successful login.
func (rl *RateLimiter) Reset(ip string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	delete(rl.failures, ip)
}

func (rl *RateLimiter) recent(ip string) []time.Time {
	cutoff := time.Now().Add(-rl.window)
	kept := rl.failures[ip][:0]
	for _, t := range rl.failures[ip] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		delete(rl.failures, ip)
		return nil
	}
	rl.failures[ip] = kept
	return kept
}

func (rl *RateLimiter) gc() {
	for ip := range rl.failures {
		rl.recent(ip)
	}
}
