//go:build windows

// The installed app opens graphical configuration without a terminal window.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

func main() {
	executable, err := os.Executable()
	if err == nil {
		root := filepath.Dir(executable)
		for _, name := range []string{"setup.ps1", "setup-ui.ps1", "provision.ps1", "install-task.ps1", "fortress-agent.exe", "restic.exe", "SHA256SUMS"} {
			if info, statErr := os.Stat(filepath.Join(root, name)); statErr != nil || info.IsDir() {
				err = os.ErrNotExist
				break
			}
		}
		if err == nil {
			powershell := filepath.Join(os.Getenv("SystemRoot"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
			cmd := exec.Command(powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-WindowStyle", "Hidden", "-File", filepath.Join(root, "setup.ps1"))
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			err = cmd.Run()
		}
	}
	if err != nil {
		message, _ := syscall.UTF16PtrFromString("Fortress Backup could not open. Run the Fortress Backup installer again to repair the application. If the configuration window reported an error, follow its instructions.\n\nhttps://github.com/InSelfControll/FortressBackup/releases")
		title, _ := syscall.UTF16PtrFromString("Fortress Backup setup")
		syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(message)), uintptr(unsafe.Pointer(title)), 0x10)
		os.Exit(1)
	}
}
