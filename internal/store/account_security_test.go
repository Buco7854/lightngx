package store

import (
	"errors"
	"testing"
	"time"
)

func TestPasswordResetRevocationIsAtomicAndRejectsStaleLogin(t *testing.T) {
	s := open(t)
	u, err := s.CreateUser("operator", "old-hash", "user")
	if err != nil {
		t.Fatal(err)
	}
	sid, err := s.CreateUserSession(u, "full", "local", "", "", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	trusted, err := s.AddTrustedDevice(u.ID, "browser", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`CREATE TRIGGER reject_revocation BEFORE DELETE ON user_sessions BEGIN SELECT RAISE(ABORT,'test error'); END`); err != nil {
		t.Fatal(err)
	}
	if err := s.ChangePassword(u.ID, "new-hash", "", nil); err == nil {
		t.Fatal("revocation failure ignored")
	}
	_, hash, err := s.PasswordHash(u.Username)
	if err != nil || hash != "old-hash" {
		t.Fatal("password changed without revocation")
	}
	if !s.TrustedDevice(u.ID, trusted) {
		t.Fatal("failed transaction changed trusted devices")
	}
	if _, err := s.GetSession(sid); err != nil {
		t.Fatal("failed transaction changed sessions")
	}
	if _, err := s.db.Exec(`DROP TRIGGER reject_revocation`); err != nil {
		t.Fatal(err)
	}
	if err := s.ChangePassword(u.ID, "new-hash", "", nil); err != nil {
		t.Fatal(err)
	}
	if s.TrustedDevice(u.ID, trusted) {
		t.Fatal("trusted device survived password reset")
	}
	if _, err := s.GetSession(sid); !errors.Is(err, ErrNotFound) {
		t.Fatal("old session survived")
	}
	if _, err := s.CreateUserSession(u, "full", "local", "", "", time.Hour); !errors.Is(err, ErrNotFound) {
		t.Fatal("in-flight login recreated a session after reset")
	}
	current, err := s.GetUser(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateUserSession(current, "full", "local", "", "", time.Hour); err != nil {
		t.Fatal("current login rejected", err)
	}
}

func TestFactorEnrollmentRevokesOtherSessionsAndTrust(t *testing.T) {
	s := open(t)
	u, err := s.CreateUser("operator", "hash", "user")
	if err != nil {
		t.Fatal(err)
	}
	keep, err := s.CreateSession(u.ID, "enroll", "local", "", "", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	other, err := s.CreateSession(u.ID, "full", "local", "", "", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	token, err := s.AddTrustedDevice(u.ID, "other", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetPendingTOTP(u.ID, "JBSWY3DPEHPK3PXP"); err != nil {
		t.Fatal(err)
	}
	if err := s.ConfirmTOTPForSession(u.ID, 123, keep); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetSession(keep); err != nil {
		t.Fatal("enrollment session revoked", err)
	}
	if _, err := s.GetSession(other); !errors.Is(err, ErrNotFound) {
		t.Fatal("other session retained")
	}
	if s.TrustedDevice(u.ID, token) {
		t.Fatal("trusted device retained")
	}
	if _, err := s.CreateUserSession(u, "full", "local", "", "", time.Hour); !errors.Is(err, ErrNotFound) {
		t.Fatal("stale login bypassed new factor")
	}
}

func TestMixedTagDeltaRollback(t *testing.T) {
	s := open(t)
	a, err := s.SaveTag(Tag{Name: "a", Mode: "all", Rules: []byte(`[]`)})
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.SaveTag(Tag{Name: "b", Mode: "all", Rules: []byte(`[]`)})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetFileTags("file", []int64{a.ID}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`CREATE TRIGGER reject_add BEFORE INSERT ON file_tags BEGIN SELECT RAISE(ABORT,'test error'); END`); err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateFileTags([]string{"file"}, []int64{b.ID}, []int64{a.ID}); err == nil {
		t.Fatal("injected failure ignored")
	}
	got, err := s.FileTags()
	if err != nil || len(got["file"]) != 1 || got["file"][0] != a.ID {
		t.Fatal("removal was not rolled back", got, err)
	}
}

func TestCombinedAccountUpdateRollsBackRoleOnRevocationFailure(t *testing.T) {
	s := open(t)
	if _, err := s.CreateUser("owner", "hash", "admin"); err != nil {
		t.Fatal(err)
	}
	target, err := s.CreateUser("target", "old", "user")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSession(target.ID, "full", "local", "", "", time.Hour); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`CREATE TRIGGER reject_account_reset BEFORE DELETE ON user_sessions BEGIN SELECT RAISE(ABORT,'test error'); END`); err != nil {
		t.Fatal(err)
	}
	role, hash := "admin", "new"
	if err := s.ChangeAccount(target.ID, &role, &hash); err == nil {
		t.Fatal("injected failure ignored")
	}
	current, err := s.GetUser(target.ID)
	if err != nil || current.Role != "user" {
		t.Fatal("role changed on failed reset", current, err)
	}
	_, password, err := s.PasswordHash("target")
	if err != nil || password != "old" {
		t.Fatal("password changed on failed reset")
	}
}
