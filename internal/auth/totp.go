package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	totpPeriod = 30
	totpDigits = 6
	// Accept the adjacent windows to tolerate clock skew.
	totpSkew = 1
)

// NewTOTPSecret returns a fresh base32 secret (no padding) suitable for
// authenticator apps.
func NewTOTPSecret() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return strings.TrimRight(base32.StdEncoding.EncodeToString(b), "="), nil
}

// TOTPURI builds the otpauth:// URI encoded into the enrollment QR code.
func TOTPURI(secret, account, issuer string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", fmt.Sprint(totpDigits))
	q.Set("period", fmt.Sprint(totpPeriod))
	return "otpauth://totp/" + label + "?" + q.Encode()
}

func hotp(secret string, counter uint64) (string, bool) {
	key, err := base32.StdEncoding.DecodeString(strings.ToUpper(padBase32(secret)))
	if err != nil {
		return "", false
	}
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], counter)
	mac := hmac.New(sha1.New, key)
	mac.Write(buf[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	code := (uint32(sum[offset]&0x7f) << 24) |
		(uint32(sum[offset+1]) << 16) |
		(uint32(sum[offset+2]) << 8) |
		uint32(sum[offset+3])
	code %= 1_000_000
	return fmt.Sprintf("%06d", code), true
}

func padBase32(s string) string {
	if m := len(s) % 8; m != 0 {
		s += strings.Repeat("=", 8-m)
	}
	return s
}

// VerifyTOTP checks a code against the secret, allowing ±totpSkew windows.
// Comparison is constant-time.
func VerifyTOTP(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != totpDigits {
		return false
	}
	counter := uint64(time.Now().Unix() / totpPeriod)
	for i := -totpSkew; i <= totpSkew; i++ {
		want, ok := hotp(secret, counter+uint64(int64(i)))
		if !ok {
			return false
		}
		if subtle.ConstantTimeCompare([]byte(want), []byte(code)) == 1 {
			return true
		}
	}
	return false
}
