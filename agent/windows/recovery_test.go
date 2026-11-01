//go:build windows

package main

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestRecoveryValidation(t *testing.T) {
	id := "11111111-1111-1111-1111-111111111111"
	sid := strings.Repeat("a", 64)
	for _, p := range []string{"../file", "/C/../Windows", "/C/./file", "/C\\Windows", "/C/file\n"} {
		if err := validateOperation(lease{ID: id, Operation: "restore", Request: operationRequest{SnapshotID: sid, Paths: []string{p}}}); err == nil {
			t.Fatalf("accepted unsafe path %q", p)
		}
	}
	if err := validateOperation(lease{ID: id, Operation: "restore", Request: operationRequest{SnapshotID: sid, Paths: []string{}}}); err == nil {
		t.Fatal("empty selection became full restore")
	}
	if err := validateOperation(lease{ID: id, Operation: "restore", Request: operationRequest{SnapshotID: sid}}); err != nil {
		t.Fatal(err)
	}
	pattern := literalInclude("document[1].txt")
	if match, err := filepath.Match(pattern, "document[1].txt"); err != nil || !match {
		t.Fatal("literal Windows filename was not matched", pattern, err)
	}
	if match, _ := filepath.Match(pattern, "document1.txt"); match {
		t.Fatal("literal Windows filename expanded as a glob")
	}
	c := Config{Host: "this-host", AgentID: id}
	if ownSnapshot(c, savedSnapshot{Hostname: "other-host"}) || ownSnapshot(c, savedSnapshot{Hostname: c.Host, Tags: []string{"fortress-agent:other"}}) {
		t.Fatal("cross-client snapshot accepted")
	}
	root := t.TempDir()
	c.AgentTokenFile = filepath.Join(root, "token")
	unlock, err := lockOperations(c)
	if err != nil {
		t.Fatal(err)
	}
	if second, err := lockOperations(c); err == nil {
		second()
		t.Fatal("overlapping local operation acquired lock")
	}
	unlock()
	unlock, err = lockOperations(c)
	if err != nil {
		t.Fatal(err)
	}
	unlock()
	junction := filepath.Join(root, "redirect")
	if err := exec.Command("cmd.exe", "/c", "mklink", "/J", junction, t.TempDir()).Run(); err != nil {
		t.Fatal(err)
	}
	if err := noReparseDirectories(filepath.Join(junction, "restores")); err == nil {
		t.Fatal("restore traversed a junction")
	}
}

func TestManagedRecoveryRoundTrip(t *testing.T) {
	restic := os.Getenv("FORTRESS_TEST_RESTIC")
	if restic == "" {
		t.Skip("real Restic fixture is provided by Windows verification")
	}
	root := t.TempDir()
	source := filepath.Join(root, "source")
	if err := os.Mkdir(source, 0700); err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string]string{"document[1].txt": "literal selection", "document1.txt": "must not match glob", "other.txt": "full restore only"} {
		if err := os.WriteFile(filepath.Join(source, name), []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
	}
	pass := filepath.Join(root, "password")
	if err := os.WriteFile(pass, []byte("ephemeral-test-password"), 0600); err != nil {
		t.Fatal(err)
	}
	c := Config{RepositoryJobID: "66666666-6666-6666-6666-666666666666", ResticPath: restic, Repository: filepath.Join(root, "repository"), PasswordFile: pass, Host: "recovery-test-host", AgentID: "11111111-1111-1111-1111-111111111111", AgentTokenFile: filepath.Join(root, "token"), Sources: []string{source}}
	if err := runRestic(context.Background(), c, []string{"init"}, os.Stdout); err != nil {
		t.Fatal(err)
	}
	if err := execute(context.Background(), c, "backup"); err != nil {
		t.Fatal(err)
	}
	snapshots, err := savedSnapshots(context.Background(), c)
	if err != nil || len(snapshots) != 1 {
		t.Fatalf("snapshots=%v error=%v", snapshots, err)
	}
	sid := snapshots[0].ID
	replacement := c
	replacement.Host = "replacement-laptop"
	replacement.AgentID = "44444444-4444-4444-4444-444444444444"
	replacement.AgentTokenFile = filepath.Join(t.TempDir(), "token")
	own, err := savedSnapshots(context.Background(), replacement)
	if err != nil || len(own) != 0 {
		t.Fatal("replacement must not misidentify the old device", err)
	}
	old, err := savedSnapshots(context.Background(), replacement, true)
	if err != nil || len(old) != 1 {
		t.Fatal("old-device backups are not discoverable", err)
	}
	recovered, err := executeManaged(context.Background(), replacement, lease{ID: "55555555-5555-5555-5555-555555555555", Operation: "restore", Request: operationRequest{SnapshotID: sid, Repository: c.Repository, RepositoryJobID: c.RepositoryJobID, AllDevices: true}})
	if err != nil {
		t.Fatal(err)
	}
	recoveredCount := 0
	if err := filepath.WalkDir(recovered.(map[string]any)["restorePath"].(string), func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			recoveredCount++
			original, err := os.ReadFile(filepath.Join(source, d.Name()))
			if err != nil {
				return err
			}
			restored, err := os.ReadFile(p)
			if err != nil {
				return err
			}
			if string(original) != string(restored) {
				t.Errorf("cross-device content differs: %s", p)
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if recoveredCount != 3 {
		t.Fatal("replacement device recovery lost files", recoveredCount)
	}

	// Exercise the actual JSONL directory protocol, including Windows drive roots.
	dir := "/" + strings.ReplaceAll(strings.ReplaceAll(source, ":", ""), "\\", "/")
	listing, err := executeManaged(context.Background(), c, lease{Operation: "files", Request: operationRequest{SnapshotID: sid, Directory: dir}})
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(listing)
	var parsed struct {
		Entries []savedFile `json:"entries"`
	}
	if err := json.Unmarshal(encoded, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Entries) != 3 {
		t.Fatalf("directory listing: %s", encoded)
	}
	for _, test := range []struct {
		id    string
		paths []string
		count int
	}{{"22222222-2222-2222-2222-222222222222", []string{dir + "/document[1].txt"}, 1}, {"33333333-3333-3333-3333-333333333333", nil, 3}} {
		result, err := executeManaged(context.Background(), c, lease{ID: test.id, Operation: "restore", Request: operationRequest{SnapshotID: sid, Paths: test.paths}})
		if err != nil {
			t.Fatal(err)
		}
		destination := result.(map[string]any)["restorePath"].(string)
		count := 0
		if err := filepath.WalkDir(destination, func(p string, d os.DirEntry, e error) error {
			if e != nil {
				return e
			}
			if !d.IsDir() {
				count++
				original, err := os.ReadFile(filepath.Join(source, d.Name()))
				if err != nil {
					return err
				}
				restored, err := os.ReadFile(p)
				if err != nil {
					return err
				}
				if string(original) != string(restored) {
					t.Errorf("content differs: %s", p)
				}
			}
			return nil
		}); err != nil {
			t.Fatal(err)
		}
		if count != test.count {
			t.Fatalf("restored %d files, want %d", count, test.count)
		}
	}
	if _, err := executeManaged(context.Background(), c, lease{ID: "33333333-3333-3333-3333-333333333333", Operation: "restore", Request: operationRequest{SnapshotID: sid}}); err == nil {
		t.Fatal("reused a restore destination")
	}
}

func TestCancellationStopsResticAndSSHDescendants(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(t.TempDir(), "child-pid")
	t.Setenv("FORTRESS_TEST_CANCEL_HELPER", "parent")
	t.Setenv("FORTRESS_TEST_CANCEL_PID", marker)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	go func() {
		result <- runRestic(ctx, Config{ResticPath: executable, Repository: "fixture", PasswordFile: "fixture"}, []string{"check"}, io.Discard)
	}()
	for attempt := 0; attempt < 100; attempt++ {
		if _, err := os.Stat(marker); err == nil {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	data, err := os.ReadFile(marker)
	if err != nil {
		t.Fatal("fake SSH descendant did not start", err)
	}
	pid, err := strconv.Atoi(string(data))
	if err != nil {
		t.Fatal(err)
	}
	handle, err := syscall.OpenProcess(syscall.PROCESS_QUERY_INFORMATION, false, uint32(pid))
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.CloseHandle(handle)
	cancel()
	select {
	case err := <-result:
		if err == nil {
			t.Fatal("cancellation reported success")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("cancellation did not return")
	}
	var status uint32
	if err := syscall.GetExitCodeProcess(handle, &status); err != nil {
		t.Fatal(err)
	}
	if status == 259 {
		t.Fatal("SSH descendant survived cancellation")
	}
}

func TestReenrollmentDoesNotStrandNewJobsBehindOldLocalState(t *testing.T) {
	root := t.TempDir()
	c := Config{AgentID: "new-enrollment", PreviousAgentID: "old-enrollment", AgentTokenFile: filepath.Join(root, "token")}
	for _, name := range []string{"fortress-pending-report.json", "fortress-active-job.json"} {
		if err := writePending(filepath.Join(root, name), pendingReport{ID: "old-job", Message: "legacy record"}); err != nil {
			t.Fatal(err)
		}
	}
	if err := reconcileEnrollmentState(c); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"fortress-pending-report.json", "fortress-active-job.json"} {
		if _, err := os.Stat(filepath.Join(root, name)); !os.IsNotExist(err) {
			t.Fatal("previous enrollment state was not archived", name, err)
		}
		archived, err := filepath.Glob(filepath.Join(root, name+".previous-*"))
		if err != nil || len(archived) != 1 {
			t.Fatal("previous audit record lost", err)
		}
	}
	// A subsequent run must retain the current identity's pending report, even
	// when an older runtime wrote a legacy record without the optional agent ID.
	pending := filepath.Join(root, "fortress-pending-report.json")
	if err := writePending(pending, pendingReport{ID: "current-job", Message: "current"}); err != nil {
		t.Fatal(err)
	}
	if err := reconcileEnrollmentState(c); err != nil {
		t.Fatal(err)
	}
	saved, err := readPending(pending)
	if err != nil || saved == nil || saved.ID != "current-job" {
		t.Fatal("current pending report was discarded", err)
	}
}
