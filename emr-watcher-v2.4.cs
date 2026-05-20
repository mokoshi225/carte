// ===================================================================
//  emr-watcher-v2.4.cs — SSI e-カルテ 患者情報 常時監視 Companion
//  コンパイル: build-companion.bat をダブルクリック
//  動作:
//    1. 常時稼働（バックグラウンド、最小化推奨）
//    2. 1秒ごとに e-カルテ/CITA ウィンドウをUIAで検出
//    3. 検出後即ファイル書出（初回検出で即時反映）
//    4. bp-app.html の [EMR読込] ボタンで読み込む
// ===================================================================

using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Automation;

class PatientInfo
{
    public string Id;
    public string Name;
}

class EmrWatcher
{
    static string _exeDir;
    static string _outputPath;
    static string _jsOutputPath;
    static string _logPath;
    static string _lastWrittenId = null;
    static int _pollIntervalMs = 1000;

    static void Main(string[] args)
    {
        _exeDir = Environment.CurrentDirectory;
        _outputPath = Path.Combine(_exeDir, "emr-patient.json");
        _jsOutputPath = Path.Combine(_exeDir, "emr-patient.js");
        _logPath = Path.Combine(_exeDir, "emr-watcher.log");

        if (args.Length > 0 && Directory.Exists(args[0]))
        {
            _exeDir = args[0];
            _outputPath = Path.Combine(_exeDir, "emr-patient.json");
            _jsOutputPath = Path.Combine(_exeDir, "emr-patient.js");
            _logPath = Path.Combine(_exeDir, "emr-watcher.log");
        }
        if (args.Length > 1)
        {
            int interval;
            if (int.TryParse(args[1], out interval))
                _pollIntervalMs = Math.Max(500, Math.Min(interval, 10000));
        }

        Log("EMR Watcher started | interval=" + _pollIntervalMs + "ms");
        Console.WriteLine("EMR Watcher running in background... (Ctrl+C to stop)");
        Console.WriteLine("Output: " + _outputPath);

        Console.CancelKeyPress += (s, e) =>
        {
            e.Cancel = true;
            Log("Stopped by user (Ctrl+C)");
            Environment.Exit(0);
        };

        while (true)
        {
            try
            {
                PatientInfo info = DetectPatient();
                if (info != null && info.Id != null)
                {
                    string curId = info.Id;
                    string name = (info.Name ?? "").Trim();
                    // Write JSON only when patient ID changes (avoid redundant writes)
                    if (curId != _lastWrittenId)
                    {
                        string escapedName = name.Replace("\\", "\\\\").Replace("\"", "\\\"");
                        string json = "{\n" +
                            "  \"patientId\": \"" + curId + "\",\n" +
                            "  \"patientName\": \"" + escapedName + "\",\n" +
                            "  \"detectedAt\": \"" +
                            DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\"\n" +
                            "}";
                        File.WriteAllText(_outputPath, json, Encoding.UTF8);
                        string js = "window.EMR_PATIENT=" + json + ";\n";
                        File.WriteAllText(_jsOutputPath, js, Encoding.UTF8);
                        Log("Patient ID: " + curId + " Name: " + name);
                        Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss")
                            + "] Patient: " + curId + " " + name);
                        _lastWrittenId = curId;
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Error: " + ex.Message);
            }
            Thread.Sleep(_pollIntervalMs);
        }
    }

    static PatientInfo DetectPatient()
    {
        var root = AutomationElement.RootElement;
        if (root == null) return null;

        // Strategy 1: "カルテ記載" window — probe confirms Pane detection works here
        AutomationElement descWin = FindWindowByTitle(root, "カルテ記載");
        if (descWin != null)
        {
            PatientInfo info = ScanWindowForPatient(descWin);
            if (info != null) { Log("Detected via カルテ記載 Pane: " + info.Id); return info; }
        }

        // Strategy 2: "カルテ・オーダー入力" window — probe found Pane but may hit element limit
        AutomationElement orderWin = FindWindowByTitle(root, "カルテ・オーダー入力");
        if (orderWin != null)
        {
            PatientInfo info = ScanWindowForPatient(orderWin);
            if (info != null) { Log("Detected via カルテ・オーダー入力 Pane: " + info.Id); return info; }
        }

        // Strategy 3: title regex on ALL top-level windows for [00000000]
        // (this catches CITA Clinical Finder etc., but prefer windows with "カルテ")
        AutomationElement titleMatch = null;
        string titleId = null;
        foreach (AutomationElement win in EnumerateWindows(root))
        {
            string title = win.Current.Name;
            if (string.IsNullOrEmpty(title)) continue;
            Match m = Regex.Match(title, @"\[(\d{8})\]");
            if (!m.Success) continue;
            if (title.IndexOf("カルテ", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                PatientInfo info = ScanWindowForPatient(win);
                if (info != null) { Log("Detected via " + title + ": " + info.Id); return info; }
                Log("Detected via title [" + m.Groups[1].Value + "] from (優先): " + title);
                return new PatientInfo { Id = m.Groups[1].Value, Name = "" };
            }
            // Remember first match if no priority window found
            if (titleMatch == null)
            {
                titleMatch = win;
                titleId = m.Groups[1].Value;
            }
        }
        if (titleId != null)
        {
            PatientInfo info = ScanWindowForPatient(titleMatch);
            if (info != null) { Log("Detected via " + titleMatch.Current.Name + ": " + info.Id); return info; }
            Log("Detected via title regex [" + titleId + "] from: " + titleMatch.Current.Name);
            return new PatientInfo { Id = titleId, Name = "" };
        }

        return null;
    }

    // Scan a window's UIA elements for patient ID (8 digits) and name (via known AutomationIds).
    static PatientInfo ScanWindowForPatient(AutomationElement window)
    {
        try
        {
            // Phase 1: search known label AutomationIds across all descendants
            //   lblKjName = patient name (kanji)
            //   lblBirth  = birth date
            string foundName = null;
            string foundId = null;

            // Search for lblKjName (patient name label)
            try
            {
                var nameEls = window.FindAll(TreeScope.Descendants,
                    new PropertyCondition(AutomationElement.AutomationIdProperty, "lblKjName"));
                if (nameEls != null && nameEls.Count > 0)
                {
                    string txt = nameEls[0].Current.Name;
                    if (!string.IsNullOrEmpty(txt)) foundName = txt.Trim();
                    Log("ScanWindow: lblKjName = \"" + (foundName ?? "") + "\"");
                }
            }
            catch { }

            // Search for lblBirth (birth date label, for logging)
            try
            {
                var birthEls = window.FindAll(TreeScope.Descendants,
                    new PropertyCondition(AutomationElement.AutomationIdProperty, "lblBirth"));
                if (birthEls != null && birthEls.Count > 0)
                {
                    string txt = birthEls[0].Current.Name;
                    if (!string.IsNullOrEmpty(txt))
                        Log("ScanWindow: lblBirth = \"" + txt.Trim() + "\"");
                }
            }
            catch { }

            // Phase 2: search for 8-digit ID within lblKjName's parent container only.
            //   This ensures the ID belongs to the same patient info section as the name,
            //   avoiding stale IDs from elsewhere in the window.
            if (foundId == null && foundName != null)
            {
                try
                {
                    var nameEls = window.FindAll(TreeScope.Descendants,
                        new PropertyCondition(AutomationElement.AutomationIdProperty, "lblKjName"));
                    if (nameEls != null && nameEls.Count > 0)
                    {
                        AutomationElement parent = TreeWalker.ControlViewWalker.GetParent(nameEls[0]);
                        if (parent != null)
                        {
                            var textEls = parent.FindAll(TreeScope.Descendants,
                                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text));
                            foreach (AutomationElement el in textEls)
                            {
                                string txt = null;
                                try { txt = el.Current.Name; } catch { continue; }
                                if (string.IsNullOrEmpty(txt)) continue;
                                string trimmed = txt.Trim();
                                if (trimmed.Length == 8 && Regex.IsMatch(trimmed, @"^\d{8}$"))
                                {
                                    foundId = trimmed;
                                    break;
                                }
                            }
                        }
                    }
                }
                catch { }
            }

            if (foundId != null)
            {
                // Clean up name: take only the first line if multi-line
                if (!string.IsNullOrEmpty(foundName))
                {
                    int nl = foundName.IndexOf('\n');
                    if (nl >= 0) foundName = foundName.Substring(0, nl).Trim();
                }
                return new PatientInfo { Id = foundId, Name = foundName ?? "" };
            }
            return null;
        }
        catch (Exception ex)
        {
            Log("ScanWindowForPatient error: " + ex.Message);
            return null;
        }
    }

    // Heuristic: check if string looks like a Japanese name (contains kanji or kana, not all digits/ascii)
    static bool ContainsJapaneseName(string s)
    {
        if (string.IsNullOrEmpty(s)) return false;
        if (s.Length > 30) return false; // too long for a name
        bool hasJapanese = false;
        foreach (char c in s)
        {
            if (c >= 0x4E00 && c <= 0x9FFF) { hasJapanese = true; break; } // CJK Unified Ideographs (kanji)
            if (c >= 0x3040 && c <= 0x309F) { hasJapanese = true; break; } // Hiragana
            if (c >= 0x30A0 && c <= 0x30FF) { hasJapanese = true; break; } // Katakana
        }
        if (!hasJapanese) return false;
        // Must not be all digits
        if (Regex.IsMatch(s, @"^\d+$")) return false;
        return true;
    }

    static AutomationElement FindWindowByTitle(AutomationElement parent, string partialTitle)
    {
        foreach (AutomationElement w in EnumerateWindows(parent))
        {
            if (w.Current.Name.IndexOf(partialTitle, StringComparison.OrdinalIgnoreCase) >= 0)
                return w;
        }
        return null;
    }

    static AutomationElement FindWindowByClass(AutomationElement parent, string classPrefix)
    {
        foreach (AutomationElement w in EnumerateWindows(parent))
        {
            string cls = w.Current.ClassName;
            if (!string.IsNullOrEmpty(cls) && cls.StartsWith(classPrefix))
                return w;
        }
        return null;
    }

    static AutomationElementCollection EnumerateWindows(AutomationElement parent)
    {
        return parent.FindAll(TreeScope.Children,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window));
    }

    static void Log(string msg)
    {
        try
        {
            File.AppendAllText(_logPath,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " | " + msg + "\n");
        }
        catch { }
    }
}
