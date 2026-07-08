package store

import (
	"path/filepath"
	"testing"
)

func open(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"), []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestUserCRUD(t *testing.T) {
	s := open(t)
	if n, _ := s.CountAdmins(); n != 0 {
		t.Fatalf("fresh db admins = %d", n)
	}
	u, err := s.CreateUser("Alice", "hash1", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if u.Username != "Alice" || u.Role != "admin" || u.MFAEnrolled() {
		t.Fatalf("created user = %+v", u)
	}

	// Case-insensitive uniqueness.
	if _, err := s.CreateUser("alice", "h", "user"); err != ErrExists {
		t.Fatalf("want ErrExists, got %v", err)
	}
	// Case-insensitive lookup.
	if got, err := s.GetUserByUsername("ALICE"); err != nil || got.ID != u.ID {
		t.Fatalf("lookup = %+v err=%v", got, err)
	}

	id, hash, err := s.PasswordHash("alice")
	if err != nil || id != u.ID || hash != "hash1" {
		t.Fatalf("PasswordHash = %d %q %v", id, hash, err)
	}

	// The last admin cannot be demoted or deleted.
	if err := s.SetRole(u.ID, "user"); err != ErrLastAdmin {
		t.Fatalf("demote last admin: want ErrLastAdmin, got %v", err)
	}
	if err := s.DeleteUser(u.ID); err != ErrLastAdmin {
		t.Fatalf("delete last admin: want ErrLastAdmin, got %v", err)
	}

	// With a second admin, demotion is allowed.
	if _, err := s.CreateUser("carol", "h", "admin"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetRole(u.ID, "user"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetPassword(u.ID, "hash2"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetUser(u.ID)
	if got.Role != "user" {
		t.Fatalf("role after update = %q", got.Role)
	}
	if _, h, _ := s.PasswordHash("alice"); h != "hash2" {
		t.Fatalf("password not updated: %q", h)
	}

	if err := s.DeleteUser(u.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetUser(u.ID); err != ErrNotFound {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestTOTPEncryptedRoundTrip(t *testing.T) {
	s := open(t)
	u, _ := s.CreateUser("bob", "h", "user")

	if err := s.SetPendingTOTP(u.ID, "JBSWY3DPEHPK3PXP"); err != nil {
		t.Fatal(err)
	}
	// Pending, not yet a factor.
	if got, _ := s.GetUser(u.ID); got.MFAEnrolled() {
		t.Fatal("pending TOTP should not count as enrolled")
	}
	secret, confirmed, err := s.TOTPSecret(u.ID)
	if err != nil || secret != "JBSWY3DPEHPK3PXP" || confirmed {
		t.Fatalf("TOTPSecret = %q %v %v", secret, confirmed, err)
	}

	// Stored ciphertext must not be the plaintext secret.
	var raw string
	s.db.QueryRow(`SELECT totp_secret FROM users WHERE id = ?`, u.ID).Scan(&raw)
	if raw == "" || raw == "JBSWY3DPEHPK3PXP" {
		t.Fatalf("secret stored in the clear: %q", raw)
	}

	if err := s.ConfirmTOTP(u.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.GetUser(u.ID); !got.TOTPEnrolled || !got.MFAEnrolled() {
		t.Fatal("confirmed TOTP should be enrolled")
	}

	if err := s.ClearTOTP(u.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.GetUser(u.ID); got.MFAEnrolled() {
		t.Fatal("cleared TOTP still enrolled")
	}
}

func TestCredentials(t *testing.T) {
	s := open(t)
	u, _ := s.CreateUser("carol", "h", "user")

	if err := s.AddCredential(u.ID, "cred1", "yubikey", []byte(`{"k":1}`)); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.GetUser(u.ID); got.WebAuthnCount != 1 || !got.MFAEnrolled() {
		t.Fatalf("after add cred: %+v", got)
	}
	creds, err := s.Credentials(u.ID)
	if err != nil || len(creds) != 1 || creds[0].Name != "yubikey" {
		t.Fatalf("Credentials = %+v err=%v", creds, err)
	}
	if err := s.UpdateCredentialData("cred1", []byte(`{"k":2}`)); err != nil {
		t.Fatal(err)
	}
	// Cascade delete with the user.
	if err := s.DeleteCredential(u.ID, "cred1"); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.GetUser(u.ID); got.WebAuthnCount != 0 {
		t.Fatalf("cred not deleted: %+v", got)
	}
}

func TestSettings(t *testing.T) {
	s := open(t)
	if _, ok, _ := s.GetSetting("x"); ok {
		t.Fatal("missing setting reported present")
	}
	if err := s.SetSetting("x", "1"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetSetting("x", "2"); err != nil {
		t.Fatal(err)
	}
	if v, ok, _ := s.GetSetting("x"); !ok || v != "2" {
		t.Fatalf("setting = %q %v", v, ok)
	}
}
