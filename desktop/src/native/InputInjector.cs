using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace RemoteDesk.Native
{
    class Program
    {
        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;

        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_UNICODE = 0x0004;

        static void Main(string[] args)
        {
            Console.WriteLine("READY");
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (line == "exit" || line == "quit") break;

                try
                {
                    string[] parts = line.Split(' ');
                    string cmd = parts[0].ToLowerInvariant();

                    switch (cmd)
                    {
                        case "move":
                            if (parts.Length >= 3)
                            {
                                int x = int.Parse(parts[1]);
                                int y = int.Parse(parts[2]);
                                SetCursorPos(x, y);
                            }
                            break;

                        case "down":
                            if (parts.Length >= 2)
                            {
                                string btn = parts[1].ToLowerInvariant();
                                if (btn == "left") mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                                else if (btn == "right") mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
                                else if (btn == "middle") mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, UIntPtr.Zero);
                            }
                            break;

                        case "up":
                            if (parts.Length >= 2)
                            {
                                string btn = parts[1].ToLowerInvariant();
                                if (btn == "left") mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                                else if (btn == "right") mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
                                else if (btn == "middle") mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, UIntPtr.Zero);
                            }
                            break;

                        case "wheel":
                            if (parts.Length >= 2)
                            {
                                int delta = int.Parse(parts[1]);
                                mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
                            }
                            break;

                        case "keydown":
                            if (parts.Length >= 2)
                            {
                                byte vk = byte.Parse(parts[1]);
                                keybd_event(vk, 0, 0, UIntPtr.Zero);
                            }
                            break;

                        case "keyup":
                            if (parts.Length >= 2)
                            {
                                byte vk = byte.Parse(parts[1]);
                                keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                            }
                            break;

                        case "char":
                            if (parts.Length >= 2)
                            {
                                int charCode = int.Parse(parts[1]);
                                keybd_event(0, (byte)charCode, KEYEVENTF_UNICODE, UIntPtr.Zero);
                                keybd_event(0, (byte)charCode, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, UIntPtr.Zero);
                            }
                            break;
                    }
                }
                catch
                {
                    // Ignore malformed command silently to maintain stream stability
                }
            }
        }
    }
}
