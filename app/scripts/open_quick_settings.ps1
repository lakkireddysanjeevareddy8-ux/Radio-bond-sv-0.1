Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WindowsFlyout {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void OpenQuickSettings() {
        // VK_LWIN = 0x5B, 'A' = 0x41
        keybd_event(0x5B, 0, 0, UIntPtr.Zero);
        keybd_event(0x41, 0, 0, UIntPtr.Zero);
        keybd_event(0x41, 0, 2, UIntPtr.Zero);
        keybd_event(0x5B, 0, 2, UIntPtr.Zero);
    }
}
"@
[WindowsFlyout]::OpenQuickSettings()
