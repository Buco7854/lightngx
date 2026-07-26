package sites

import (
	"reflect"
	"testing"
)

func TestSummarizeSite(t *testing.T) {
	got := summarize(sampleSite, false)
	want := []string{"example.com", "www.example.com"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("site domains = %v, want %v", got, want)
	}
}

func TestSummarizeStream(t *testing.T) {
	src := `server {
    listen 12345;
    proxy_pass 127.0.0.1:5432;
}
server {
    listen [::]:8443 ssl;
    proxy_pass backend_upstream;
}`
	got := summarize(src, true)
	want := []string{"12345 → 127.0.0.1:5432", "[::]:8443 → backend_upstream"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("stream labels = %v, want %v", got, want)
	}
}
