Add-Type @"
  using System;
  using System.Text;
  using System.Runtime.InteropServices;
  using System.Diagnostics;
  using System.IO;

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
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static void Find() {
      using (var sw = new StreamWriter(@"H:\Remote Desk\win_procs.txt")) {
        EnumWindows((hWnd, lParam) => {
          if (IsWindowVisible(hWnd)) {
            int size = GetWindowTextLength(hWnd);
            if (size++ > 0) {
              StringBuilder sb = new StringBuilder(size);
              GetWindowText(hWnd, sb, size);
              string title = sb.ToString();
              uint pid;
              GetWindowThreadProcessId(hWnd, out pid);
              string pName = "";
              try { pName = Process.GetProcessById((int)pid).ProcessName; } catch {}
              sw.WriteLine(pid + " | " + pName + " | " + title);
            }
          }
          return true;
        }, IntPtr.Zero);
      }
    }
  }
"@

[WinProcUtil]::Find()
