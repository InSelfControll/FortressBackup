//go:build windows

// Fortress Windows Agent: local, least-privilege Restic runner.
// It never opens a listening port and never executes remote shell commands.
package main

import (
 "context"
 "encoding/json"
 "errors"
 "flag"
 "fmt"
 "io"
 "os"
 "os/exec"
 "path/filepath"
 "strings"
 "time"
)

type Config struct {
 ResticPath string `json:"resticPath"`
 Repository string `json:"repository"`
 PasswordFile string `json:"passwordFile"`
 Sources []string `json:"sources"`
 Excludes []string `json:"excludes"`
 Host string `json:"host"`
 TimeoutMinutes int `json:"timeoutMinutes"`
 UseVSS bool `json:"useVSS"`
 // Optional path to SSH configuration with pinned known_hosts and an SSH key.
 SSHCommand string `json:"sshCommand"`
}

func loadConfig(path string) (Config,error) {
 var c Config
 file,err:=os.Open(path); if err!=nil{return c,err}; defer file.Close()
 decoder:=json.NewDecoder(io.LimitReader(file,1<<20)); decoder.DisallowUnknownFields()
 if err=decoder.Decode(&c);err!=nil{return c,err}
 if c.ResticPath=="" {c.ResticPath="restic.exe"}
 if c.Repository=="" || c.PasswordFile=="" || len(c.Sources)==0 {return c,errors.New("repository, passwordFile and sources required")}
 if !strings.HasPrefix(c.Repository,"sftp:") && !strings.HasPrefix(c.Repository,"rest:") && !strings.HasPrefix(c.Repository,"s3:") && !strings.HasPrefix(c.Repository,"b2:") {return c,errors.New("repository must use an explicit remote backend")}
 if c.TimeoutMinutes==0 {c.TimeoutMinutes=240}
 if c.TimeoutMinutes<1 || c.TimeoutMinutes>1440{return c,errors.New("timeoutMinutes must be 1..1440")}
 if _,err=os.Stat(c.PasswordFile);err!=nil{return c,fmt.Errorf("password file: %w",err)}
 for _,source:=range c.Sources {if !filepath.IsAbs(source) {return c,fmt.Errorf("source must be absolute: %q",source)}; if _,err=os.Stat(source);err!=nil{return c,fmt.Errorf("source %q: %w",source,err)}}
 for _,exclude:=range c.Excludes {if strings.TrimSpace(exclude)=="" {return c,errors.New("empty exclude")}}
 return c,nil
}

func execute(ctx context.Context,c Config,operation string) error {
 args:=[]string{"--repo",c.Repository,"--password-file",c.PasswordFile}
 switch operation {
 case "backup":
  args=append(args,"backup","--json","--exclude-caches")
  if c.UseVSS {args=append(args,"--use-fs-snapshot")}
  if c.Host!="" {args=append(args,"--host",c.Host)}
  for _,v:=range c.Excludes {args=append(args,"--exclude",v)}
  args=append(args,"--")
  args=append(args,c.Sources...)
 case "check":
  args=append(args,"check")
 case "snapshots":
  args=append(args,"snapshots","--json")
 default: return errors.New("unsupported operation")
 }
 cmd:=exec.CommandContext(ctx,c.ResticPath,args...)
 cmd.Stdin=nil
 cmd.Stdout=os.Stdout
 cmd.Stderr=os.Stderr
 // The SSH command must be locally configured, not supplied by a remote request.
 if c.SSHCommand!="" {cmd.Env=append(os.Environ(),"RESTIC_SFTP_COMMAND="+c.SSHCommand)}
 err:=cmd.Run()
 if ctx.Err()!=nil{return ctx.Err()}
 return err
}

func main(){
 configPath:=flag.String("config", "", "absolute path to restricted agent JSON config")
 operation:=flag.String("operation","backup","backup, check or snapshots")
 flag.Parse()
 if *configPath=="" {fmt.Fprintln(os.Stderr,"--config required");os.Exit(2)}
 c,err:=loadConfig(*configPath)
 if err!=nil {fmt.Fprintln(os.Stderr,"config:",err);os.Exit(2)}
 ctx,cancel:=context.WithTimeout(context.Background(),time.Duration(c.TimeoutMinutes)*time.Minute)
 defer cancel()
 if err=execute(ctx,c,*operation);err!=nil{fmt.Fprintln(os.Stderr,"backup failed:",err);os.Exit(1)}
}
