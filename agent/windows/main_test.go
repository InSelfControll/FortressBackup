//go:build windows

package main

import (
 "os"
 "path/filepath"
 "testing"
)

func TestLoadConfigRejectsMissingSources(t *testing.T) {
 d:=t.TempDir()
 pass:=filepath.Join(d,"secret")
 if err:=os.WriteFile(pass,[]byte("example"),0600);err!=nil{t.Fatal(err)}
 cfg:=filepath.Join(d,"config.json")
 b:=[]byte(`{"repository":"sftp:backup:repo","passwordFile":"`+pass+`","sources":[]}`)
 if err:=os.WriteFile(cfg,b,0600);err!=nil{t.Fatal(err)}
 if _,err:=loadConfig(cfg);err==nil {t.Fatal("expected empty source error")}
}

func TestLoadConfigRejectsRelativeSource(t *testing.T) {
 d:=t.TempDir()
 pass:=filepath.Join(d,"secret")
 _=os.WriteFile(pass,[]byte("example"),0600)
 cfg:=filepath.Join(d,"config.json")
 b:=[]byte(`{"repository":"sftp:backup:repo","passwordFile":"`+pass+`","sources":["relative"]}`)
 _=os.WriteFile(cfg,b,0600)
 if _,err:=loadConfig(cfg);err==nil {t.Fatal("expected relative source rejection")}
}
