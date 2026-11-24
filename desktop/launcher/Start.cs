// VerseOrchestrator.exe at the top of a Windows release (1.25.2): opens the desktop app in shell\ with no
// console window (the start file showed one). A copy whose shell\ is gone is started by app\start.cmd.
// Built by desktop/scripts/pack.mjs with the C# compiler Windows itself has (C# 5).
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("VerseOrchestrator")]
[assembly: AssemblyProduct("VerseOrchestrator")]
[assembly: AssemblyCompany("VerseOrchestrator")]

static class Start
{
    // one argument as CommandLineToArgvW reads it back
    static string Quote(string a)
    {
        if (a.Length > 0 && a.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return a;
        var s = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in a)
        {
            if (c == '\\') { slashes++; continue; }
            s.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
            slashes = 0;
            s.Append(c);
        }
        return s.Append('\\', slashes * 2).Append('"').ToString();
    }

    // a new shell an update brought waits in shell.next\, or one that never opened is on trial: shellSwap.ts
    // puts the right one in place before it is started (0.1 s; nothing to do — not even asked)
    static void PlaceShell(string top, string shell)
    {
        try
        {
            if (!Directory.Exists(Path.Combine(top, "shell.next")) &&
                !Directory.Exists(Path.Combine(top, "shell.lock")) &&
                !File.Exists(Path.Combine(top, "shell", ".vo-trial.json")) &&
                (File.Exists(shell) || !Directory.Exists(Path.Combine(top, "shell.previous")))) return;
            string node = Path.Combine(top, "app", "node", "node.exe");
            string code = Path.Combine(top, "app", "server", "src", "shellSwap.ts");
            if (!File.Exists(node) || !File.Exists(code)) return;
            var p = new ProcessStartInfo(node);
            p.UseShellExecute = false;
            p.CreateNoWindow = true;
            p.WorkingDirectory = top;
            // a quoted path must not end with a backslash
            p.Arguments = "--disable-warning=ExperimentalWarning " + Quote(code) + " " + Quote(top.TrimEnd('\\'));
            using (var run = Process.Start(p)) run.WaitForExit(20000);
        }
        catch (Exception) { }
    }

    [STAThread]
    static int Main(string[] args)
    {
        string top = AppDomain.CurrentDomain.BaseDirectory;
        string shell = Path.Combine(top, "shell", "VerseOrchestrator.exe");
        string script = Path.Combine(top, "app", "start.cmd");
        PlaceShell(top, shell);
        bool app = File.Exists(shell);
        if (!app && !File.Exists(script))
        {
            MessageBox.Show(
                "Поруч із програмою немає папок shell і app — розпакуйте архів ще раз.\n\n" +
                "The shell and app folders are missing next to the program — unpack the archive again.",
                "VerseOrchestrator", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        var p = new ProcessStartInfo(app ? shell : script);
        // an editor's terminal sets it, and Electron would then run as plain Node: nothing would open
        if (app)
        {
            p.UseShellExecute = false;
            p.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
        }
        // never app\: an update renames it
        p.WorkingDirectory = top;
        var line = new StringBuilder();
        foreach (string a in args) line.Append(line.Length > 0 ? " " : "").Append(Quote(a));
        p.Arguments = line.ToString();
        try
        {
            Process.Start(p);
            return 0;
        }
        catch (Exception e)
        {
            MessageBox.Show(e.Message, "VerseOrchestrator", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
