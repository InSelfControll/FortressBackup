//go:build windows

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"syscall"
)

type operationRequest struct {
	AllDevices bool     `json:"allDevices,omitempty"`
	SnapshotID string   `json:"snapshotId,omitempty"`
	Directory  string   `json:"directory,omitempty"`
	Offset     int      `json:"offset,omitempty"`
	Paths      []string `json:"paths,omitempty"`
}
type savedSnapshot struct {
	ID       string   `json:"id"`
	Time     string   `json:"time"`
	Hostname string   `json:"hostname"`
	Paths    []string `json:"paths"`
	Tags     []string `json:"tags,omitempty"`
}
type savedFile struct {
	Path string  `json:"path"`
	Name string  `json:"name"`
	Type string  `json:"type"`
	Size *uint64 `json:"size,omitempty"`
}

var snapshotPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
var jobPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func validSnapshotPath(value string) bool {
	if !strings.HasPrefix(value, "/") || len(value) > 4096 || strings.ContainsAny(value, "\\\x00\r\n\t") {
		return false
	}
	for _, part := range strings.Split(value, "/") {
		if part == ".." || part == "." {
			return false
		}
	}
	for _, char := range value {
		if char < 32 || char == 127 {
			return false
		}
	}
	return true
}
func validateOperation(job lease) error {
	if job.Request.AllDevices && job.Operation != "snapshots" && job.Operation != "files" && job.Operation != "restore" {
		return errors.New("invalid backup scope")
	}
	if job.Operation != "backup" && job.Operation != "check" && job.Operation != "snapshots" && job.Operation != "files" && job.Operation != "restore" {
		return errors.New("unsupported operation")
	}
	if job.Request.Offset < 0 || job.Request.Offset > 1000000 {
		return errors.New("invalid page offset")
	}
	if job.Operation == "files" || job.Operation == "restore" {
		if !snapshotPattern.MatchString(job.Request.SnapshotID) {
			return errors.New("invalid snapshot ID")
		}
	}
	if job.Operation == "files" && !validSnapshotPath(job.Request.Directory) {
		return errors.New("invalid snapshot directory")
	}
	if job.Operation == "restore" {
		if !jobPattern.MatchString(job.ID) {
			return errors.New("invalid restore job identity")
		}
		if job.Request.Paths != nil && len(job.Request.Paths) == 0 || len(job.Request.Paths) > 100 {
			return errors.New("empty or excessive restore selection")
		}
		for _, item := range job.Request.Paths {
			if !validSnapshotPath(item) {
				return errors.New("invalid restore selection")
			}
		}
	}
	data, _ := json.Marshal(job.Request)
	if len(data) > 24576 {
		return errors.New("operation request too large")
	}
	return nil
}

type limitedOutput struct{ bytes.Buffer }

func (writer *limitedOutput) Write(data []byte) (int, error) {
	if writer.Len()+len(data) > 8<<20 {
		return 0, errors.New("repository listing exceeds the local size limit")
	}
	return writer.Buffer.Write(data)
}
func resticOutput(ctx context.Context, c Config, args ...string) ([]byte, error) {
	var output limitedOutput
	if err := runRestic(ctx, c, args, &output); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
func ownSnapshot(c Config, snapshot savedSnapshot) bool {
	if snapshot.Hostname != c.Host {
		return false
	}
	for _, tag := range snapshot.Tags {
		if strings.HasPrefix(tag, "fortress-agent:") && tag != "fortress-agent:"+c.AgentID {
			return false
		}
	}
	return true
}
func savedSnapshots(ctx context.Context, c Config, scope ...bool) ([]savedSnapshot, error) {
	allDevices := len(scope) > 0 && scope[0]
	args := []string{"snapshots", "--json"}
	if !allDevices {
		args = append(args, "--host", c.Host)
	}
	data, err := resticOutput(ctx, c, args...)
	if err != nil {
		return nil, err
	}
	var all []savedSnapshot
	if err := json.Unmarshal(data, &all); err != nil {
		return nil, errors.New("invalid repository snapshot response")
	}
	result := make([]savedSnapshot, 0)
	for _, snapshot := range all {
		if (allDevices || ownSnapshot(c, snapshot)) && snapshotPattern.MatchString(snapshot.ID) {
			result = append(result, snapshot)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Time > result[j].Time })
	return result, nil
}
func snapshotFor(ctx context.Context, c Config, id string, allDevices bool) error {
	all, err := savedSnapshots(ctx, c, allDevices)
	if err != nil {
		return err
	}
	for _, snapshot := range all {
		if snapshot.ID == id {
			return nil
		}
	}
	return errors.New("snapshot does not belong to this laptop")
}
func literalInclude(value string) string {
	// Restic uses Windows filepath matching: backslashes are separators, not
	// escapes. Character classes preserve literal bracket/wildcard characters.
	return strings.NewReplacer(`*`, `[*]`, `?`, `[?]`, `[`, `[[]`).Replace(value)
}
func noReparseDirectories(directory string) error {
	for current := filepath.Clean(directory); ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil && !os.IsNotExist(err) {
			return err
		}
		if err == nil {
			if info.Mode()&os.ModeSymlink != 0 {
				return errors.New("restore directory contains a link")
			}
			if attrs, ok := info.Sys().(*syscall.Win32FileAttributeData); ok && attrs.FileAttributes&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
				return errors.New("restore directory contains a reparse point")
			}
		}
		if filepath.Dir(current) == current {
			return nil
		}
	}
}
func lockOperations(c Config) (func(), error) {
	directory := filepath.Dir(c.AgentTokenFile)
	if !filepath.IsAbs(c.AgentTokenFile) {
		return nil, errors.New("protected agent token path required")
	}
	if err := noReparseDirectories(directory); err != nil {
		return nil, err
	}
	name, err := syscall.UTF16PtrFromString(filepath.Join(directory, "fortress-operation.lock"))
	if err != nil {
		return nil, err
	}
	handle, err := syscall.CreateFile(name, syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_ALWAYS, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return nil, errors.New("another local operation is running; wait for it to finish")
	}
	return func() { syscall.CloseHandle(handle) }, nil
}
func executeManaged(ctx context.Context, c Config, job lease) (any, error) {
	if err := validateOperation(job); err != nil {
		return nil, err
	}
	if job.Operation == "backup" || job.Operation == "check" {
		return nil, execute(ctx, c, job.Operation)
	}
	if job.Operation == "snapshots" {
		all, err := savedSnapshots(ctx, c, job.Request.AllDevices)
		if err != nil {
			return nil, err
		}
		page := make([]savedSnapshot, 0)
		for index := job.Request.Offset; index < len(all) && len(page) < 200; index++ {
			candidate := append(page, all[index])
			data, _ := json.Marshal(candidate)
			if len(data) > 48000 {
				if len(page) == 0 {
					return nil, errors.New("snapshot metadata exceeds page limit")
				}
				break
			}
			page = candidate
		}
		return map[string]any{"snapshots": page, "offset": job.Request.Offset, "hasMore": job.Request.Offset+len(page) < len(all)}, nil
	}
	if err := snapshotFor(ctx, c, job.Request.SnapshotID, job.Request.AllDevices); err != nil {
		return nil, err
	}
	if job.Operation == "files" {
		data, err := resticOutput(ctx, c, "ls", "--json", job.Request.SnapshotID, job.Request.Directory)
		if err != nil {
			return nil, err
		}
		decoder := json.NewDecoder(bytes.NewReader(data))
		entries := make([]savedFile, 0)
		for {
			var item savedFile
			if err := decoder.Decode(&item); err != nil {
				if err == io.EOF {
					break
				}
				return nil, errors.New("invalid repository file response")
			}
			if (item.Type == "file" || item.Type == "dir" || item.Type == "symlink") && validSnapshotPath(item.Path) && item.Path != path.Clean(job.Request.Directory) && path.Dir(item.Path) == path.Clean(job.Request.Directory) {
				entries = append(entries, item)
			}
		}
		sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
		page := make([]savedFile, 0)
		for index := job.Request.Offset; index < len(entries) && len(page) < 200; index++ {
			candidate := append(page, entries[index])
			encoded, _ := json.Marshal(candidate)
			if len(encoded) > 48000 {
				break
			}
			page = candidate
		}
		return map[string]any{"entries": page, "directory": job.Request.Directory, "snapshotId": job.Request.SnapshotID, "offset": job.Request.Offset, "hasMore": job.Request.Offset+len(page) < len(entries)}, nil
	}
	// Restore only into a new per-job directory under the protected local agent
	// directory. The controller cannot choose a target or overwrite live files.
	root := filepath.Join(filepath.Dir(c.AgentTokenFile), "restores")
	if err := noReparseDirectories(root); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	target := filepath.Join(root, job.ID)
	if err := os.Mkdir(target, 0700); err != nil {
		return nil, errors.New("restore directory already exists or cannot be created")
	}
	args := []string{"restore", job.Request.SnapshotID, "--json", "--verify", "--overwrite", "never", "--target", target}
	for _, item := range job.Request.Paths {
		args = append(args, "--include", literalInclude(item))
	}
	if err := runRestic(ctx, c, args, os.Stdout); err != nil {
		return nil, fmt.Errorf("restore failed; partial files remain in %s: %w", target, err)
	}
	return map[string]any{"snapshotId": job.Request.SnapshotID, "restorePath": target}, nil
}
