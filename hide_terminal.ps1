Add-Type @"
  using System;
  using System.Text;
  using System.Runtime.InteropServices;
  using System.Diagnostics;

  public class WinProcUtil {
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

    public const int SW_HIDE = 0;
    public const int SW_MINIMIZE = 6;

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
              ShowWindow(hWnd, SW_HIDE);
            }
          }
        }
        return true;
      }, IntPtr.Zero);
    }
  }
"@

[WinProcUtil]::HideTerminal()
