Add-Type @"
  using System;
  using System.Text;
  using System.Runtime.InteropServices;

  public class CloseConsent {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    public const uint WM_CLOSE = 0x0010;

    public static void Close() {
      EnumWindows((hWnd, lParam) => {
        int size = GetWindowTextLength(hWnd);
        if (size++ > 0) {
          StringBuilder sb = new StringBuilder(size);
          GetWindowText(hWnd, sb, size);
          string title = sb.ToString();
          if (title.IndexOf("permission", StringComparison.OrdinalIgnoreCase) >= 0 ||
              title.IndexOf("consent", StringComparison.OrdinalIgnoreCase) >= 0) {
            PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
          }
        }
        return true;
      }, IntPtr.Zero);
    }
  }
"@

[CloseConsent]::Close()
