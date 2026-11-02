//go:build windows

package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestBackupProgressStream(t *testing.T) {
	var log bytes.Buffer
	var updates []backupProgress
	w := &progressOutput{writer: &log, publish: func(p backupProgress) { updates = append(updates, p) }}
	status := `{"message_type":"status","percent_done":0.42,"bytes_done":42,"total_bytes":100,"files_done":2,"total_files":5,"seconds_elapsed":10,"seconds_remaining":14,"current_files":["private-filename"]}` + "\n"
	input := status + "not JSON\n" + `{"message_type":"summary","total_bytes_processed":100}` + "\n" + strings.Repeat("x", 70000) + "\n" + `{"message_type":"status","percent_done":2}` + "\n" + status
	for i := 0; i < len(input); i += 17 {
		end := i + 17
		if end > len(input) {
			end = len(input)
		}
		if _, err := w.Write([]byte(input[i:end])); err != nil {
			t.Fatal(err)
		}
	}
	if log.String() != input || len(updates) != 2 {
		t.Fatalf("log changed or invalid status accepted: %d updates", len(updates))
	}
	p := updates[0]
	if p.PercentDone != 0.42 || p.BytesDone != 42 || p.TotalBytes != 100 || p.FilesDone != 2 || p.SecondsRemaining != 14 {
		t.Fatalf("lost measurements: %+v", p)
	}
	data, _ := json.Marshal(p)
	if bytes.Contains(data, []byte("private-filename")) {
		t.Fatal("file paths leaked to controller")
	}
	if cap(w.line) > 131072 {
		t.Fatal("unbounded progress buffer")
	}
}
