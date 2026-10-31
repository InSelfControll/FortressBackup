//go:build windows

package main

import (
 "encoding/json"
 "os"
 "path/filepath"
 "strings"
 "testing"
)

func writeConfig(t *testing.T, sources []string) string {
 t.Helper()
 d:=t.TempDir()
 pass:=filepath.Join(d,"secret")
 restic:=filepath.Join(d,"restic.exe")
 if err:=os.WriteFile(restic,[]byte("test executable placeholder"),0600);err!=nil{t.Fatal(err)}
 if err:=os.WriteFile(pass,[]byte(filepath.Base(d)),0600);err!=nil{t.Fatal(err)}
 cfg:=filepath.Join(d,"config.json")
 b,err:=json.Marshal(Config{ResticPath:restic,Repository:"sftp:backup:repo",PasswordFile:pass,Sources:sources})
 if err!=nil{t.Fatal(err)}
 if err:=os.WriteFile(cfg,b,0600);err!=nil{t.Fatal(err)}
 return cfg
}

func TestLoadConfigRejectsMissingSources(t *testing.T) {
 if _,err:=loadConfig(writeConfig(t,nil));err==nil {t.Fatal("expected empty source error")}
}
func TestLoadConfigRejectsRelativeSource(t *testing.T) {
 if _,err:=loadConfig(writeConfig(t,[]string{"relative"}));err==nil {t.Fatal("expected relative source rejection")}
}
func TestLoadConfigRejectsUnknownProperties(t *testing.T) {
 p:=writeConfig(t,nil)
 if err:=os.WriteFile(p,[]byte(`{"unknown":true}`),0600);err!=nil {t.Fatal(err)}
 if _,err:=loadConfig(p);err==nil {t.Fatal("unknown fields must be rejected")}
}

func TestPendingReportRoundTrip(t *testing.T) {
 dir:=t.TempDir()
 file:=filepath.Join(dir,"pending.json")
 if r,err:=readPending(file);err!=nil||r!=nil{t.Fatalf("missing report: %v %v",r,err)}
 input:=pendingReport{ID:"test-id",Success:true,Message:"completed"}
 if err:=writePending(file,input);err!=nil{t.Fatal(err)}
 got,err:=readPending(file);if err!=nil{t.Fatal(err)}
 if got==nil||got.ID!=input.ID||!got.Success||got.Message!=input.Message{t.Fatalf("bad report: %+v",got)}
}

func TestLoadConfigAcceptsWindowsPowerShellUTF8(t *testing.T) {
 source:=t.TempDir()
 p:=writeConfig(t,[]string{source})
 data,err:=os.ReadFile(p);if err!=nil{t.Fatal(err)}
 for _,prefix:=range []string{"","\xef\xbb\xbf"} {
  if err:=os.WriteFile(p,append([]byte(prefix),data...),0600);err!=nil{t.Fatal(err)}
  c,err:=loadConfig(p);if err!=nil{t.Fatal(err)}
  if len(c.Sources)!=1 || c.Sources[0]!=source {t.Fatal("source selection lost")}
 }
}

func TestAgentCredentialsRequireSecureOriginAndToken(t *testing.T) {
 token:=filepath.Join(t.TempDir(),"token")
 if err:=os.WriteFile(token,[]byte(strings.Repeat("a",43)+"\r\n"),0600);err!=nil{t.Fatal(err)}
 c:=Config{ControllerURL:"https://controller.example.invalid/",AgentID:"enrollment-id",AgentTokenFile:token}
 endpoint,_,err:=agentCredentials(c)
 if err!=nil || endpoint!="https://controller.example.invalid/api/managed-agents" {t.Fatalf("valid config rejected: %v",err)}
 for _,origin:=range []string{"http://10.0.11.14:19001","https://user:pass@example.invalid","https://example.invalid/path","https://example.invalid?token=secret"} {
  c.ControllerURL=origin
  if _,_,err:=agentCredentials(c);err==nil {t.Fatalf("unsafe origin accepted: %s",origin)}
 }
 c.ControllerURL="https://controller.example.invalid"
 if err:=os.WriteFile(token,[]byte(strings.Repeat("a",32)+"\nsecret"),0600);err!=nil{t.Fatal(err)}
 if _,_,err:=agentCredentials(c);err==nil{t.Fatal("multiline token accepted")}
}
