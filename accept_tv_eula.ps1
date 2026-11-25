Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class WinAct {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
  }
"@

$proc = Get-Process -Name "TeamViewer" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($proc) {
    [WinAct]::SetForegroundWindow($proc.MainWindowHandle)
    Start-Sleep -Milliseconds 300
    Add-Type -AssemblyName System.Windows.Forms
    # Press Tab then Space to check the checkbox, then Tab to Continue, then Enter
    [System.Windows.Forms.SendKeys]::SendWait("{TAB}")
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait(" ")
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("{TAB}")
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("{TAB}")
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
}
