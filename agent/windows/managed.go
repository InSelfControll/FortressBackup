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
 "strings"
 "time"
)

type lease struct {ID string `json:"id"`; Operation string `json:"operation"`}
type pollResponse struct {Job *lease `json:"job"`}
func managedOnce(ctx context.Context,c Config) error {
 u,err:=url.Parse(c.ControllerURL);if err!=nil||u.Scheme!="https"||u.Host==""||u.User!=nil||u.RawQuery!=""{return errors.New("controllerURL must be a plain HTTPS origin")}
 if c.AgentID==""||c.AgentTokenFile==""{return errors.New("agentId and agentTokenFile required")}
 b,err:=os.ReadFile(c.AgentTokenFile);if err!=nil{return err}
 token:=strings.TrimSpace(string(b))
 if len(token)<32||len(token)>256{return errors.New("invalid enrollment token")}
 client:=&http.Client{Timeout:30*time.Second}
 endpoint:=strings.TrimRight(c.ControllerURL,"/")+"/api/managed-agents"
 request:=func(method,path string,payload any)([]byte,error){
  var body io.Reader
  if payload!=nil {raw,err:=json.Marshal(payload);if err!=nil{return nil,err};body=bytes.NewReader(raw)}
  req,err:=http.NewRequestWithContext(ctx,method,endpoint+path,body);if err!=nil{return nil,err}
  req.Header.Set("Authorization","Bearer "+token)
  req.Header.Set("X-Fortress-Agent-Id",c.AgentID)
  if payload!=nil {req.Header.Set("Content-Type","application/json")}
  res,err:=client.Do(req);if err!=nil{return nil,err};defer res.Body.Close()
  out,err:=io.ReadAll(io.LimitReader(res.Body,1<<20));if err!=nil{return nil,err}
  if res.StatusCode!=200{return nil,fmt.Errorf("controller returned HTTP %d",res.StatusCode)}
  return out,nil
 }
 raw,err:=request("POST","/poll",map[string]string{});if err!=nil{return err}
 var p pollResponse
 if err=json.Unmarshal(raw,&p);err!=nil{return err}
 if p.Job==nil{return nil}
 if p.Job.Operation!="backup"&&p.Job.Operation!="check"&&p.Job.Operation!="snapshots" {return errors.New("controller requested unsupported operation")}
 // Local config controls all source paths, credentials, binaries and destinations.
 jobctx,cancel:=context.WithTimeout(ctx,time.Duration(c.TimeoutMinutes)*time.Minute);defer cancel()
 result:=execute(jobctx,c,p.Job.Operation)
 message:="completed";if result!=nil{message="backup operation failed"}
 _,reportErr:=request("POST","/report",map[string]any{"id":p.Job.ID,"success":result==nil,"message":message})
 if reportErr!=nil{return fmt.Errorf("job executed but report failed: %w",reportErr)}
 return result
}
