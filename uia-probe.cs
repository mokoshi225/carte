using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Automation;

class UiaProbe
{
    static StringBuilder _sb = new StringBuilder();
    static int _maxDepth = 8;
    static int _maxElements = 2000;

    static void Main()
    {
        string exeDir = Environment.CurrentDirectory;
        string outputPath = Path.Combine(exeDir, "uia-probe-output.txt");

        LogLine("============================================================");
        LogLine("UIA Probe - dump all window properties");
        LogLine("Timestamp: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
        LogLine("============================================================");
        LogLine("");

        try
        {
            AutomationElement root = AutomationElement.RootElement;
            if (root == null)
            {
                LogLine("ERROR: RootElement is null.");
                goto END;
            }

            // Dump desktop root
            DumpElement(root, 0, "Desktop");

            // Enumerate top-level windows
            AutomationElementCollection windows;
            try
            {
                windows = root.FindAll(TreeScope.Children,
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window));
            }
            catch (Exception ex)
            {
                LogLine("ERROR enumerating windows: " + ex.Message);
                goto END;
            }

            LogLine("");
            LogLine("============================================================");
            LogLine("Top-level window count: " + windows.Count);
            LogLine("============================================================");

            for (int i = 0; i < windows.Count; i++)
            {
                LogLine("");
                LogLine("------------------------------------------------------------");
                LogLine("WINDOW #" + (i + 1));
                LogLine("------------------------------------------------------------");
                DumpElement(windows[i], 1, "Window");
            }
        }
        catch (Exception ex)
        {
            LogLine("FATAL ERROR: " + ex.ToString());
        }

    END:
        LogLine("");
        LogLine("============================================================");
        LogLine("Probe complete.");
        LogLine("============================================================");

        File.WriteAllText(outputPath, _sb.ToString(), Encoding.UTF8);
        Console.WriteLine("Output: " + outputPath);
        Console.WriteLine("Done. Press Enter to exit...");
        Console.ReadLine();
    }

    // Recursively dump element and children (depth-limited)
    static int _elementCount = 0;

    static void DumpElement(AutomationElement el, int depth, string label)
    {
        _elementCount++;
        if (_elementCount > _maxElements)
        {
            if (depth == 1)
                LogLine("[LIMIT] Element count exceeds " + _maxElements + ".");
            return;
        }
        if (depth > _maxDepth) return;

        string indent = new string(' ', depth * 2);

        // Basic properties
        string name = SafeGet(() => el.Current.Name);
        string className = SafeGet(() => el.Current.ClassName);
        string controlType = SafeGet(() => el.Current.ControlType.ProgrammaticName);
        string autoId = SafeGet(() => el.Current.AutomationId);
        string boundingRect = "?";
        try { var r = el.Current.BoundingRectangle; boundingRect = string.Format("({0:F0},{1:F0})-({2:F0},{3:F0}) W={4:F0} H={5:F0}", r.Left, r.Top, r.Right, r.Bottom, r.Width, r.Height); } catch { }
        string isEnabled = SafeGet(() => el.Current.IsEnabled.ToString());
        string isOffscreen = SafeGet(() => el.Current.IsOffscreen.ToString());
        string processId = SafeGet(() => el.Current.ProcessId.ToString());
        string helpText = SafeGet(() => el.Current.HelpText);
        string itemStatus = SafeGet(() => el.Current.ItemStatus);
        string itemType = SafeGet(() => el.Current.ItemType);
        string frameworkId = SafeGet(() => el.Current.FrameworkId);
        string nativeWindowHandle = SafeGet(() => el.Current.NativeWindowHandle.ToString());
        string acceleratorKey = SafeGet(() => el.Current.AcceleratorKey);
        string accessKey = SafeGet(() => el.Current.AccessKey);
        string isPassword = SafeGet(() => el.Current.IsPassword.ToString());
        string isContentElement = SafeGet(() => el.Current.IsContentElement.ToString());
        string isControlElement = SafeGet(() => el.Current.IsControlElement.ToString());
        string hasKeyboardFocus = SafeGet(() => el.Current.HasKeyboardFocus.ToString());
        string isKeyboardFocusable = SafeGet(() => el.Current.IsKeyboardFocusable.ToString());
        string labelBy = "?";
        try { var lb = el.Current.LabeledBy; labelBy = lb != null ? lb.Current.Name : "(null)"; } catch { }

        // Output
        LogLine(indent + "+ " + label + " | ControlType=" + controlType);
        LogLine(indent + "  Name          : " + Truncate(name, 120));
        LogLine(indent + "  ClassName     : " + className);
        LogLine(indent + "  AutomationId  : " + autoId);
        LogLine(indent + "  BoundingRect  : " + boundingRect);
        LogLine(indent + "  IsEnabled     : " + isEnabled);
        LogLine(indent + "  IsOffscreen   : " + isOffscreen);
        LogLine(indent + "  ProcessId     : " + processId);
        LogLine(indent + "  FrameworkId   : " + frameworkId);
        LogLine(indent + "  HelpText      : " + Truncate(helpText, 100));
        LogLine(indent + "  ItemStatus    : " + itemStatus);
        LogLine(indent + "  ItemType      : " + itemType);
        LogLine(indent + "  NativeWindowHandle: " + nativeWindowHandle);
        LogLine(indent + "  AcceleratorKey: " + acceleratorKey);
        LogLine(indent + "  AccessKey     : " + accessKey);
        LogLine(indent + "  IsPassword    : " + isPassword);
        LogLine(indent + "  IsContent     : " + isContentElement);
        LogLine(indent + "  IsControl     : " + isControlElement);
        LogLine(indent + "  HasKeyboardFocus: " + hasKeyboardFocus);
        LogLine(indent + "  IsKeyboardFocusable: " + isKeyboardFocusable);
        LogLine(indent + "  LabeledBy     : " + labelBy);

        // ValuePattern (text content)
        try
        {
            object valuePattern;
            if (el.TryGetCurrentPattern(ValuePattern.Pattern, out valuePattern))
            {
                ValuePattern vp = (ValuePattern)valuePattern;
                string val = vp.Current.Value;
                if (!string.IsNullOrEmpty(val))
                    LogLine(indent + "  [ValuePattern] : " + Truncate(val, 200));
            }
        }
        catch { }

        // TextPattern
        try
        {
            object textPattern;
            if (el.TryGetCurrentPattern(TextPattern.Pattern, out textPattern))
            {
                TextPattern tp = (TextPattern)textPattern;
                string text = tp.DocumentRange.GetText(-1);
                if (!string.IsNullOrEmpty(text))
                    LogLine(indent + "  [TextPattern] : " + Truncate(text, 200));
            }
        }
        catch { }

        // MARK if Name contains 8-digit patient ID
        if (!string.IsNullOrEmpty(name) && Regex.IsMatch(name, @"\[?\d{8}\]?"))
        {
            LogLine(indent + "  [MARK] Contains 8-digit ID");
            Match m = Regex.Match(name, @"(\d{8})");
            if (m.Success)
                LogLine(indent + "    Extracted ID: " + m.Groups[1].Value);
        }

        // MARK if Name contains Japanese text (kanji/kana)
        if (!string.IsNullOrEmpty(name) && ContainsJapanese(name) && name.Length < 50)
        {
            LogLine(indent + "  [MARK] Contains Japanese name text");
        }

        LogLine("");

        // Enumerate children (limited to avoid hang)
        if (depth < _maxDepth && _elementCount < _maxElements)
        {
            try
            {
                AutomationElementCollection children = el.FindAll(TreeScope.Children,
                    new PropertyCondition(AutomationElement.IsControlElementProperty, true));

                if (children.Count > 0)
                {
                    int maxChildren = 150;
                    if (children.Count > maxChildren)
                    {
                        LogLine(indent + "  [Children: " + children.Count + " total, showing first " + maxChildren + "]");
                    }

                    int shown = Math.Min(children.Count, maxChildren);
                    for (int i = 0; i < shown; i++)
                    {
                        string childLabel = "Child[" + i + "]";
                        DumpElement(children[i], depth + 1, childLabel);
                    }
                }
            }
            catch (Exception ex)
            {
                LogLine(indent + "  [Error enumerating children] " + ex.Message);
            }
        }
    }

    static string SafeGet(Func<string> getter)
    {
        try { return getter() ?? "(null)"; }
        catch (Exception ex) { return "[ERROR: " + ex.Message + "]"; }
    }

    // Check if string contains Japanese characters (kanji/hiragana/katakana)
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
        if (s == null) return "(null)";
        if (s.Length <= maxLen) return s;
        return s.Substring(0, maxLen) + "...(" + s.Length + " chars)";
    }

    static void LogLine(string line)
    {
        _sb.AppendLine(line);
        Console.WriteLine(line);
    }
}
