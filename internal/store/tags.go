package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

var ErrAutomaticTag = errors.New("automatic tags cannot be assigned manually")

// Tag rules are JSON owned and validated by the tags package.
type Tag struct {
	ID    int64           `json:"id"`
	Name  string          `json:"name"`
	Mode  string          `json:"mode"`
	Rules json.RawMessage `json:"rules"`
}

// Smart reports whether this tag is derived exclusively from matching rules.
func (t Tag) Smart() bool {
	var rules []json.RawMessage
	return json.Unmarshal(t.Rules, &rules) == nil && len(rules) > 0
}

func (s *Store) ListTags() ([]Tag, error) {
	rows, err := s.db.Query(`SELECT id, name, mode, rules FROM tags ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Tag{}
	for rows.Next() {
		var t Tag
		var rules string
		if err := rows.Scan(&t.ID, &t.Name, &t.Mode, &rules); err != nil {
			return nil, err
		}
		t.Rules = json.RawMessage(rules)
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) SaveTag(t Tag) (Tag, error) {
	if t.ID == 0 {
		res, err := s.db.Exec(`INSERT INTO tags(name, mode, rules) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM tags) < 128`, t.Name, t.Mode, string(t.Rules))
		if err != nil {
			if isUnique(err) {
				return t, ErrExists
			}
			return t, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return t, errors.New("maximum of 128 tags reached")
		}
		t.ID, _ = res.LastInsertId()
	} else {
		err := s.touch(`UPDATE tags SET name=?, mode=?, rules=? WHERE id=?`, t.Name, t.Mode, string(t.Rules), t.ID)
		if isUnique(err) {
			return t, ErrExists
		}
		if err != nil {
			return t, err
		}
	}
	return t, nil
}
func (s *Store) DeleteTag(id int64) error { return s.touch(`DELETE FROM tags WHERE id=?`, id) }

func (s *Store) FileTags() (map[string][]int64, error) {
	rows, err := s.db.Query(`SELECT path, tag_id FROM file_tags ORDER BY tag_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]int64{}
	for rows.Next() {
		var path string
		var id int64
		if err := rows.Scan(&path, &id); err != nil {
			return nil, err
		}
		out[path] = append(out[path], id)
	}
	return out, rows.Err()
}
func (s *Store) SetFileTags(path string, ids []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`DELETE FROM file_tags WHERE path=?`, path); err != nil {
		return err
	}
	for _, id := range ids {
		if _, err = tx.Exec(`INSERT OR IGNORE INTO file_tags(path,tag_id) VALUES (?,?)`, path, id); err != nil {
			if strings.Contains(err.Error(), ErrAutomaticTag.Error()) {
				return ErrAutomaticTag
			}
			return err
		}
	}
	return tx.Commit()
}

// MoveFileTags updates an entire subtree using path boundaries, without SQL LIKE
// wildcards (filenames may themselves contain % or _). A clone keeps the source.
func (s *Store) MoveFileTags(from, to string, clone bool) error {

	if from == to {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := deleteTagPaths(tx, to); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO file_tags(path,tag_id)
 SELECT ? || substr(path,length(?)+1),tag_id FROM file_tags
 WHERE path=? OR substr(path,1,length(?)+1)=? || '/'`, to, from, from, from, from); err != nil {
		return err
	}
	if !clone {
		if err := deleteTagPaths(tx, from); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func deleteTagPaths(tx *sql.Tx, path string) error {
	_, err := tx.Exec(`DELETE FROM file_tags WHERE path=? OR substr(path,1,length(?)+1)=? || '/'`, path, path, path)
	return err
}
func (s *Store) DeleteFileTags(path string) error {
	return s.DeleteFileTagsBatch([]string{path})
}

func (s *Store) DeleteFileTagsBatch(paths []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, p := range paths {
		if err := deleteTagPaths(tx, p); err != nil {
			return err
		}
	}
	return tx.Commit()
}
