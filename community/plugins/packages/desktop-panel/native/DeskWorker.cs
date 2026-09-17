using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

/// <summary>
/// DSH 桌面 worker：在活动控制台会话的输入桌面上常驻运行，抓帧并接受输入注入指令。
/// 由 SYSTEM 启动器跨会话拉起；通过命名管道与 DSH host 插件通信。
/// 用法: DeskWorker.exe [管道名]      默认管道名 dsh-desktop
/// 协议: 帧   [4字节长度][4字节类型=1][JPEG]
///       输入 [4字节长度][4字节类型=2][UTF8 JSON]
///       日志 [4字节长度][4字节类型=3][UTF8 文本]
/// </summary>
class DeskWorker
{
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr OpenWindowStation(string lpszWinSta, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)] static extern bool SetProcessWindowStation(IntPtr hWinSta);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)] static extern bool CloseDesktop(IntPtr hDesktop);
    [DllImport("user32.dll", SetLastError = true)] static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr GetThreadDesktop(uint dwThreadId);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool GetUserObjectInformation(IntPtr hObj, int nIndex, StringBuilder pvInfo, int nLength, out int lpnLengthNeeded);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int nIndex);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);
    [DllImport("gdi32.dll", SetLastError = true)] static extern bool BitBlt(IntPtr hdcDest, int x, int y, int w, int h, IntPtr hdcSrc, int sx, int sy, int rop);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr hObject);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }

    const uint WINSTA_ALL_ACCESS = 0x37F;
    const uint DESKTOP_ALL = 0x01FF;
    const uint GENERIC_ALL = 0x10000000;
    const int UOI_NAME = 2, SRCCOPY = 0x00CC0020, SM_CXSCREEN = 0, SM_CYSCREEN = 1;
    const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const uint MOUSEEVENTF_MOVE = 0x0001, MOUSEEVENTF_ABSOLUTE = 0x8000;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008, MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020, MOUSEEVENTF_MIDDLEUP = 0x0040;
    const uint MOUSEEVENTF_WHEEL = 0x0800;
    const uint KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_UNICODE = 0x0004;
    const int FRAME_TYPE = 1, INPUT_TYPE = 2, LOG_TYPE = 3;

    static readonly object FrameLock = new object();
    static IntPtr CurrentDesktop = IntPtr.Zero;
    static string CurrentDesktopName = "?";
    static int ScreenWidth = 0, ScreenHeight = 0;
    static long FrameSeq = 0;
    static volatile bool Running = true;
    static volatile Stream Pipe = null;

    static void LogTo(string outDir, string line)
    {
        try { File.AppendAllText(Path.Combine(outDir, "worker.log.txt"), DateTime.Now.ToString("HH:mm:ss.fff ") + line + Environment.NewLine, Encoding.UTF8); } catch { }
    }

    static string DesktopName(IntPtr h)
    {
        if (h == IntPtr.Zero) return "(null)";
        StringBuilder sb = new StringBuilder(260); int n;
        return GetUserObjectInformation(h, UOI_NAME, sb, sb.Capacity, out n) ? sb.ToString() : "(未知)";
    }

    /// <summary>让本线程附着到当前输入桌面；桌面切换（锁屏/解锁）时自动重取句柄。</summary>
    static bool AttachInputDesktop(string outDir, bool force)
    {
        IntPtr h = OpenInputDesktop(0, false, DESKTOP_ALL | GENERIC_ALL);
        if (h == IntPtr.Zero) { if (force) LogTo(outDir, "OpenInputDesktop 失败 err=" + Marshal.GetLastWin32Error()); return false; }
        string name = DesktopName(h);
        bool changed = name != CurrentDesktopName || force;
        if (changed)
        {
            if (CurrentDesktop != IntPtr.Zero) CloseDesktop(CurrentDesktop);
            CurrentDesktop = h;
            CurrentDesktopName = name;
            SetThreadDesktop(h);
            ScreenWidth = GetSystemMetrics(SM_CXSCREEN);
            ScreenHeight = GetSystemMetrics(SM_CYSCREEN);
            LogTo(outDir, "附着桌面=" + name + " " + ScreenWidth + "x" + ScreenHeight);
        }
        else CloseDesktop(h);
        if (!SetThreadDesktop(CurrentDesktop)) return false;
        return true;
    }

    static byte[] CaptureJpeg(int quality)
    {
        IntPtr sdc = GetDC(IntPtr.Zero);
        if (sdc == IntPtr.Zero) return null;
        IntPtr mdc = CreateCompatibleDC(sdc), bmp = CreateCompatibleBitmap(sdc, ScreenWidth, ScreenHeight);
        IntPtr old = SelectObject(mdc, bmp);
        bool ok = BitBlt(mdc, 0, 0, ScreenWidth, ScreenHeight, sdc, 0, 0, SRCCOPY);
        byte[] data = null;
        if (ok)
        {
            using (Bitmap image = Image.FromHbitmap(bmp))
            using (MemoryStream ms = new MemoryStream())
            {
                ImageCodecInfo jpg = null;
                foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders()) if (c.MimeType == "image/jpeg") jpg = c;
                EncoderParameters ep = new EncoderParameters(1);
                ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);
                image.Save(ms, jpg, ep);
                ep.Dispose();
                data = ms.ToArray();
            }
        }
        SelectObject(mdc, old); DeleteObject(bmp); DeleteDC(mdc); ReleaseDC(IntPtr.Zero, sdc);
        return data;
    }

    static void WritePacket(Stream s, int type, byte[] payload)
    {
        byte[] header = new byte[8];
        BitConverter.GetBytes(payload.Length).CopyTo(header, 0);
        BitConverter.GetBytes(type).CopyTo(header, 4);
        lock (FrameLock) { s.Write(header, 0, 8); s.Write(payload, 0, payload.Length); s.Flush(); }
    }

    static void SendStatus(string text)
    {
        if (Pipe == null) return;
        try { WritePacket(Pipe, LOG_TYPE, Encoding.UTF8.GetBytes(text)); } catch { }
    }

    static int XtoAbs(int x) { return (int)Math.Round(x * 65535.0 / Math.Max(1, ScreenWidth - 1)); }
    static int YtoAbs(int y) { return (int)Math.Round(y * 65535.0 / Math.Max(1, ScreenHeight - 1)); }

    /// <summary>处理一条 JSON 输入指令（极简解析，避免外部依赖）。</summary>
    static void HandleInput(string json)
    {
        string t = Field(json, "t");
        if (t == "move")
        {
            INPUT[] i = new INPUT[1];
            i[0].type = INPUT_MOUSE;
            i[0].u.mi.dx = XtoAbs(Int(Field(json, "x"))); i[0].u.mi.dy = YtoAbs(Int(Field(json, "y")));
            i[0].u.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
            SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
        }
        else if (t == "click" || t == "dblclick")
        {
            int times = t == "dblclick" ? 2 : 1;
            for (int n = 0; n < times; n++)
            {
                INPUT[] i = new INPUT[2];
                i[0].type = INPUT_MOUSE; i[0].u.mi.dx = XtoAbs(Int(Field(json, "x"))); i[0].u.mi.dy = YtoAbs(Int(Field(json, "y")));
                i[0].u.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE; SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
                Thread.Sleep(20);
                string button = Field(json, "button");
                uint down = button == "right" ? MOUSEEVENTF_RIGHTDOWN : (button == "middle" ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_LEFTDOWN);
                uint up = button == "right" ? MOUSEEVENTF_RIGHTUP : (button == "middle" ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_LEFTUP);
                INPUT[] d = new INPUT[2];
                d[0].type = INPUT_MOUSE; d[0].u.mi.dwFlags = down;
                d[1].type = INPUT_MOUSE; d[1].u.mi.dwFlags = up;
                SendInput(2, d, Marshal.SizeOf(typeof(INPUT)));
                Thread.Sleep(40);
            }
        }
        else if (t == "down" || t == "up")
        {
            INPUT[] i = new INPUT[1];
            i[0].type = INPUT_MOUSE;
            string button = Field(json, "button");
            if (t == "down") i[0].u.mi.dwFlags = button == "right" ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
            else i[0].u.mi.dwFlags = button == "right" ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
            SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
        }
        else if (t == "scroll")
        {
            INPUT[] i = new INPUT[1];
            i[0].type = INPUT_MOUSE;
            i[0].u.mi.mouseData = unchecked((uint)Int(Field(json, "delta")));
            i[0].u.mi.dwFlags = MOUSEEVENTF_WHEEL;
            SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
        }
        else if (t == "key")
        {
            INPUT[] i = new INPUT[1];
            i[0].type = INPUT_KEYBOARD;
            i[0].u.ki.wVk = (ushort)Int(Field(json, "vk"));
            if (Field(json, "up") == "1") i[0].u.ki.dwFlags = KEYEVENTF_KEYUP;
            SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
        }
        else if (t == "text")
        {
            string s = Field(json, "s");
            foreach (char ch in s)
            {
                INPUT[] i = new INPUT[2];
                i[0].type = INPUT_KEYBOARD; i[0].u.ki.wScan = ch; i[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
                i[1].type = INPUT_KEYBOARD; i[1].u.ki.wScan = ch; i[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                SendInput(2, i, Marshal.SizeOf(typeof(INPUT)));
                Thread.Sleep(12);
            }
        }
    }

    static string Field(string json, string key)
    {
        string pat = "\"" + key + "\"";
        int i = json.IndexOf(pat, StringComparison.Ordinal);
        if (i < 0) return "";
        i = json.IndexOf(':', i + pat.Length);
        if (i < 0) return "";
        i++;
        while (i < json.Length && json[i] == ' ') i++;
        if (i >= json.Length) return "";
        if (json[i] == '"')
        {
            int end = json.IndexOf('"', i + 1);
            return end < 0 ? "" : json.Substring(i + 1, end - i - 1);
        }
        int j = i;
        while (j < json.Length && json[j] != ',' && json[j] != '}') j++;
        return json.Substring(i, j - i).Trim();
    }

    static int Int(string s) { int v; return int.TryParse(s, out v) ? v : 0; }

    static int Main(string[] args)
    {
        string pipeName = args.Length > 0 ? args[0] : "dsh-desktop";
        // 日志与自身同目录（安装脚本部署到 %ProgramData%\dsh-desktop-panel）
        string outDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        Directory.CreateDirectory(outDir);
        LogTo(outDir, "worker 启动 pid=" + Process.GetCurrentProcess().Id + " 会话=" + Process.GetCurrentProcess().SessionId + " 管道=" + pipeName);

        IntPtr hwinsta = OpenWindowStation("WinSta0", false, WINSTA_ALL_ACCESS);
        if (hwinsta == IntPtr.Zero) { LogTo(outDir, "OpenWindowStation 失败 err=" + Marshal.GetLastWin32Error()); return 2; }
        SetProcessWindowStation(hwinsta);
        if (!AttachInputDesktop(outDir, true)) { LogTo(outDir, "附着输入桌面失败"); }

        // 帧循环线程
        Thread pump = new Thread(delegate()
        {
            int quality = 70;
            LogTo(outDir, "帧循环线程启动");
            while (Running)
            {
                try
                {
                    if (Pipe != null)
                    {
                        AttachInputDesktop(outDir, false);
                        byte[] jpeg = CaptureJpeg(quality);
                        if (jpeg != null && jpeg.Length > 0)
                        {
                            WritePacket(Pipe, FRAME_TYPE, jpeg);
                            FrameSeq++;
                            if (FrameSeq % 10 == 0) LogTo(outDir, "已发送帧 " + FrameSeq + " 桌面=" + CurrentDesktopName + " 大小=" + (jpeg.Length / 1024) + "KB 尺寸=" + ScreenWidth + "x" + ScreenHeight);
                        }
                        else LogTo(outDir, "抓帧返回空 (桌面=" + CurrentDesktopName + ")");
                        Thread.Sleep(120);
                    }
                    else Thread.Sleep(300);
                }
                catch (Exception ex) { LogTo(outDir, "帧循环异常: " + ex.Message); Pipe = null; Thread.Sleep(500); }
            }
        });
        pump.IsBackground = true;
        pump.Start();

        // 管道循环：等待 DSH 插件连接
        while (Running)
        {
            try
            {
                LogTo(outDir, "等待管道连接: " + pipeName);
                using (NamedPipeServerStream server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 1 << 20, 1 << 20))
                {
                    server.WaitForConnection();
                    LogTo(outDir, "客户端已连接");
                    Pipe = server;
                    SendStatus("connected desktop=" + CurrentDesktopName + " " + ScreenWidth + "x" + ScreenHeight);
                    byte[] header = new byte[8];
                    while (Running && server.IsConnected)
                    {
                        if (!ReadExact(server, header, 8)) break;
                        int len = BitConverter.ToInt32(header, 0);
                        int type = BitConverter.ToInt32(header, 4);
                        if (len <= 0 || len > (1 << 24)) break;
                        byte[] payload = new byte[len];
                        if (!ReadExact(server, payload, len)) break;
                        if (type == INPUT_TYPE) HandleInput(Encoding.UTF8.GetString(payload));
                    }
                }
            }
            catch (Exception ex) { LogTo(outDir, "管道异常: " + ex.Message); }
            finally { Pipe = null; LogTo(outDir, "客户端断开"); }
            Thread.Sleep(500);
        }
        return 0;
    }

    static bool ReadExact(Stream s, byte[] buffer, int count)
    {
        int read = 0;
        while (read < count)
        {
            int n = s.Read(buffer, read, count - read);
            if (n <= 0) return false;
            read += n;
        }
        return true;
    }
}
