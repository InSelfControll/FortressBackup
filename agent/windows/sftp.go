//go:build windows

package main

import (
 "errors"
 "fmt"
 "net/url"
 "os"
 "path/filepath"
 "regexp"
 "strconv"
 "strings"
)

func managedSFTPArgs(c Config) ([]string,error) {
 if c.SFTPKeyFile==""&&c.SFTPKnownHostsFile=="" {return nil,nil}
 if c.SSHCommand!="" {return nil,errors.New("cannot combine a custom SSH command with managed storage credentials")}
 for _,path:=range []string{c.SFTPKeyFile,c.SFTPKnownHostsFile} {
  info,err:=os.Lstat(path)
  if !filepath.IsAbs(path)||strings.ContainsAny(path,"\r\n\"")||err!=nil||!info.Mode().IsRegular() {return nil,errors.New("managed SSH key and known_hosts must be absolute regular files")}
 }
 peer,err:=url.Parse(c.Repository)
 if err!=nil||peer.Scheme!="sftp"||peer.User==nil||peer.RawQuery!=""||peer.Fragment!="" {return nil,errors.New("managed SSH credentials require an SFTP repository URL")}
 _,hasPassword:=peer.User.Password()
 if hasPassword||!regexp.MustCompile(`^[A-Za-z0-9._-]{1,120}$`).MatchString(peer.User.Username())||
  !regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$`).MatchString(peer.Hostname()) {return nil,errors.New("invalid managed SFTP destination")}
 port:=peer.Port();if port=="" {port="22"}
 number,err:=strconv.Atoi(port);if err!=nil||number<1||number>65535{return nil,errors.New("invalid managed SFTP port")}
 systemRoot:=os.Getenv("SystemRoot")
 if !filepath.IsAbs(systemRoot)||strings.ContainsAny(systemRoot,"\r\n\""){return nil,errors.New("Windows SystemRoot must be absolute")}
 return []string{filepath.Join(systemRoot,"System32","OpenSSH","ssh.exe"),"-p",port,"-l",peer.User.Username(),"-s","--",peer.Hostname(),"sftp"},nil
}

func sftpConfiguration(c Config) string {
 // Escape percent expansion in OpenSSH filenames; all paths are local inputs.
 key:=strings.ReplaceAll(filepath.ToSlash(c.SFTPKeyFile),"%","%%")
 hosts:=strings.ReplaceAll(filepath.ToSlash(c.SFTPKnownHostsFile),"%","%%")
 return fmt.Sprintf("Host *\n  BatchMode yes\n  IdentitiesOnly yes\n  StrictHostKeyChecking yes\n  GlobalKnownHostsFile NUL\n  ConnectTimeout 15\n  IdentityFile %q\n  UserKnownHostsFile %q\n",key,hosts)
}

func prepareSFTP(c Config) (string,func(),error) {
 noop:=func(){}
 args,err:=managedSFTPArgs(c)
 if err!=nil||len(args)==0{return "",noop,err}
 // This directory is protected for SYSTEM/Administrators by the installer.
 file,err:=os.CreateTemp(filepath.Dir(c.SFTPKeyFile),".ssh-config-*")
 if err!=nil{return "",noop,err}
 cleanup:=func(){os.Remove(file.Name())}
 if _,err:=file.WriteString(sftpConfiguration(c));err!=nil{file.Close();cleanup();return "",noop,err}
 if err:=file.Close();err!=nil{cleanup();return "",noop,err}
 args=append([]string{args[0],"-F",file.Name()},args[1:]...)
 // Restic's splitter recognizes a complete quoted field, not POSIX quote
 // concatenation. Windows filenames cannot contain double quote characters.
 for i,arg:=range args {args[i]="\""+arg+"\""}
 return strings.Join(args," "),cleanup,nil
}
