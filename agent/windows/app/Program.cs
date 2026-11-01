// Native Windows application host. Provisioning stays in-process; no console or
// powershell.exe is launched to display the application.
using System;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Windows.Forms;

public static class FortressWindowsShell {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
    public static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
}

static class FortressApplication {
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string cls,string title);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window,int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [STAThread] static int Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool created;
        using(var mutex=new Mutex(false,@"Local\InSelfControll.FortressBackup.Window",out created)) {
            if(!created) {
                for(int attempt=0;attempt<300;attempt++) {
                    var window=FindWindow(null,"Fortress Backup");
                    if(window!=IntPtr.Zero){ShowWindowAsync(window,9);SetForegroundWindow(window);return 0;}
                    Thread.Sleep(100);
                }
                MessageBox.Show("The app is already starting. Check the taskbar or administrator consent prompt.","Fortress Backup");
                return 0;
            }
            try {
                string root=AppDomain.CurrentDomain.BaseDirectory;
                foreach(var name in new[]{"setup.ps1","setup-ui.ps1","recovery-ui.ps1","provision.ps1","install-task.ps1","fortress-agent.exe","restic.exe","SHA256SUMS"})
                    if(!File.Exists(Path.Combine(root,name)))throw new IOException("Application files are missing. Run the installer again to repair Fortress Backup.");
                using(var runspace=RunspaceFactory.CreateRunspace()) {
                    runspace.ApartmentState=ApartmentState.STA;
                    runspace.ThreadOptions=PSThreadOptions.UseCurrentThread;
                    runspace.Open();
                    Runspace.DefaultRunspace=runspace;
                    using(var shell=PowerShell.Create()) {
                        shell.Runspace=runspace;
                        shell.AddScript(@"param($root)
$ErrorActionPreference='Stop'
. (Join-Path $root 'provision.ps1')
. (Join-Path $root 'setup-ui.ps1')
$window=New-SetupWindow -SetupRoot $root
try { [void]$window.ShowDialog() } finally { $window.Dispose() }").AddArgument(root);
                        shell.Invoke();
                        if(shell.Streams.Error.Count>0)throw shell.Streams.Error[0].Exception;
                    }
                }
                return 0;
            } catch(Exception error) {
                while(error.InnerException!=null)error=error.InnerException;
                MessageBox.Show("Fortress Backup could not open. "+error.Message,"Fortress Backup",MessageBoxButtons.OK,MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
