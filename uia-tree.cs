using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Automation;

class UiaTree
{
    static StringBuilder _sb = new StringBuilder();
    static int _maxDepth = 14;
    static int _elementsWritten = 0;

    static void Main()
    {
        string exeDir = Environment.CurrentDirectory;
        string outputPath = Path.Combine(exeDir, "uia-tree-output.txt");

        _sb.AppendLine("======================================================================");
        _sb.AppendLine("UIA Tree Viewer - focus: element relationships in target window");
        _sb.AppendLine("Timestamp: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
        _sb.AppendLine("Legend:");
        _sb.AppendLine("  [★ID]  Name matches 8-digit patient ID pattern");
        _sb.AppendLine("  [★氏名] Name contains Japanese text (patient name candidate)");
        _sb.AppendLine("  [lbl]  Has AutomationId starting with 'lbl'");
        _sb.AppendLine("======================================================================");
        _sb.AppendLine("");

        try
        {
            AutomationElement root = AutomationElement.RootElement;
            if (root == null) { _sb.AppendLine("ERROR: RootElement is null."); goto END; }

            // Enumerate all top-level windows to find target
            AutomationElementCollection windows = root.FindAll(TreeScope.Children,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window));

            AutomationElement targetWin = null;
            string targetName = "カルテ・オーダー入力";

            for (int i = 0; i < windows.Count; i++)
            {
                string wName = "";
                try { wName = windows[i].Current.Name ?? ""; } catch { }
                if (wName.IndexOf(targetName, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    targetWin = windows[i];
                    break;
                }
            }

            if (targetWin == null)
            {
                _sb.AppendLine("Window '" + targetName + "' not found.");
                _sb.AppendLine("Make sure the EMR window is open and try again.");
                goto END;
            }

            _sb.AppendLine("Target window: \"" + targetWin.Current.Name + "\"");
            _sb.AppendLine("Class: " + targetWin.Current.ClassName);
            _sb.AppendLine("");

            // Dump tree starting from target window
            DumpElement(targetWin, 0, "WINDOW");

            _sb.AppendLine("");
            _sb.AppendLine("Total elements shown: " + _elementsWritten);
        }
        catch (Exception ex)
        {
            _sb.AppendLine("FATAL ERROR: " + ex.ToString());
        }

    END:
        _sb.AppendLine("");
        _sb.AppendLine("======================================================================");
        _sb.AppendLine("Tree dump complete.");
        _sb.AppendLine("======================================================================");

        File.WriteAllText(outputPath, _sb.ToString(), Encoding.UTF8);
        Console.WriteLine("Output: " + outputPath);
        Console.WriteLine("Done. Press Enter to exit...");
        Console.ReadLine();
    }

    static void DumpElement(AutomationElement el, int depth, string label)
    {
        if (depth > _maxDepth) return;
        _elementsWritten++;

        string indent = new string(' ', depth * 2);

        // Essential properties only
        string name = "";
        string controlType = "";
        string autoId = "";
        try { name = el.Current.Name ?? ""; } catch { name = "[ERR]"; }
        try { controlType = el.Current.ControlType.ProgrammaticName; } catch { controlType = "[ERR]"; }
        try { autoId = el.Current.AutomationId ?? ""; } catch { autoId = "[ERR]"; }

        // Short control type
        string ctShort = ShortControlType(controlType);

        // Build line: indent + tree marker + [CT] + AutomationId + Name
        string line = indent + "+ ";

        // Tree connectors
        if (depth > 0) line = indent + "| ";

        line += ctShort;

        if (!string.IsNullOrEmpty(autoId))
            line += " [" + autoId + "]";
        else
            line += " []";

        // Name (truncated)
        string nameDisplay = Truncate(ReplaceNewlines(name), 80);
        if (!string.IsNullOrEmpty(name))
            line += " \"" + nameDisplay + "\"";
        else
            line += " (empty)";

        // Markers
        bool is8DigitId = !string.IsNullOrEmpty(name) && name.Trim().Length == 8 && Regex.IsMatch(name.Trim(), @"^\d{8}$");
        bool isJapaneseName = !string.IsNullOrEmpty(name) && ContainsJapanese(name) && name.Length < 40 && !Regex.IsMatch(name.Trim(), @"^\d+$");

        if (is8DigitId)
            line += "  <<< ★★★ ID (8桁) ★★★";

        if (isJapaneseName)
            line += "  <<< 氏名候補";

        if (autoId.StartsWith("lbl") || autoId.StartsWith("LBL"))
        {
            if (autoId == "lblKjName") line += " <<< ★氏名(lblKjName)";
            else if (autoId == "lblBirth") line += " <<< ★生年月日(lblBirth)";
            else if (autoId == "lblBodyInfo") line += " <<< ★身体情報(lblBodyInfo)";
            else line += " <<< lbl";
        }

        _sb.AppendLine(line);

        // Enumerate children using ControlViewWalker for accurate tree structure
        if (depth < _maxDepth)
        {
            try
            {
                var walker = TreeWalker.ControlViewWalker;
                AutomationElement child = walker.GetFirstChild(el);
                int childIndex = 0;
                while (child != null && _elementsWritten < 5000)
                {
                    DumpElement(child, depth + 1, "Child[" + childIndex + "]");
                    child = walker.GetNextSibling(child);
                    childIndex++;
                }
            }
            catch
            {
                // Skip children if error (element no longer available)
            }
        }
    }

    static string ShortControlType(string progName)
    {
        if (progName == null) return "?";
        switch (progName)
        {
            case "Text": return "Text";
            case "Edit": return "Edit";
            case "Button": return "Btn";
            case "Pane": return "Pane";
            case "Window": return "Win";
            case "Document": return "Doc";
            case "ComboBox": return "Combo";
            case "List": return "List";
            case "ListItem": return "Item";
            case "Tab": return "Tab";
            case "TabItem": return "TabI";
            case "Tree": return "Tree";
            case "TreeItem": return "TrI";
            case "Menu": return "Menu";
            case "MenuItem": return "MItem";
            case "StatusBar": return "Stat";
            case "ToolBar": return "Tool";
            case "ProgressBar": return "Prog";
            case "RadioButton": return "Radio";
            case "CheckBox": return "Chk";
            case "Group": return "Grp";
            case "Header": return "Hdr";
            case "HeaderItem": return "HdrI";
            case "DataGrid": return "Grid";
            case "DataItem": return "GItem";
            case "ScrollBar": return "Scrl";
            case "Thumb": return "Thumb";
            case "TitleBar": return "TBar";
            case "Image": return "Img";
            case "Hyperlink": return "Link";
            case "Separator": return "Sep";
            default: return progName;
        }
    }

    static bool ContainsJapanese(string s)
    {
        if (string.IsNullOrEmpty(s)) return false;
        foreach (char c in s)
        {
            if ((c >= 0x4E00 && c <= 0x9FFF) ||
                (c >= 0x3040 && c <= 0x309F) ||
                (c >= 0x30A0 && c <= 0x30FF))
                return true;
        }
        return false;
    }

    static string Truncate(string s, int maxLen)
    {
        if (s == null) return "";
        if (s.Length <= maxLen) return s;
        return s.Substring(0, maxLen) + "...";
    }

    static string ReplaceNewlines(string s)
    {
        if (string.IsNullOrEmpty(s)) return s;
        return s.Replace("\r\n", " ").Replace("\n", " ").Replace("\r", " ");
    }
}
