package store

import (
	"database/sql"
	"strings"
)

// FileTagCounts only reads assignments for the selected canonical paths. Callers
// deduplicate aliases so a file is counted once, even through enabled symlinks.
func (s *Store) FileTagCounts(paths []string) (map[int64]int, error) {
	counts := map[int64]int{}
	if len(paths) == 0 {
		return counts, nil
	}
	args := make([]any, len(paths))
	for i, path := range paths {
		args[i] = path
	}
	rows, err := s.db.Query(`SELECT tag_id, COUNT(*) FROM file_tags WHERE path IN (`+strings.TrimSuffix(strings.Repeat("?,", len(paths)), ",")+`) GROUP BY tag_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var count int
		if err := rows.Scan(&id, &count); err != nil {
			return nil, err
		}
		counts[id] = count
	}
	return counts, rows.Err()
}

// ChangeFileTags applies a delta atomically. Other labels on each file are
// preserved. Validate inside the transaction, including for removals, so a tag
// deleted or converted to smart cannot be silently treated as a manual label.
func (s *Store) ChangeFileTags(paths []string, ids []int64, remove bool) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, id := range ids {
		var rules string
		if err := tx.QueryRow(`SELECT rules FROM tags WHERE id=?`, id).Scan(&rules); err != nil {
			if err == sql.ErrNoRows {
				return ErrNotFound
			}
			return err
		}
		if (Tag{Rules: []byte(rules)}).Smart() {
			return ErrAutomaticTag
		}
	}
	query := `INSERT OR IGNORE INTO file_tags(path,tag_id) VALUES (?,?)`
	if remove {
		query = `DELETE FROM file_tags WHERE path=? AND tag_id=?`
	}
	stmt, err := tx.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, path := range paths {
		for _, id := range ids {
			if _, err := stmt.Exec(path, id); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}
