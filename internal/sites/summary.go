package sites

import "strings"

// serverBlocks returns, for each top-level server block, a map of
// directive name to its accumulated values (server-level only).
func serverBlocks(src string) []map[string][]string {
	tokens := lex(src)
	var blocks []map[string][]string
	depth := 0
	i := 0
	for i < len(tokens) {
		t := tokens[i]
		if depth == 0 && t.kind == 'w' && t.text == "server" && i+1 < len(tokens) && tokens[i+1].kind == '{' {
			i += 2
			blocks = append(blocks, captureServerAll(tokens, &i))
			continue
		}
		switch t.kind {
		case '{':
			depth++
		case '}':
			if depth > 0 {
				depth--
			}
		}
		i++
	}
	return blocks
}

func captureServerAll(tokens []token, i *int) map[string][]string {
	out := map[string][]string{}
	var cur []string
	depth := 0
	for *i < len(tokens) {
		t := tokens[*i]
		*i++
		switch t.kind {
		case 'w':
			if depth == 0 {
				cur = append(cur, t.text)
			}
		case ';':
			if depth == 0 && len(cur) > 0 {
				out[cur[0]] = append(out[cur[0]], cur[1:]...)
				cur = nil
			}
		case '{':
			depth++
			cur = nil
		case '}':
			if depth == 0 {
				return out
			}
			depth--
		}
	}
	return out
}

func unquote(s string) string {
	if len(s) >= 2 && (s[0] == '"' || s[0] == '\'') && s[len(s)-1] == s[0] {
		return s[1 : len(s)-1]
	}
	return s
}

// summarize extracts the human-facing labels shown as badges for a vhost:
// server_name values for HTTP sites, or "listen → proxy_pass" for streams.
func summarize(src string, stream bool) []string {
	blocks := serverBlocks(src)
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		s = strings.TrimSpace(unquote(s))
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	for _, b := range blocks {
		if stream {
			var listen, target string
			if v := b["listen"]; len(v) > 0 {
				listen = v[0]
			}
			if v := b["proxy_pass"]; len(v) > 0 {
				target = v[0]
			}
			switch {
			case listen != "" && target != "":
				add(listen + " → " + target)
			case listen != "":
				add(listen)
			case target != "":
				add("→ " + target)
			}
		} else {
			for _, sn := range b["server_name"] {
				if sn == "_" {
					continue
				}
				add(sn)
			}
		}
	}
	if len(out) > 10 {
		out = out[:10]
	}
	return out
}
