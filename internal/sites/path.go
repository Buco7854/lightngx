package sites

import "path/filepath"

// FilePath is the source configuration for a listed virtual host, including
// when the available directory is configured outside the conventional path.
func (m *Manager) FilePath(name string) string { return filepath.Join(m.available, name) }
