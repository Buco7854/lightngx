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

// RateLimiter tracks login failures per client IP: after `burst` failures
// within `window`, further attempts are rejected until the window expires.
type RateLimiter struct {
	mu       sync.Mutex
	window   time.Duration
	burst    int
	failures map[string][]time.Time
}

func NewRateLimiter(burst int, window time.Duration) *RateLimiter {
	return &RateLimiter{window: window, burst: burst, failures: map[string][]time.Time{}}
}

// Allow reports whether ip may attempt a login right now.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return len(rl.recent(ip)) < rl.burst
}

// Fail records a failed attempt for ip.
func (rl *RateLimiter) Fail(ip string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.failures[ip] = append(rl.recent(ip), time.Now())
	if len(rl.failures) > 10000 {
		rl.gc()
	}
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
