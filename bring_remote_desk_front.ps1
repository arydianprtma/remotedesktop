Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class WinUtil {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
  }
"@
$proc = Get-Process -Name "Remote Desk" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($proc) {
    [WinUtil]::ShowWindow($proc.MainWindowHandle, 3) # SW_MAXIMIZE
    [WinUtil]::SetForegroundWindow($proc.MainWindowHandle)
}
