// Package tags evaluates bounded, declarative rules against confined config
// files. Only match IDs are cached, never configuration contents or secrets.
package tags

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/Buco7854/lightngx/internal/confdir"
	"github.com/Buco7854/lightngx/internal/store"
)

type Rule struct {
	Field      string `json:"field"` // path or content
	Op         string `json:"op"`    // contains, not_contains, regex, or not_regex
	Value      string `json:"value"`
	IgnoreCase bool   `json:"ignoreCase"`
}
type compiled struct {
	tag   store.Tag
	rules []Rule
	regex []*regexp.Regexp
}

func compile(t store.Tag) (compiled, error) {
	c := compiled{tag: t}
	if t.Mode != "all" && t.Mode != "any" {
		return c, fmt.Errorf("mode must be all or any")
	}
	if err := json.Unmarshal(t.Rules, &c.rules); err != nil {
		return c, fmt.Errorf("invalid rules")
	}
	if len(c.rules) > 16 {
		return c, fmt.Errorf("maximum of 16 rules per tag")
	}
	sort.SliceStable(c.rules, func(i, j int) bool { return c.rules[i].Field == "path" && c.rules[j].Field != "path" })
	for index, r := range c.rules {
		if r.Field != "path" && r.Field != "content" {
			return c, fmt.Errorf("invalid rule field or operator")
		}
		switch r.Op {
		case "contains", "not_contains", "regex", "not_regex":
		default:
			return c, fmt.Errorf("invalid rule field or operator")
		}
		if strings.TrimSpace(r.Value) == "" || len(r.Value) > 4096 {
			return c, fmt.Errorf("rule value must contain 1–4096 bytes of nonblank text")
		}
		var re *regexp.Regexp
		if r.Op == "regex" || r.Op == "not_regex" {
			pattern := r.Value
			if r.IgnoreCase {
				pattern = "(?i)" + pattern
			}
			var err error
			re, err = regexp.Compile(pattern)
			if err != nil {
				return c, fmt.Errorf("invalid regular expression: %w", err)
			}
		}
		if (r.Op == "contains" || r.Op == "not_contains") && r.IgnoreCase {
			c.rules[index].Value = strings.ToLower(r.Value)
		}
		c.regex = append(c.regex, re)
	}
	return c, nil
}
func Validate(t *store.Tag) error {
	if strings.ContainsFunc(t.Name, unicode.IsControl) {
		return fmt.Errorf("tag name cannot contain control characters")
	}
	t.Name = strings.TrimSpace(t.Name)
	if t.Name == "" || utf8.RuneCountInString(t.Name) > 48 || !utf8.ValidString(t.Name) || strings.ContainsFunc(t.Name, unicode.IsControl) {
		return fmt.Errorf("tag name must be 1–48 characters without control characters")
	}
	c, err := compile(*t)
	if err != nil {
		return err
	}
	if c.rules == nil {
		t.Rules = json.RawMessage(`[]`)
	}
	return nil
}

type cached struct {
	info os.FileInfo
	ids  []int64
}
type Engine struct {
	mu        sync.Mutex
	signature string
	cache     map[string]cached
	rules     []compiled
}

// Snapshot loads all definitions and assignments in two queries, avoiding a
// database query per file. Callers serialize it with metadata mutations.
type Snapshot struct {
	engine    *Engine
	rules     []compiled
	manual    map[string][]int64
	signature string
}

func (e *Engine) Snapshot(db *store.Store) (*Snapshot, error) {
	defs, err := db.ListTags()
	if err != nil {
		return nil, err
	}
	manual, err := db.FileTags()
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(defs)
	s := &Snapshot{engine: e, manual: manual, signature: string(b)}

	e.mu.Lock()
	defer e.mu.Unlock()
	if e.signature == s.signature {
		s.rules = e.rules
		return s, nil
	}
	for _, t := range defs {
		c, err := compile(t)
		if err != nil {
			return nil, err
		}
		if len(c.rules) > 0 {
			s.rules = append(s.rules, c)
		}
	}
	e.cache = make(map[string]cached)
	e.signature = s.signature
	e.rules = s.rules
	return s, nil
}

func (s *Snapshot) Match(d *confdir.Dir, path string) []int64 { return s.match(d, path, true) }

// Automatic returns only rule-derived labels, including labels also assigned
// manually, so clients can distinguish the two independent sources.
func (s *Snapshot) Automatic(d *confdir.Dir, path string) []int64 { return s.match(d, path, false) }

func (s *Snapshot) match(d *confdir.Dir, path string, manual bool) []int64 {
	key, info, err := d.FileInfo(path)
	if err != nil {
		return nil
	}
	ids := []int64{}
	if manual {
		ids = append(ids, s.manual[key]...)
	}
	if len(s.rules) == 0 {
		return ids
	}
	// Match paths against the canonical configuration path, including its directory.
	e := s.engine
	e.mu.Lock()
	hit, ok := e.cache[key]
	ok = ok && e.signature == s.signature
	e.mu.Unlock()
	if ok && os.SameFile(hit.info, info) && hit.info.ModTime() == info.ModTime() && hit.info.Size() == info.Size() && hit.info.Mode() == info.Mode() {
		return union(ids, hit.ids)
	}
	var content, lowerContent, lowerPath string
	contentLoaded, readable := false, true
	readContent := func() {
		if contentLoaded {
			return
		}
		b, err := d.Read(key)
		readable = err == nil
		content = string(b)
		contentLoaded = true
	}
	var smart []int64
	for _, c := range s.rules {
		matched := c.tag.Mode == "all"
		for i, r := range c.rules {
			text := filepath.ToSlash(key)
			if r.Field == "content" {
				readContent()
				text = content
			}
			yes := false
			if r.Field != "content" || readable {
				if re := c.regex[i]; re != nil {
					yes = re.MatchString(text)
				} else {
					value := r.Value
					if r.IgnoreCase {
						if r.Field == "content" {
							if lowerContent == "" {
								lowerContent = strings.ToLower(content)
							}
							text = lowerContent
						} else {
							if lowerPath == "" {
								lowerPath = strings.ToLower(key)
							}
							text = lowerPath
						}
					}
					yes = strings.Contains(text, value)
				}
				// An unreadable file is unknown, not proof that text is absent.
				if r.Op == "not_contains" || r.Op == "not_regex" {
					yes = !yes
				}
			}
			if c.tag.Mode == "all" && !yes {
				matched = false
				break
			}
			if c.tag.Mode == "any" && yes {
				matched = true
				break
			}
		}
		if matched {
			smart = append(smart, c.tag.ID)
		}
	}
	e.mu.Lock()
	if e.signature == s.signature && readable {
		if len(e.cache) >= 4096 {
			e.cache = make(map[string]cached)
		}
		e.cache[key] = cached{info: info, ids: smart}
	}
	e.mu.Unlock()
	return union(ids, smart)
}
func union(a, b []int64) []int64 {
	for _, id := range b {
		found := false
		for _, existing := range a {
			if id == existing {
				found = true
				break
			}
		}
		if !found {
			a = append(a, id)
		}
	}
	return a
}
