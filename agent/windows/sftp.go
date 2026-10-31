//go:build windows

package main

import (
 "errors"
 "net/url"
 "os"
 "path/filepath"
 "regexp"
 "strconv"
 "strings"
)

// Restic splits its command option into argv; it does not execute a shell.
func quoteSFTPArgument(value string) string {
 return "'"+strings.ReplaceAll(value,"'","'\"'\"'")+"'"
}

func sftpCommand(c Config) (string,error) {
 if c.SFTPKeyFile==""&&c.SFTPKnownHostsFile=="" {return "",nil}
 if c.SSHCommand!="" {return "",errors.New("cannot combine a custom SSH command with managed storage credentials")}
 for _,path:=range []string{c.SFTPKeyFile,c.SFTPKnownHostsFile} {
  info,err:=os.Lstat(path)
  if !filepath.IsAbs(path)||err!=nil||!info.Mode().IsRegular() {return "",errors.New("managed SSH key and known_hosts must be absolute regular files")}
 }
 peer,err:=url.Parse(c.Repository)
 if err!=nil||peer.Scheme!="sftp"||peer.User==nil||peer.RawQuery!=""||peer.Fragment!="" {return "",errors.New("managed SSH credentials require an SFTP repository URL")}
 _,hasPassword:=peer.User.Password()
 if hasPassword||!regexp.MustCompile(`^[A-Za-z0-9._-]{1,120}$`).MatchString(peer.User.Username())||
  !regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$`).MatchString(peer.Hostname()) {return "",errors.New("invalid managed SFTP destination")}
 port:=peer.Port();if port=="" {port="22"}
 number,err:=strconv.Atoi(port);if err!=nil||number<1||number>65535{return "",errors.New("invalid managed SFTP port")}
 systemRoot:=os.Getenv("SystemRoot")
 if !filepath.IsAbs(systemRoot){return "",errors.New("Windows SystemRoot must be absolute")}
 args:=[]string{filepath.Join(systemRoot,"System32","OpenSSH","ssh.exe"),"-F","NUL","-i",c.SFTPKeyFile,
  "-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","StrictHostKeyChecking=yes",
  "-o","GlobalKnownHostsFile=NUL","-o",`UserKnownHostsFile="`+filepath.ToSlash(c.SFTPKnownHostsFile)+`"`,
  "-o","ConnectTimeout=15","-p",port,"-l",peer.User.Username(),"-s","--",peer.Hostname(),"sftp"}
 for i,arg:=range args {args[i]=quoteSFTPArgument(arg)}
 return strings.Join(args," "),nil
}
