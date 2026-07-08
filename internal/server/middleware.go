package server

import (
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"

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

// csrfProtect rejects state-changing cross-origin requests. Browsers send
// Sec-Fetch-Site and/or Origin on all such requests; non-browser clients
// with a valid session cookie are not a CSRF vector but still pass by
// omitting both headers is not possible from a browser form/fetch.
func csrfProtect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
			http.Error(w, "cross-origin request rejected", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || !strings.EqualFold(u.Host, r.Host) {
				http.Error(w, "cross-origin request rejected", http.StatusForbidden)
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

// requireStep admits any valid session (partial or full) and attaches it
// to the context. Used by the MFA/enrolment endpoints, which a partial
// session must reach to complete itself.
func (s *Server) requireStep(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, err := s.sessions.FromRequest(r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		r = r.WithContext(withSession(r.Context(), sess))
		next.ServeHTTP(w, r)
	})
}

// requireAuth admits only fully-authenticated sessions. A partial session
// (owing MFA verification or enrolment) is rejected with 401.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, err := s.sessions.FromRequest(r)
		if err != nil || sess.Level != auth.LevelFull {
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
