package server

import (
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Buco7854/lightngx/internal/auth"
)

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data:; connect-src 'self'; font-src 'self'; "+
				"object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

// csrfProtect rejects state-changing cross-origin requests. Browsers always
// send Sec-Fetch-Site and/or Origin on such requests; a cookie-authenticated
// request carrying neither is rejected. Token-authenticated (no cookie)
// clients such as scripts are not a CSRF vector and may omit both.
func csrfProtect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		reject := func() { http.Error(w, "cross-origin request rejected", http.StatusForbidden) }
		site := r.Header.Get("Sec-Fetch-Site")
		origin := r.Header.Get("Origin")
		if site != "" && site != "same-origin" && site != "none" {
			reject()
			return
		}
		if origin != "" {
			u, err := url.Parse(origin)
			if err != nil || !strings.EqualFold(u.Host, r.Host) {
				reject()
				return
			}
		}
		if site == "" && origin == "" {
			if _, err := r.Cookie(auth.SessionCookie); err == nil {
				reject()
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// clientIP returns the real client address, honouring X-Forwarded-For
// only when the direct peer is a trusted proxy.
func (s *Server) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer := net.ParseIP(host)
	if peer == nil {
		return host
	}
	trusted := false
	for _, cidr := range s.cfg.TrustedProxies {
		if cidr.Contains(peer) {
			trusted = true
			break
		}
	}
	if !trusted {
		return host
	}
	xff := r.Header.Get("X-Forwarded-For")
	if xff == "" {
		return host
	}
	parts := strings.Split(xff, ",")
	// Rightmost non-trusted hop is the client.
	for i := len(parts) - 1; i >= 0; i-- {
		ip := net.ParseIP(strings.TrimSpace(parts[i]))
		if ip == nil {
			continue
		}
		inTrusted := false
		for _, cidr := range s.cfg.TrustedProxies {
			if cidr.Contains(ip) {
				inTrusted = true
				break
			}
		}
		if !inTrusted {
			return ip.String()
		}
	}
	return host
}

// liveSession returns the request's session only if it is still valid. A
// local session is looked up in the session store, so it is rejected the
// moment it is revoked (logout, individual revoke, password/MFA reset) or its
// user is deleted, and its role is read live so a demotion takes effect at
// once. OIDC sessions stay stateless.
func (s *Server) liveSession(r *http.Request) (*auth.Session, bool) {
	tok, err := s.sessions.FromRequest(r)
	if err != nil {
		return nil, false
	}
	if tok.Method != "local" {
		return tok, true
	}
	rec, err := s.accounts.Store().GetSession(tok.Sid)
	if err != nil {
		return nil, false
	}
	if time.Since(rec.LastSeen) > time.Minute {
		_ = s.accounts.Store().TouchSession(rec.Sid, s.clientIP(r))
	}
	return &auth.Session{
		UserID: rec.UserID, User: rec.Username, Role: rec.Role,
		Method: rec.Method, Level: rec.Level, Sid: rec.Sid,
	}, true
}

// requireStep admits any valid session (partial or full). Used by the MFA
// and enrolment endpoints a partial session must reach to complete itself.
func (s *Server) requireStep(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, ok := s.liveSession(r)
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		r = r.WithContext(withSession(r.Context(), sess))
		next.ServeHTTP(w, r)
	})
}

// requireAuth admits only fully-authenticated, still-valid sessions.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, ok := s.liveSession(r)
		if !ok || sess.Level != auth.LevelFull {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		r = r.WithContext(withSession(r.Context(), sess))
		next.ServeHTTP(w, r)
	})
}

// requireAdmin gates admin-only endpoints. It runs behind requireAuth, so
// the session is already full; it only checks the role.
func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, ok := sessionFrom(r.Context())
		if !ok || !sess.IsAdmin() {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "admin only"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) audit(r *http.Request, action string, fields ...any) {
	user := "-"
	if sess, ok := sessionFrom(r.Context()); ok {
		user = sess.User
	} else if k, ok := apiKeyFrom(r.Context()); ok {
		user = "apikey:" + k.Name
	}
	all := append([]any{"action", action, "user", user, "ip", s.clientIP(r)}, fields...)
	slog.Info("audit", all...)
}
