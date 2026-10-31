//go:build windows

package main

import (
 "context"
 "encoding/json"
 "os"
 "os/exec"
 "path/filepath"
 "strings"
 "testing"
 "time"
 "reflect"
)

// The copied test binary records exactly what Restic passes to its SSH child.
func TestMain(m *testing.M) {
 if capture:=os.Getenv("FORTRESS_TEST_SSH_CAPTURE");capture!="" {
  data,err:=json.Marshal(os.Args[1:]);if err!=nil{os.Exit(2)}
  if os.WriteFile(capture,data,0600)!=nil{os.Exit(2)}
  os.Exit(0)
 }
 os.Exit(m.Run())
}

func TestManagedSFTPUsesOnlyProtectedIdentityAndPinnedHosts(t *testing.T) {
 directory:=filepath.Join(t.TempDir(),"user's files")
 if err:=os.Mkdir(directory,0700);err!=nil{t.Fatal(err)}
 key:=filepath.Join(directory,"identity");hosts:=filepath.Join(directory,"known_hosts")
 for _,file:=range []string{key,hosts}{if err:=os.WriteFile(file,[]byte("fixture"),0600);err!=nil{t.Fatal(err)}}
 c:=Config{Repository:"sftp://backup@storage.example.invalid:23/repo",SFTPKeyFile:key,SFTPKnownHostsFile:hosts}
 command,err:=sftpCommand(c);if err!=nil{t.Fatal(err)}
 for _,required:=range []string{quoteSFTPArgument(key),quoteSFTPArgument(`UserKnownHostsFile="`+filepath.ToSlash(hosts)+`"`),"'StrictHostKeyChecking=yes'","'IdentitiesOnly=yes'","'BatchMode=yes'","'GlobalKnownHostsFile=NUL'","'23'","'storage.example.invalid'"} {
  if !strings.Contains(command,required){t.Fatalf("managed transport lost an identity/trust argument: %s",required)}
 }
 if !strings.HasPrefix(command,quoteSFTPArgument(filepath.Join(os.Getenv("SystemRoot"),"System32","OpenSSH","ssh.exe"))){t.Fatal("transport must use the native absolute SSH executable")}
 c.SSHCommand="custom executable"
 if _,err=sftpCommand(c);err==nil{t.Fatal("arbitrary command mixed with managed identity")}
 c.SSHCommand="";c.Repository="sftp://-bad@-option:23/repo"
 if _,err=sftpCommand(c);err==nil{t.Fatal("option-like host accepted")}
 c.Repository="sftp://backup@storage.example.invalid:23/repo";c.SFTPKnownHostsFile=""
 if _,err=sftpCommand(c);err==nil{t.Fatal("unpinned managed transport accepted")}
}

func TestResticManagedSFTPArgv(t *testing.T) {
 restic:=os.Getenv("FORTRESS_TEST_RESTIC")
 if restic==""{t.Skip("actual Restic interoperability runs in the Windows verification job")}
 nativeRoot:=os.Getenv("SystemRoot")
 directory:=filepath.Join(t.TempDir(),"user's files")
 sshFolder:=filepath.Join(directory,"System32","OpenSSH")
 if err:=os.MkdirAll(sshFolder,0700);err!=nil{t.Fatal(err)}
 own,err:=os.Executable();if err!=nil{t.Fatal(err)}
 binary,err:=os.ReadFile(own);if err!=nil{t.Fatal(err)}
 if err:=os.WriteFile(filepath.Join(sshFolder,"ssh.exe"),binary,0700);err!=nil{t.Fatal(err)}
 c:=Config{ResticPath:restic,Repository:"sftp://backup@storage.example.invalid:23/repo",PasswordFile:filepath.Join(directory,"password"),SFTPKeyFile:filepath.Join(directory,"identity"),SFTPKnownHostsFile:filepath.Join(directory,"known_hosts")}
 for _,file:=range []string{c.PasswordFile,c.SFTPKeyFile,c.SFTPKnownHostsFile}{if err:=os.WriteFile(file,[]byte(filepath.Base(directory)),0600);err!=nil{t.Fatal(err)}}
 capture:=filepath.Join(directory,"argv.json")
 t.Setenv("SystemRoot",directory);t.Setenv("FORTRESS_TEST_SSH_CAPTURE",capture)
 ctx,cancel:=context.WithTimeout(context.Background(),20*time.Second);defer cancel()
 if execute(ctx,c,"snapshots")==nil{t.Fatal("an SSH recorder is not an SFTP server")}
 data,err:=os.ReadFile(capture);if err!=nil{t.Fatalf("Restic never invoked the configured SSH identity: %v",err)}
 var args []string;if err:=json.Unmarshal(data,&args);err!=nil{t.Fatal(err)}
 expected:=[]string{"-F","NUL","-i",c.SFTPKeyFile,"-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes","-o","GlobalKnownHostsFile=NUL","-o",`UserKnownHostsFile="`+filepath.ToSlash(c.SFTPKnownHostsFile)+`"`,"-o","ConnectTimeout=15","-p","23","-l","backup","-s","--","storage.example.invalid","sftp"}
 if !reflect.DeepEqual(args,expected){t.Fatalf("Restic changed protected path or trust arguments:\ngot %q\nwant %q",args,expected)}
 nativeSSH:=filepath.Join(nativeRoot,"System32","OpenSSH","ssh.exe")
 if _,err:=os.Stat(nativeSSH);err==nil {
  t.Setenv("SystemRoot",nativeRoot)
  check:=exec.CommandContext(ctx,nativeSSH,append([]string{"-G"},args...)...)
  if output,err:=check.CombinedOutput();err!=nil{t.Fatalf("native OpenSSH rejected managed trust settings: %v\n%s",err,output)}
 }
}
