// ===================================================================
//  emr-watcher-v2.6.cs — SSI e-カルテ 患者情報 常時監視 Companion
//  コンパイル: build-companion.bat をダブルクリック
//  動作:
//    1. 常時稼働（バックグラウンド、最小化推奨）
//    2. 1秒ごとに「カルテ・オーダー入力」ウィンドウをUIAで検出
//    3. 検出後ファイル書出（2回連続確認で整合性保証）
//    4. bp-app.html の [EMR読込] ボタンで読み込む
//
//  v2.6 (2026-05-26): pnlKanHd コンテナ経由の高速検索に最適化。
//    従来は window.FindAll(TreeScope.Descendants) を3回実行（合計18秒）。
//    TreeScope.Children で TopInformationContainer → pnlKanHd と2段階で
//    辿る方式に変更。全子孫走査を回避しミリ秒で完了。
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
    static string _pendingId = null;
    static string _pendingName = null;
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

        // Clear old log on startup to prevent unbounded growth
        try { File.WriteAllText(_logPath, ""); } catch { }
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
                    string curName = (info.Name ?? "").Trim();

                    if (curId == _lastWrittenId)
                    {
                        // Same patient — clear pending state, no write needed
                        _pendingId = null;
                        _pendingName = null;
                    }
                    else if (_pendingId == curId && _pendingName == curName)
                    {
                        // Confirmed: same (ID, name) seen twice consecutively
                        // Write now (avoids mixed new-ID + old-name race condition)
                        string escapedName = curName.Replace("\\", "\\\\").Replace("\"", "\\\"");
                        string json = "{\n" +
                            "  \"patientId\": \"" + curId + "\",\n" +
                            "  \"patientName\": \"" + escapedName + "\",\n" +
                            "  \"detectedAt\": \"" +
                            DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\"\n" +
                            "}";
                        File.WriteAllText(_outputPath, json, Encoding.UTF8);
                        string js = "window.EMR_PATIENT=" + json + ";\n";
                        File.WriteAllText(_jsOutputPath, js, Encoding.UTF8);
                        Log("Patient ID: " + curId + " Name: " + curName);
                        Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss")
                            + "] Patient: " + curId + " " + curName);
                        _lastWrittenId = curId;
                        _pendingId = null;
                        _pendingName = null;
                    }
                    else
                    {
                        // First sighting of a new (ID, name) pair — defer write
                        // until next poll confirms consistency
                        _pendingId = curId;
                        _pendingName = curName;
                    }
                }
                else
                {
                    // No patient detected — clear pending
                    _pendingId = null;
                    _pendingName = null;
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

        // Only monitor "カルテ・オーダー入力" window
        AutomationElement orderWin = FindWindowByTitle(root, "カルテ・オーダー入力");
        if (orderWin != null)
        {
            PatientInfo info = ScanWindowForPatient(orderWin);
            if (info != null) { Log("Detected via カルテ・オーダー入力: " + info.Id); return info; }
        }

        return null;
    }

    // Scan a window's UIA elements for patient ID (8 digits) and name (via known AutomationIds).
    //
    // 最適化: 3階層の Children 検索で pnlKanHd に到達する（全子孫走査なし）。
    //   Window → TopInformationContainer → pnlKanHd → lblKanCode / lblKjName
    // 各階層で同レベルの要素だけをチェックするためミリ秒で完了する。
    // 従来は window.FindAll(TreeScope.Descendants, ...) を3回実行していたため
    // 大規模なUIAツリーで1回あたり5〜7秒、合計18秒かかっていた。
    static PatientInfo ScanWindowForPatient(AutomationElement window)
    {
        try
        {
            // Phase 1: Walk 3 levels via Children (not Descendants) to reach pnlKanHd.
            // This avoids traversing the entire UIA tree (hundreds of elements).
            //
            //   window.Children → TopInformationContainer
            //   TopInformationContainer.Children → pnlKanHd
            //   pnlKanHd.Children/Descendants → lblKanCode, lblKjName, lblBirth
            AutomationElement kanHd = null;
            try
            {
                var topInfoEls = window.FindAll(TreeScope.Children,
                    new PropertyCondition(AutomationElement.AutomationIdProperty,
                        "TopInformationContainer"));
                if (topInfoEls != null && topInfoEls.Count > 0)
                {
                    var kanHdEls = topInfoEls[0].FindAll(TreeScope.Children,
                        new PropertyCondition(AutomationElement.AutomationIdProperty, "pnlKanHd"));
                    if (kanHdEls != null && kanHdEls.Count > 0)
                        kanHd = kanHdEls[0];
                }
            }
            catch { }

            if (kanHd != null)
            {
                // Phase 2: Search within pnlKanHd only — very fast (small subtree, ~10 elements)
                string foundName = null;
                string foundId = null;

                // lblKjName (patient name in kanji)
                try
                {
                    var nameEls = kanHd.FindAll(TreeScope.Descendants,
                        new PropertyCondition(AutomationElement.AutomationIdProperty, "lblKjName"));
                    if (nameEls != null && nameEls.Count > 0)
                    {
                        string txt = nameEls[0].Current.Name;
                        if (!string.IsNullOrEmpty(txt)) foundName = txt.Trim();
                        Log("ScanWindow: lblKjName = \"" + (foundName ?? "") + "\"");
                    }
                }
                catch { }

                // lblKanCode (patient ID, 8 digits) — PRIMARY ID source
                try
                {
                    var idEls = kanHd.FindAll(TreeScope.Descendants,
                        new PropertyCondition(AutomationElement.AutomationIdProperty, "lblKanCode"));
                    if (idEls != null && idEls.Count > 0)
                    {
                        string txt = idEls[0].Current.Name;
                        if (!string.IsNullOrEmpty(txt))
                        {
                            string trimmed = txt.Trim();
                            if (trimmed.Length == 8 && Regex.IsMatch(trimmed, @"^\d{8}$"))
                            {
                                foundId = trimmed;
                                Log("ScanWindow: lblKanCode = \"" + foundId + "\"");
                            }
                        }
                    }
                }
                catch { }

                // lblBirth (birth date, for logging)
                try
                {
                    var birthEls = kanHd.FindAll(TreeScope.Descendants,
                        new PropertyCondition(AutomationElement.AutomationIdProperty, "lblBirth"));
                    if (birthEls != null && birthEls.Count > 0)
                    {
                        string txt = birthEls[0].Current.Name;
                        if (!string.IsNullOrEmpty(txt))
                            Log("ScanWindow: lblBirth = \"" + txt.Trim() + "\"");
                    }
                }
                catch { }

                // Fallback within kanHd: if lblKanCode not found, scan Text elements for 8-digit IDs
                if (foundId == null)
                {
                    try
                    {
                        var textEls = kanHd.FindAll(TreeScope.Descendants,
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
                                Log("ScanWindow: fallback ID (in pnlKanHd) = \"" + foundId + "\"");
                                break;
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
            }

            // Phase 3: Fallback — full-window scan if pnlKanHd not found
            // (for compatibility with different EMR versions / layouts)
            Log("ScanWindow: pnlKanHd not found, falling back to full-window scan");
            return ScanWindowFullFallback(window);
        }
        catch (Exception ex)
        {
            Log("ScanWindowForPatient error: " + ex.Message);
            return null;
        }
    }

    // Original full-window scan as fallback (slower but compatible).
    // Used when pnlKanHd container is not found (e.g. different EMR version).
    static PatientInfo ScanWindowFullFallback(AutomationElement window)
    {
        try
        {
            string foundName = null;
            string foundId = null;

            // Search for lblKjName
            try
            {
                var nameEls = window.FindAll(TreeScope.Descendants,
                    new PropertyCondition(AutomationElement.AutomationIdProperty, "lblKjName"));
                if (nameEls != null && nameEls.Count > 0)
                {
                    string txt = nameEls[0].Current.Name;
                    if (!string.IsNullOrEmpty(txt)) foundName = txt.Trim();
                }
            }
            catch { }

            // Search for lblKanCode
            try
            {
                var idEls = window.FindAll(TreeScope.Descendants,
                    new PropertyCondition(AutomationElement.AutomationIdProperty, "lblKanCode"));
                if (idEls != null && idEls.Count > 0)
                {
                    string txt = idEls[0].Current.Name;
                    if (!string.IsNullOrEmpty(txt))
                    {
                        string trimmed = txt.Trim();
                        if (trimmed.Length == 8 && Regex.IsMatch(trimmed, @"^\d{8}$"))
                            foundId = trimmed;
                    }
                }
            }
            catch { }

            // Fallback: walk up from lblKjName to find ID in parent container
            if (foundId == null && foundName != null)
            {
                try
                {
                    var nameEls = window.FindAll(TreeScope.Descendants,
                        new PropertyCondition(AutomationElement.AutomationIdProperty, "lblKjName"));
                    if (nameEls != null && nameEls.Count > 0)
                    {
                        AutomationElement parent = TreeWalker.ControlViewWalker.GetParent(nameEls[0]);
                        AutomationElement grandparent = (parent != null)
                            ? TreeWalker.ControlViewWalker.GetParent(parent) : null;
                        AutomationElement container = grandparent ?? parent ?? window;

                        var textEls = container.FindAll(TreeScope.Descendants,
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
                catch { }
            }

            if (foundId != null)
            {
                if (!string.IsNullOrEmpty(foundName))
                {
                    int nl = foundName.IndexOf('\n');
                    if (nl >= 0) foundName = foundName.Substring(0, nl).Trim();
                }
                return new PatientInfo { Id = foundId, Name = foundName ?? "" };
            }
            return null;
        }
        catch
        {
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
