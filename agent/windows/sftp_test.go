//go:build windows

package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The copied test binary records exactly what Restic passes to its SSH child.
func TestMain(m *testing.M) {
	if mode := os.Getenv("FORTRESS_TEST_CANCEL_HELPER"); mode != "" {
		if mode == "parent" {
			exe, _ := os.Executable()
			child := exec.Command(exe)
			for _, item := range os.Environ() {
				if !strings.HasPrefix(item, "FORTRESS_TEST_CANCEL_HELPER=") {
					child.Env = append(child.Env, item)
				}
			}
			child.Env = append(child.Env, "FORTRESS_TEST_CANCEL_HELPER=child")
			if child.Start() != nil {
				os.Exit(2)
			}
			_ = child.Wait()
			os.Exit(0)
		}
		if os.WriteFile(os.Getenv("FORTRESS_TEST_CANCEL_PID"), []byte(strconv.Itoa(os.Getpid())), 0600) != nil {
			os.Exit(2)
		}
		time.Sleep(30 * time.Second)
		os.Exit(0)
	}

	if capture := os.Getenv("FORTRESS_TEST_SSH_CAPTURE"); capture != "" {
		args := os.Args[1:]
		if len(args) < 2 || args[0] != "-F" {
			os.Exit(2)
		}
		configuration, err := os.ReadFile(args[1])
		if err != nil {
			os.Exit(2)
		}
		data, err := json.Marshal(struct {
			Args          []string
			Configuration string
		}{args, string(configuration)})
		if err != nil {
			os.Exit(2)
		}
		if os.WriteFile(capture, data, 0600) != nil {
			os.Exit(2)
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func TestManagedSFTPUsesOnlyProtectedIdentityAndPinnedHosts(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "user's files")
	if err := os.Mkdir(directory, 0700); err != nil {
		t.Fatal(err)
	}
	key := filepath.Join(directory, "identity")
	hosts := filepath.Join(directory, "known_hosts")
	for _, file := range []string{key, hosts} {
		if err := os.WriteFile(file, []byte("fixture"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	c := Config{Repository: "sftp://backup@storage.example.invalid:23/repo", SFTPKeyFile: key, SFTPKnownHostsFile: hosts}
	args, err := managedSFTPArgs(c)
	if err != nil {
		t.Fatal(err)
	}
	configuration := sftpConfiguration(c)
	for _, required := range []string{filepath.ToSlash(key), filepath.ToSlash(hosts), "StrictHostKeyChecking yes", "IdentitiesOnly yes", "BatchMode yes", "GlobalKnownHostsFile NUL"} {
		if !strings.Contains(configuration, required) {
			t.Fatalf("managed transport lost an identity/trust setting: %s", required)
		}
	}
	if args[0] != filepath.Join(os.Getenv("SystemRoot"), "System32", "OpenSSH", "ssh.exe") {
		t.Fatal("transport must use the native absolute SSH executable")
	}
	c.SSHCommand = "custom executable"
	if _, err = managedSFTPArgs(c); err == nil {
		t.Fatal("arbitrary command mixed with managed identity")
	}
	c.SSHCommand = ""
	c.Repository = "sftp://-bad@-option:23/repo"
	if _, err = managedSFTPArgs(c); err == nil {
		t.Fatal("option-like host accepted")
	}
	c.Repository = "sftp://backup@storage.example.invalid:23/repo"
	c.SFTPKnownHostsFile = ""
	if _, err = managedSFTPArgs(c); err == nil {
		t.Fatal("unpinned managed transport accepted")
	}
}

func TestResticManagedSFTPArgv(t *testing.T) {
	restic := os.Getenv("FORTRESS_TEST_RESTIC")
	if restic == "" {
		t.Skip("actual Restic interoperability runs in the Windows verification job")
	}
	nativeRoot := os.Getenv("SystemRoot")
	directory := filepath.Join(t.TempDir(), "user's files")
	sshFolder := filepath.Join(directory, "System32", "OpenSSH")
	if err := os.MkdirAll(sshFolder, 0700); err != nil {
		t.Fatal(err)
	}
	own, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	binary, err := os.ReadFile(own)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sshFolder, "ssh.exe"), binary, 0700); err != nil {
		t.Fatal(err)
	}
	c := Config{ResticPath: restic, Repository: "sftp://backup@storage.example.invalid:23/repo", PasswordFile: filepath.Join(directory, "password"), SFTPKeyFile: filepath.Join(directory, "identity"), SFTPKnownHostsFile: filepath.Join(directory, "known_hosts")}
	for _, file := range []string{c.PasswordFile, c.SFTPKeyFile, c.SFTPKnownHostsFile} {
		if err := os.WriteFile(file, []byte(filepath.Base(directory)), 0600); err != nil {
			t.Fatal(err)
		}
	}
	capture := filepath.Join(directory, "argv.json")
	t.Setenv("SystemRoot", directory)
	t.Setenv("FORTRESS_TEST_SSH_CAPTURE", capture)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if execute(ctx, c, "snapshots") == nil {
		t.Fatal("an SSH recorder is not an SFTP server")
	}
	data, err := os.ReadFile(capture)
	if err != nil {
		t.Fatalf("Restic never invoked the configured SSH identity: %v", err)
	}
	var captured struct {
		Args          []string
		Configuration string
	}
	if err := json.Unmarshal(data, &captured); err != nil {
		t.Fatal(err)
	}
	args := captured.Args
	if len(args) < 2 {
		t.Fatal("missing protected SSH configuration")
	}
	if filepath.Dir(args[1]) != directory {
		t.Fatal("SSH configuration escaped the protected directory")
	}
	if _, err := os.Stat(args[1]); !os.IsNotExist(err) {
		t.Fatal("temporary SSH configuration was not removed")
	}
	if captured.Configuration != sftpConfiguration(c) {
		t.Fatal("protected identity or host pin changed")
	}
	expected := []string{"-F", args[1], "-p", "23", "-l", "backup", "-s", "--", "storage.example.invalid", "sftp"}
	if !reflect.DeepEqual(args, expected) {
		t.Fatalf("Restic changed protected path or trust arguments:\ngot %q\nwant %q", args, expected)
	}
	nativeSSH := filepath.Join(nativeRoot, "System32", "OpenSSH", "ssh.exe")
	if _, err := os.Stat(nativeSSH); err == nil {
		t.Setenv("SystemRoot", nativeRoot)
		configuration := filepath.Join(directory, "native-config")
		if err := os.WriteFile(configuration, []byte(captured.Configuration), 0600); err != nil {
			t.Fatal(err)
		}
		args[1] = configuration
		check := exec.CommandContext(ctx, nativeSSH, append([]string{"-G"}, args...)...)
		if output, err := check.CombinedOutput(); err != nil {
			t.Fatalf("native OpenSSH rejected managed trust settings: %v\n%s", err, output)
		}
	}
}
