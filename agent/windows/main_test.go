//go:build windows

package main

import (
 "encoding/json"
 "os"
 "path/filepath"
 "testing"
)

func writeConfig(t *testing.T, sources []string) string {
 t.Helper()
 d:=t.TempDir()
 pass:=filepath.Join(d,"secret")
 if err:=os.WriteFile(pass,[]byte("example"),0600);err!=nil{t.Fatal(err)}
 cfg:=filepath.Join(d,"config.json")
 b,err:=json.Marshal(Config{Repository:"sftp:backup:repo",PasswordFile:pass,Sources:sources})
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
