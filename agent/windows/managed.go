//go:build windows

package main

import (
    "bytes"
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
    "net/url"
    "os"
    "path/filepath"
    "strings"
    "time"
)

type lease struct {
    ID string `json:"id"`
    Operation string `json:"operation"`
}
type pollResponse struct {
    Job *lease `json:"job"`
}
type pendingReport struct {
    ID string `json:"id"`
    Success bool `json:"success"`
    Message string `json:"message"`
}

func writePending(path string, report pendingReport) error {
    data, err := json.Marshal(report)
    if err != nil { return err }
    temp, err := os.CreateTemp(filepath.Dir(path), ".fortress-report-*")
    if err != nil { return err }
    defer os.Remove(temp.Name())
    if err := temp.Chmod(0600); err != nil { temp.Close(); return err }
    if _, err := temp.Write(data); err != nil { temp.Close(); return err }
    if err := temp.Sync(); err != nil { temp.Close(); return err }
    if err := temp.Close(); err != nil { return err }
    return os.Rename(temp.Name(), path)
}

func readPending(path string) (*pendingReport, error) {
    data, err := os.ReadFile(path)
    if os.IsNotExist(err) { return nil, nil }
    if err != nil { return nil, err }
    if len(data) > 4096 { return nil, errors.New("pending report too large") }
    var report pendingReport
    if err := json.Unmarshal(data, &report); err != nil { return nil, err }
    if report.ID=="" { return nil, errors.New("invalid pending report") }
    return &report, nil
}

func agentCredentials(c Config) (string,string,error) {
    u, err := url.Parse(c.ControllerURL)
    if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil ||
        u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
        return "","",errors.New("controllerURL must be a plain HTTPS origin")
    }
    if c.AgentID == "" || c.AgentTokenFile == "" { return "","",errors.New("agentId and agentTokenFile required") }
    tokenBytes, err := os.ReadFile(c.AgentTokenFile)
    if err != nil { return "","",err }
    token := strings.TrimSpace(string(tokenBytes))
    if len(token) < 32 || len(token) > 256 || strings.ContainsAny(token,"\r\n\t ") { return "","",errors.New("invalid enrollment token") }
    return strings.TrimRight(c.ControllerURL,"/")+"/api/managed-agents",token,nil
}

func managedOnce(ctx context.Context, c Config, preflight bool) error {
    endpoint,token,err:=agentCredentials(c)
    if err!=nil{return err}
    client := &http.Client{
        Timeout: 30*time.Second,
        CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
    }
    var poll pollResponse
    request := func(route string, payload any) error {
        data, err := json.Marshal(payload)
        if err != nil { return err }
        req, err := http.NewRequestWithContext(ctx, "POST", endpoint+route, bytes.NewReader(data))
        if err != nil { return err }
        req.Header.Set("Authorization", "Bearer "+token)
        req.Header.Set("X-Fortress-Agent-Id", c.AgentID)
        req.Header.Set("Content-Type", "application/json")
        res, err := client.Do(req)
        if err != nil { return err }
        defer res.Body.Close()
        response, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
        if err != nil { return err }
        if res.StatusCode != http.StatusOK { return fmt.Errorf("controller returned HTTP %d", res.StatusCode) }
        if route == "/poll" {
            return json.Unmarshal(response, &poll)
        }
        return nil
    }
    if preflight {
        // Verify storage as SYSTEM without claiming or executing a queued job.
        if err:=execute(ctx,c,"snapshots");err!=nil{return fmt.Errorf("repository access check failed: %w",err)}
        if err:=request("/heartbeat",map[string]string{});err!=nil{return fmt.Errorf("controller connection check failed: %w",err)}
        fmt.Fprintln(os.Stdout,"Repository accessible; enrollment authenticated. No queued job claimed.")
        return nil
    }
    // Report files contain no encryption keys or remote commands. Restrict the
    // directory ACL to the task identity and Administrators.
    pendingPath := filepath.Join(filepath.Dir(c.AgentTokenFile), "fortress-pending-report.json")
    activePath := filepath.Join(filepath.Dir(c.AgentTokenFile), "fortress-active-job.json")
    pending, err := readPending(pendingPath)
    if err != nil { return err }

    if pending != nil {
        if err := request("/report", pending); err != nil { return fmt.Errorf("previous job report pending: %w", err) }
        if err := os.Remove(pendingPath); err != nil { return err }
        // A completed job may have been interrupted between report persistence
        // and cleanup of the locally durable active-job marker.
        if err := os.Remove(activePath); err != nil && !os.IsNotExist(err) { return err }
    }
    if err := request("/poll", map[string]string{}); err != nil { return err }
    active,err:=readPending(activePath)
    if err!=nil{return err}
    if active!=nil {
        // Never repeat an interrupted Restic invocation without operator
        // reconciliation, even if the controller redelivered its lease.
        return fmt.Errorf("job %s was interrupted; verify its repository and clear the local active marker manually",active.ID)
    }
    if poll.Job == nil { fmt.Fprintln(os.Stdout,"Controller check-in complete; no queued operations.");return nil }
    if poll.Job.Operation!="backup" && poll.Job.Operation!="check" && poll.Job.Operation!="snapshots" {
        return errors.New("controller requested unsupported operation")
    }
    if err:=writePending(activePath,pendingReport{ID:poll.Job.ID,Message:"running"});err!=nil{
        return fmt.Errorf("cannot persist active-job marker: %w",err)
    }
    jobctx, cancel := context.WithTimeout(ctx, time.Duration(c.TimeoutMinutes)*time.Minute)
    defer cancel()
    result := execute(jobctx, c, poll.Job.Operation)
    message := "completed"
    if result != nil { message = "backup operation failed" }
    report := pendingReport{ID: poll.Job.ID, Success: result == nil, Message: message}
    if err := writePending(pendingPath, report); err != nil {
        return fmt.Errorf("could not persist completion report: %w", err)
    }
    if err:=os.Remove(activePath);err!=nil && !os.IsNotExist(err){return err}
    if err := request("/report", report); err != nil {
        return fmt.Errorf("job executed; report saved for retry: %w", err)
    }
    if err := os.Remove(pendingPath); err != nil { return err }
    return result
}
