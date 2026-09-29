using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

/// <summary>
/// 会话启动器：以 SYSTEM 身份把目标进程启动到活动控制台会话的 WinSta0\Winlogon 桌面。
/// 用法: SessionLauncher.exe [exe] [args...]   缺省启动同目录 DeskAgent.exe probe
/// 日志: C:\ProgramData\dsh-deskprobe\launcher.log.txt
/// </summary>
class SessionLauncher
{
    [DllImport("kernel32.dll")] static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr h, uint acc, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool DuplicateTokenEx(IntPtr existing, uint acc, IntPtr attrs, int level, int type, out IntPtr newToken);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetTokenInformation(IntPtr token, int cls, ref uint info, int len);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcessAsUser(IntPtr token, string app, string cmd, IntPtr pa, IntPtr ta, bool inherit,
        uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool AdjustTokenPrivileges(IntPtr token, bool disableAll, ref TOKEN_PRIVILEGES newState, int len, IntPtr prev, IntPtr retLen);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool LookupPrivilegeValue(string system, string name, out long luid);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFO
    {
        public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
    [StructLayout(LayoutKind.Sequential)]
    struct LUID_AND_ATTRIBUTES { public long Luid; public int Attributes; }
    [StructLayout(LayoutKind.Sequential)]
    struct TOKEN_PRIVILEGES { public int PrivilegeCount; public LUID_AND_ATTRIBUTES Privileges; }

    const uint TOKEN_ALL_ACCESS = 0xF01FF;
    const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
    const uint TOKEN_QUERY = 0x0008;
    const int SE_PRIVILEGE_ENABLED = 0x00000002;
    const int TokenSessionId = 12;
    const int SecurityImpersonation = 2;
    const int TokenPrimary = 1;
    const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    const string OutDir = @"C:\ProgramData\dsh-deskprobe";

    static readonly StringBuilder Log = new StringBuilder();
    static void Say(string s) { Log.AppendLine(s); Console.WriteLine(s); }

    static void EnablePrivilege(string name)
    {
        IntPtr token;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out token))
        { Say("OpenProcessToken 失败 err=" + Marshal.GetLastWin32Error()); return; }
        long luid;
        if (!LookupPrivilegeValue(null, name, out luid))
        { Say("LookupPrivilegeValue(" + name + ") 失败 err=" + Marshal.GetLastWin32Error()); CloseHandle(token); return; }
        TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
        tp.PrivilegeCount = 1; tp.Privileges.Luid = luid; tp.Privileges.Attributes = SE_PRIVILEGE_ENABLED;
        bool ok = AdjustTokenPrivileges(token, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
        Say("启用权限 " + name + " -> " + ok + " err=" + Marshal.GetLastWin32Error());
        CloseHandle(token);
    }

    static int Main(string[] args)
    {
        Directory.CreateDirectory(OutDir);
        string exe, cmdline;
        if (args.Length >= 1) { exe = args[0]; }
        else { exe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "DeskAgent.exe"); }
        StringBuilder cmd = new StringBuilder("\"" + exe + "\"");
        if (args.Length >= 2) { for (int i = 1; i < args.Length; i++) cmd.Append(" \"" + args[i] + "\""); }
        else { cmd.Append(" probe \"" + OutDir + "\" session1"); }
        cmdline = cmd.ToString();

        Say("== SessionLauncher ==");
        Say("时间: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
        Say("当前进程会话=" + System.Diagnostics.Process.GetCurrentProcess().SessionId);
        Say("目标: " + cmdline);

        EnablePrivilege("SeTcbPrivilege");
        EnablePrivilege("SeAssignPrimaryTokenPrivilege");
        EnablePrivilege("SeIncreaseQuotaPrivilege");

        uint session = WTSGetActiveConsoleSessionId();
        Say("活动控制台会话=" + session);

        IntPtr hToken;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ALL_ACCESS, out hToken))
        { Say("OpenProcessToken 失败 err=" + Marshal.GetLastWin32Error()); Flush(); return 2; }
        IntPtr dup;
        if (!DuplicateTokenEx(hToken, TOKEN_ALL_ACCESS, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out dup))
        { Say("DuplicateTokenEx 失败 err=" + Marshal.GetLastWin32Error()); Flush(); return 3; }
        uint sid = session;
        if (!SetTokenInformation(dup, TokenSessionId, ref sid, sizeof(uint)))
        { Say("SetTokenInformation(TokenSessionId) 失败 err=" + Marshal.GetLastWin32Error()); Flush(); return 4; }
        Say("令牌会话已设置为 " + session);

        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
        si.lpDesktop = @"WinSta0\Winlogon";
        PROCESS_INFORMATION pi;
        bool created = CreateProcessAsUser(dup, exe, cmdline, IntPtr.Zero, IntPtr.Zero, false,
            CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, null, ref si, out pi);
        Say("CreateProcessAsUser(桌面=" + si.lpDesktop + ") -> " + created + " err=" + Marshal.GetLastWin32Error());
        if (created) { Say("已启动 PID=" + pi.dwProcessId); CloseHandle(pi.hProcess); CloseHandle(pi.hThread); }
        CloseHandle(dup); CloseHandle(hToken);
        Flush();
        return created ? 0 : 5;
    }

    static void Flush()
    {
        try { File.WriteAllText(Path.Combine(OutDir, "launcher.log.txt"), Log.ToString(), Encoding.UTF8); } catch { }
    }
}
