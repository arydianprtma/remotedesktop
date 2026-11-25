Add-Type @"
  using System;
  using System.Text;
  using System.Runtime.InteropServices;

  public class WinUtil {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public static void HideTerminal() {
      EnumWindows((hWnd, lParam) => {
        if (IsWindowVisible(hWnd)) {
          int size = GetWindowTextLength(hWnd);
          if (size++ > 0) {
            StringBuilder sb = new StringBuilder(size);
            GetWindowText(hWnd, sb, size);
            string title = sb.ToString();
            if (title.IndexOf("powershell.EXE", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("WindowsPowerShell", StringComparison.OrdinalIgnoreCase) >= 0) {
              ShowWindow(hWnd, 0); // SW_HIDE
            }
          }
        }
        return true;
      }, IntPtr.Zero);
    }
  }
"@

[WinUtil]::HideTerminal()
Start-Sleep -Milliseconds 300

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save("H:\Remote Desk\screen_capture.png", [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
