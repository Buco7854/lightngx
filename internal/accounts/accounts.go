// Package accounts is the policy layer over the user store: it seeds the
// env admin, resolves the MFA-required-roles policy (env-pinned or
// admin-decided), and decides what a given login still owes (a second
// factor to verify, or a forced enrolment).
package accounts

import (
	"errors"
	"slices"
	"strings"

	"github.com/Buco7854/lightngx/internal/auth"
	"github.com/Buco7854/lightngx/internal/config"
	"github.com/Buco7854/lightngx/internal/store"
)

const (
	settingMFARoles   = "mfa_required_roles"
	settingMFADecided = "mfa_policy_decided"
)

var validRoles = []string{"admin", "user"}

func ValidRole(r string) bool { return slices.Contains(validRoles, r) }

type Service struct {
	store       *store.Store
	pinned      bool
	pinnedRoles []string
}

func New(st *store.Store, cfg *config.Config) (*Service, error) {
	s := &Service{store: st, pinned: cfg.MFARolesPinned, pinnedRoles: cfg.MFARequiredRoles}
	if err := s.seedAdmin(cfg); err != nil {
		return nil, err
	}
	return s, nil
}

// seedAdmin creates the env-configured admin on first boot if it does not
// already exist. The env hash is the initial password; a later in-app
// password change is preserved (we never overwrite an existing row).
func (s *Service) seedAdmin(cfg *config.Config) error {
	if cfg.AdminUser == "" {
		return nil
	}
	if _, err := s.store.GetUserByUsername(cfg.AdminUser); err == nil {
		return nil
	} else if !errors.Is(err, store.ErrNotFound) {
		return err
	}
	_, err := s.store.CreateUser(cfg.AdminUser, cfg.AdminPasswordHash, "admin")
	if errors.Is(err, store.ErrExists) {
		return nil
	}
	return err
}

// NeedsBootstrap reports whether there is no admin yet, so the first-run
// setup page should be shown.
func (s *Service) NeedsBootstrap() (bool, error) {
	n, err := s.store.CountAdmins()
	return n == 0, err
}

// Bootstrap creates the first admin account. It refuses once any admin
// exists, closing the first-run window.
func (s *Service) Bootstrap(username, password string) (store.User, error) {
	n, err := s.store.CountAdmins()
	if err != nil {
		return store.User{}, err
	}
	if n > 0 {
		return store.User{}, errors.New("an admin already exists")
	}
	if err := validateUsername(username); err != nil {
		return store.User{}, err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return store.User{}, err
	}
	return s.store.CreateUser(username, hash, "admin")
}

// MFAPolicy is the current second-factor requirement.
type MFAPolicy struct {
	Decided       bool     `json:"decided"`
	Pinned        bool     `json:"pinned"`
	RequiredRoles []string `json:"requiredRoles"`
}

// Policy returns the effective MFA policy. When env-pinned it always
// reports decided; otherwise it reflects the admin's stored choice.
func (s *Service) Policy() (MFAPolicy, error) {
	if s.pinned {
		return MFAPolicy{Decided: true, Pinned: true, RequiredRoles: s.pinnedRoles}, nil
	}
	decided, _, err := s.store.GetSetting(settingMFADecided)
	if err != nil {
		return MFAPolicy{}, err
	}
	if decided != "1" {
		return MFAPolicy{Decided: false}, nil
	}
	raw, _, err := s.store.GetSetting(settingMFARoles)
	if err != nil {
		return MFAPolicy{}, err
	}
	return MFAPolicy{Decided: true, RequiredRoles: splitRoles(raw)}, nil
}

// SetPolicy records the admin's choice of which roles require MFA. It is
// rejected when the policy is env-pinned.
func (s *Service) SetPolicy(roles []string) error {
	if s.pinned {
		return errors.New("MFA policy is fixed by LN_MFA_REQUIRED_ROLES")
	}
	for _, r := range roles {
		if !ValidRole(r) {
			return errors.New("unknown role: " + r)
		}
	}
	if err := s.store.SetSetting(settingMFARoles, strings.Join(roles, ",")); err != nil {
		return err
	}
	return s.store.SetSetting(settingMFADecided, "1")
}

// RoleRequiresMFA reports whether the given role must use a second factor
// under the current policy.
func (s *Service) RoleRequiresMFA(role string) (bool, error) {
	p, err := s.Policy()
	if err != nil || !p.Decided {
		return false, err
	}
	return slices.Contains(p.RequiredRoles, role), nil
}

// LoginDecision is what a successful password check still owes.
type LoginDecision struct {
	User  store.User
	Level string // auth.LevelFull / LevelMFA / LevelEnroll
}

// Authenticate verifies a username/password and decides the resulting
// session level: full, awaiting-MFA (enrolled), or forced-enrolment.
func (s *Service) Authenticate(username, password string) (LoginDecision, error) {
	id, hash, err := s.store.PasswordHash(username)
	if err != nil {
		return LoginDecision{}, ErrInvalidCredentials
	}
	if !auth.CheckPassword(hash, password) {
		return LoginDecision{}, ErrInvalidCredentials
	}
	u, err := s.store.GetUser(id)
	if err != nil {
		return LoginDecision{}, err
	}
	level, err := s.levelFor(u)
	if err != nil {
		return LoginDecision{}, err
	}
	return LoginDecision{User: u, Level: level}, nil
}

// levelFor computes the post-password session level for a user: if they
// already have a second factor they must verify it; else if their role
// requires MFA they must enrol; otherwise they are fully in.
func (s *Service) levelFor(u store.User) (string, error) {
	if u.MFAEnrolled() {
		return auth.LevelMFA, nil
	}
	required, err := s.RoleRequiresMFA(u.Role)
	if err != nil {
		return "", err
	}
	if required {
		return auth.LevelEnroll, nil
	}
	return auth.LevelFull, nil
}

// Store exposes the underlying store for the HTTP layer.
func (s *Service) Store() *store.Store { return s.store }

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
)

func splitRoles(s string) []string {
	var out []string
	for _, r := range strings.Split(s, ",") {
		if r = strings.TrimSpace(r); r != "" {
			out = append(out, r)
		}
	}
	return out
}

func validateUsername(u string) error {
	u = strings.TrimSpace(u)
	if len(u) < 2 || len(u) > 64 {
		return errors.New("username must be 2-64 characters")
	}
	for _, r := range u {
		if r < 0x20 || r == 0x7f {
			return errors.New("username contains control characters")
		}
	}
	return nil
}

// ValidateUsername is the exported guard for user-creation endpoints.
func ValidateUsername(u string) error { return validateUsername(u) }

// ValidatePassword enforces a minimum password strength.
func ValidatePassword(p string) error {
	if len(p) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	return nil
}
