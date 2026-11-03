//go:build windows

package main

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Credentials stay in ACL-protected files and child environment, never argv.
func cloudOptions(c Config) ([]string, []string, error) {
	args := []string{}
	env := []string{}
	regular := func(path string) bool {
		info, err := os.Lstat(path)
		return filepath.IsAbs(path) && err == nil && info.Mode().IsRegular() && !strings.ContainsAny(path, "\r\n\"")
	}
	if strings.HasPrefix(c.Repository, "azure:") {
		if !regexp.MustCompile(`^[a-z0-9]{3,24}$`).MatchString(c.AzureAccountName) || !regular(c.AzureKeyFile) {
			return nil, nil, errors.New("Azure requires its saved account name and protected account key file")
		}
		key, err := os.ReadFile(c.AzureKeyFile)
		if err != nil || len(key) > 512 || !regexp.MustCompile(`^[A-Za-z0-9+/]{40,}={0,2}$`).MatchString(strings.TrimSpace(string(key))) {
			return nil, nil, errors.New("invalid Azure account key file")
		}
		env = append(env, "AZURE_ACCOUNT_NAME="+c.AzureAccountName, "AZURE_ACCOUNT_KEY="+strings.TrimSpace(string(key)))
	}
	if strings.HasPrefix(c.Repository, "gs:") {
		if !regular(c.GCSCredentialsFile) {
			return nil, nil, errors.New("Google Cloud Storage requires a protected Google credential file")
		}
		data, err := os.ReadFile(c.GCSCredentialsFile)
		var credentials struct {
			Type     string `json:"type"`
			TokenURI string `json:"token_uri"`
		}
		if err != nil || len(data) > 16384 || json.Unmarshal(data, &credentials) != nil || (credentials.Type != "service_account" && credentials.Type != "authorized_user") || credentials.TokenURI != "https://oauth2.googleapis.com/token" {
			return nil, nil, errors.New("invalid Google Cloud credential file")
		}
		env = append(env, "GOOGLE_APPLICATION_CREDENTIALS="+c.GCSCredentialsFile)
	}
	if strings.HasPrefix(c.Repository, "rclone:") {
		if !regular(c.RclonePath) || !strings.EqualFold(filepath.Ext(c.RclonePath), ".exe") || !regular(c.RcloneConfigFile) {
			return nil, nil, errors.New("Cloud drives require the bundled Rclone executable and protected config file")
		}
		// Restic's option parser consumes CSV; preserve paths containing spaces/commas.
		var option strings.Builder
		writer := csv.NewWriter(&option)
		if err := writer.Write([]string{"rclone.program=" + c.RclonePath}); err != nil {
			return nil, nil, err
		}
		writer.Flush()
		args = append(args, "-o", strings.TrimSuffix(option.String(), "\n"))
		env = append(env, "RCLONE_CONFIG="+c.RcloneConfigFile)
	}
	return args, env, nil
}
