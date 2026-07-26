package accounts

import (
	"path/filepath"
	"testing"

	"github.com/Buco7854/lightngx/internal/auth"
	"github.com/Buco7854/lightngx/internal/config"
	"github.com/Buco7854/lightngx/internal/store"
)

func svc(t *testing.T, cfg *config.Config) (*Service, *store.Store) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "t.db"), []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	if cfg == nil {
		cfg = &config.Config{}
	}
	s, err := New(st, cfg)
	if err != nil {
		t.Fatal(err)
	}
	return s, st
}

func TestSeedAdminAndBootstrap(t *testing.T) {
	hash, _ := auth.HashPassword("adminpass1")
	s, _ := svc(t, &config.Config{AdminUser: "root", AdminPasswordHash: hash})
	if boot, _ := s.NeedsBootstrap(); boot {
		t.Fatal("seeded admin should skip bootstrap")
	}
	if _, err := s.Bootstrap("other", "password1"); err == nil {
		t.Fatal("bootstrap should fail when an admin exists")
	}

	// Fresh service, no seed → bootstrap needed, then closes.
	s2, _ := svc(t, nil)
	if boot, _ := s2.NeedsBootstrap(); !boot {
		t.Fatal("empty db should need bootstrap")
	}
	if _, err := s2.Bootstrap("admin", "password1"); err != nil {
		t.Fatal(err)
	}
	if boot, _ := s2.NeedsBootstrap(); boot {
		t.Fatal("bootstrap did not create an admin")
	}
	if _, err := s2.Bootstrap("admin2", "password1"); err == nil {
		t.Fatal("second bootstrap should be rejected")
	}
}

func TestPolicyInApp(t *testing.T) {
	s, _ := svc(t, nil)
	if p, _ := s.Policy(); p.Decided || p.Pinned {
		t.Fatalf("fresh policy = %+v", p)
	}
	if err := s.SetPolicy([]string{"admin"}); err != nil {
		t.Fatal(err)
	}
	p, _ := s.Policy()
	if !p.Decided || p.Pinned || len(p.RequiredRoles) != 1 || p.RequiredRoles[0] != "admin" {
		t.Fatalf("policy after set = %+v", p)
	}
	if req, _ := s.RoleRequiresMFA("admin"); !req {
		t.Fatal("admin should require MFA")
	}
	if req, _ := s.RoleRequiresMFA("user"); req {
		t.Fatal("user should not require MFA")
	}
}

func TestPolicyPinned(t *testing.T) {
	s, _ := svc(t, &config.Config{MFARolesPinned: true, MFARequiredRoles: []string{"admin", "user"}})
	p, _ := s.Policy()
	if !p.Decided || !p.Pinned {
		t.Fatalf("pinned policy = %+v", p)
	}
	if err := s.SetPolicy([]string{"user"}); err == nil {
		t.Fatal("SetPolicy should be rejected when pinned")
	}
	if req, _ := s.RoleRequiresMFA("user"); !req {
		t.Fatal("user should require MFA under pinned policy")
	}
}

func TestAuthenticateLevels(t *testing.T) {
	s, st := svc(t, nil)
	hash, _ := auth.HashPassword("password1")
	admin, _ := st.CreateUser("admin", hash, "admin")
	st.CreateUser("bob", hash, "user")

	// No policy decided yet → everyone full.
	dec, err := s.Authenticate("admin", "password1")
	if err != nil || dec.Level != auth.LevelFull {
		t.Fatalf("no-policy admin level = %v err=%v", dec.Level, err)
	}

	// Require MFA for admins → admin must enrol, user still full.
	if err := s.SetPolicy([]string{"admin"}); err != nil {
		t.Fatal(err)
	}
	dec, _ = s.Authenticate("admin", "password1")
	if dec.Level != auth.LevelEnroll {
		t.Fatalf("admin should be forced to enrol, got %v", dec.Level)
	}
	dec, _ = s.Authenticate("bob", "password1")
	if dec.Level != auth.LevelFull {
		t.Fatalf("user level = %v", dec.Level)
	}

	// Once admin has TOTP confirmed → they must verify (LevelMFA).
	st.SetPendingTOTP(admin.ID, "JBSWY3DPEHPK3PXP")
	st.ConfirmTOTP(admin.ID)
	dec, _ = s.Authenticate("admin", "password1")
	if dec.Level != auth.LevelMFA {
		t.Fatalf("enrolled admin should verify, got %v", dec.Level)
	}

	// Wrong password.
	if _, err := s.Authenticate("admin", "nope"); err != ErrInvalidCredentials {
		t.Fatalf("want ErrInvalidCredentials, got %v", err)
	}
	if _, err := s.Authenticate("ghost", "password1"); err != ErrInvalidCredentials {
		t.Fatalf("unknown user should be ErrInvalidCredentials, got %v", err)
	}
}

func TestEnrolledUserVerifiesEvenIfRoleNotRequired(t *testing.T) {
	// A user who voluntarily enrolled TOTP must still be challenged, even
	// though their role isn't in the required set.
	s, st := svc(t, nil)
	hash, _ := auth.HashPassword("password1")
	u, _ := st.CreateUser("carol", hash, "user")
	st.SetPendingTOTP(u.ID, "JBSWY3DPEHPK3PXP")
	st.ConfirmTOTP(u.ID)
	dec, _ := s.Authenticate("carol", "password1")
	if dec.Level != auth.LevelMFA {
		t.Fatalf("voluntarily enrolled user should verify, got %v", dec.Level)
	}
}
