//go:build windows

// Fortress Windows Agent: local, least-privilege Restic runner.
// It never opens a listening port and never executes remote shell commands.
package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

type Config struct {
	ResticPath     string   `json:"resticPath"`
	Repository     string   `json:"repository"`
	PasswordFile   string   `json:"passwordFile"`
	Sources        []string `json:"sources"`
	Excludes       []string `json:"excludes"`
	Host           string   `json:"host"`
	TimeoutMinutes int      `json:"timeoutMinutes"`
	UseVSS         bool     `json:"useVSS"`
	// Optional path to SSH configuration with pinned known_hosts and an SSH key.
	SSHCommand         string `json:"sshCommand"`
	ControllerURL      string `json:"controllerUrl"`
	AgentID            string `json:"agentId"`
	AgentTokenFile     string `json:"agentTokenFile"`
	SFTPKeyFile        string `json:"sftpKeyFile,omitempty"`
	SFTPKnownHostsFile string `json:"sftpKnownHostsFile,omitempty"`
}

func loadConfig(path string) (Config, error) {
	var c Config
	file, err := os.Open(path)
	if err != nil {
		return c, err
	}
	defer file.Close()
	// Windows PowerShell 5.1 and common Windows editors can prefix UTF-8 JSON with a BOM.
	data, err := io.ReadAll(io.LimitReader(file, (1<<20)+1))
	if err != nil {
		return c, err
	}
	if len(data) > 1<<20 {
		return c, errors.New("config too large")
	}
	decoder := json.NewDecoder(strings.NewReader(strings.TrimPrefix(string(data), "\xef\xbb\xbf")))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&c); err != nil {
		return c, err
	}
	if !filepath.IsAbs(c.ResticPath) {
		return c, errors.New("resticPath must be an absolute, trusted executable path")
	}
	if filepath.Ext(c.ResticPath) != ".exe" {
		return c, errors.New("resticPath must point to an exe")
	}
	if file, err := os.Lstat(c.ResticPath); err != nil || file.Mode()&os.ModeSymlink != 0 {
		return c, errors.New("restic executable missing or a symbolic link")
	}
	if c.Repository == "" || c.PasswordFile == "" || len(c.Sources) == 0 {
		return c, errors.New("repository, passwordFile and sources required")
	}
	if !strings.HasPrefix(c.Repository, "sftp:") && !strings.HasPrefix(c.Repository, "rest:") && !strings.HasPrefix(c.Repository, "s3:") && !strings.HasPrefix(c.Repository, "b2:") {
		return c, errors.New("repository must use an explicit remote backend")
	}
	if c.Host == "" {
		c.Host, _ = os.Hostname()
	}
	if c.TimeoutMinutes == 0 {
		c.TimeoutMinutes = 240
	}
	if c.TimeoutMinutes < 1 || c.TimeoutMinutes > 240 {
		return c, errors.New("timeoutMinutes must be 1..240")
	}
	if !filepath.IsAbs(c.PasswordFile) {
		return c, errors.New("passwordFile must be absolute")
	}
	if _, err = os.Stat(c.PasswordFile); err != nil {
		return c, fmt.Errorf("password file: %w", err)
	}
	if c.AgentTokenFile != "" && !filepath.IsAbs(c.AgentTokenFile) {
		return c, errors.New("agentTokenFile must be absolute")
	}
	for _, source := range c.Sources {
		if !filepath.IsAbs(source) {
			return c, fmt.Errorf("source must be absolute: %q", source)
		}
		if _, err = os.Stat(source); err != nil {
			return c, fmt.Errorf("source %q: %w", source, err)
		}
	}
	for _, exclude := range c.Excludes {
		if strings.TrimSpace(exclude) == "" {
			return c, errors.New("empty exclude")
		}
	}
	if _, err := managedSFTPArgs(c); err != nil {
		return c, err
	}
	return c, nil
}

func execute(ctx context.Context, c Config, operation string) error {
	args := []string{}
	switch operation {
	case "backup":
		args = append(args, "backup", "--json", "--exclude-caches")
		if c.UseVSS {
			args = append(args, "--use-fs-snapshot")
		}
		if c.Host != "" {
			args = append(args, "--host", c.Host)
		}
		if c.AgentID != "" {
			args = append(args, "--tag", "fortress-agent:"+c.AgentID)
		}
		for _, v := range c.Excludes {
			args = append(args, "--exclude", v)
		}
		args = append(args, "--")
		args = append(args, c.Sources...)
	case "check":
		args = append(args, "check")
	case "snapshots":
		args = append(args, "snapshots", "--json")
	default:
		return errors.New("unsupported operation")
	}
	return runRestic(ctx, c, args, os.Stdout)
}

func runRestic(ctx context.Context, c Config, arguments []string, output io.Writer) error {
	args := []string{"--repo", c.Repository, "--password-file", c.PasswordFile}
	transport, cleanup, err := prepareSFTP(c)
	if err != nil {
		return err
	}
	defer cleanup()
	if transport != "" {
		// Restic's option flag parses CSV before parsing the SSH argv string.
		var option strings.Builder
		writer := csv.NewWriter(&option)
		if err := writer.Write([]string{"sftp.command=" + transport}); err != nil {
			return err
		}
		writer.Flush()
		args = append(args, "-o", strings.TrimSuffix(option.String(), "\n"))
	}
	args = append(args, arguments...)
	cmd := exec.CommandContext(ctx, c.ResticPath, args...)
	cmd.Cancel = func() error {
		killer := exec.Command(filepath.Join(os.Getenv("SystemRoot"), "System32", "taskkill.exe"), "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
		killer.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		return killer.Run()
	}
	cmd.WaitDelay = 5 * time.Second
	cmd.Stdin = nil
	cmd.Stdout = output
	cmd.Stderr = os.Stderr
	if c.SSHCommand != "" {
		cmd.Env = append(os.Environ(), "RESTIC_SFTP_COMMAND="+c.SSHCommand)
	}
	err = cmd.Run()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return err
}

func main() {
	if len(os.Args) == 1 {
		message, _ := syscall.UTF16PtrFromString("This is the Fortress Backup background agent.\n\nDownload and run the FortressBackup-Setup installer from GitHub Releases. After installation, open Fortress Backup from the Start menu to connect this laptop and choose folders.\n\nEnrollment in the dashboard creates credentials; it does not install the app.\n\nhttps://github.com/InSelfControll/FortressBackup/releases")
		title, _ := syscall.UTF16PtrFromString("Fortress Backup setup")
		syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(message)), uintptr(unsafe.Pointer(title)), 0x40)
		return
	}
	configPath := flag.String("config", "", "absolute path to restricted agent JSON config")
	operation := flag.String("operation", "backup", "backup, check, snapshots, validate, preflight or managed")
	logPath := flag.String("log", "", "absolute path to protected diagnostic log (replaced each run)")
	flag.Parse()
	if *logPath != "" {
		if !filepath.IsAbs(*logPath) {
			fmt.Fprintln(os.Stderr, "log path must be absolute")
			os.Exit(2)
		}
		log, err := os.OpenFile(*logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
		if err != nil {
			fmt.Fprintln(os.Stderr, "log:", err)
			os.Exit(2)
		}
		defer log.Close()
		os.Stdout = log
		os.Stderr = log
		fmt.Fprintln(os.Stdout, time.Now().Format(time.RFC3339), "operation:", *operation)
	}
	if *configPath == "" {
		fmt.Fprintln(os.Stderr, "--config required")
		os.Exit(2)
	}
	c, err := loadConfig(*configPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(2)
	}
	if *operation == "validate" {
		if _, _, err = agentCredentials(c); err != nil {
			fmt.Fprintln(os.Stderr, "config:", err)
			os.Exit(2)
		}
		fmt.Fprintln(os.Stdout, "Configuration valid; no backup or controller request performed.")
		return
	}
	unlock, err := lockOperations(c)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer unlock()
	deadline := c.TimeoutMinutes
	if *operation == "managed" {
		deadline += 30
	} // Report acknowledgement grace after backup timeout.
	if *operation == "preflight" {
		deadline = 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(deadline)*time.Minute)
	defer cancel()
	if *operation == "managed" || *operation == "preflight" {
		err = managedOnce(ctx, c, *operation == "preflight")
	} else {
		err = execute(ctx, c, *operation)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "operation failed:", err)
		os.Exit(1)
	}
	if *operation == "managed" || *operation == "preflight" {
		fmt.Fprintln(os.Stdout, "Operation completed successfully.")
	}
}
