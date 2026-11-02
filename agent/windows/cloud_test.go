//go:build windows

package main

import (
	"encoding/csv"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCloudOptionsKeepKeysOutOfArguments(t *testing.T) {
	d := t.TempDir()
	key := filepath.Join(d, "azure-key.txt")
	secret := strings.Repeat("a", 86) + "=="
	if err := os.WriteFile(key, []byte(secret), 0600); err != nil {
		t.Fatal(err)
	}
	c := Config{Repository: "azure:backups:/device", AzureAccountName: "testaccount", AzureKeyFile: key}
	args, env, err := cloudOptions(c)
	if err != nil || len(args) != 0 || len(env) != 2 {
		t.Fatalf("Azure setup failed: %v", err)
	}
	if !strings.Contains(strings.Join(env, "\n"), secret) {
		t.Fatal("missing child credential")
	}
	c.AzureKeyFile = "relative"
	if _, _, err = cloudOptions(c); err == nil {
		t.Fatal("relative credential file accepted")
	}
	c.AzureKeyFile = key
	c.AzureAccountName = "bad\naccount"
	if _, _, err = cloudOptions(c); err == nil {
		t.Fatal("invalid account accepted")
	}
}

func TestDriveOptionsUseTrustedExecutableAndProtectedConfig(t *testing.T) {
	d := filepath.Join(t.TempDir(), "Space, comma")
	if err := os.Mkdir(d, 0700); err != nil {
		t.Fatal(err)
	}
	exe := filepath.Join(d, "rclone.exe")
	conf := filepath.Join(d, "rclone.conf")
	for _, p := range []string{exe, conf} {
		if err := os.WriteFile(p, []byte("test-only"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	c := Config{Repository: "rclone:drive:backup", RclonePath: exe, RcloneConfigFile: conf}
	args, env, err := cloudOptions(c)
	if err != nil || len(args) != 2 || len(env) != 1 {
		t.Fatalf("Drive setup failed: %v", err)
	}
	option, err := csv.NewReader(strings.NewReader(args[1])).Read()
	if err != nil || len(option) != 1 || option[0] != "rclone.program="+exe {
		t.Fatal("Rclone executable path was split")
	}
	if env[0] != "RCLONE_CONFIG="+conf {
		t.Fatal("config file was not passed to Rclone")
	}
	c.RclonePath = "rclone.exe"
	if _, _, err = cloudOptions(c); err == nil {
		t.Fatal("PATH-relative executable accepted")
	}
	c.RclonePath = exe
	c.RcloneConfigFile = d
	if _, _, err = cloudOptions(c); err == nil {
		t.Fatal("directory accepted as credentials")
	}
}
