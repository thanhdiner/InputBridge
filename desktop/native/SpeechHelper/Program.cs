using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Windows.Globalization;
using Windows.Media.SpeechRecognition;

internal static class Program
{
    private const byte VkControl = 0x11;
    private const byte VkV = 0x56;
    private const uint KeyUp = 0x0002;
    private const int VkRightControl = 0xA3;
    private const int PushToTalkPollMs = 8;
    private static int _holdThresholdMs = 180;

    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint hWnd);
    [DllImport("user32.dll")] private static extern void keybd_event(byte key, byte scan, uint flags, nuint extra);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int virtualKey);

    public static async Task<int> Main(string[] args)
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;
        try
        {
            if (args.Length > 0 && args[0].Equals("paste", StringComparison.OrdinalIgnoreCase))
            {
                if (args.Length < 2 || !long.TryParse(args[1], out var raw)) throw new ArgumentException("Thiếu cửa sổ đích.");
                SetForegroundWindow(new nint(raw));
                Thread.Sleep(140);
                keybd_event(VkControl, 0, 0, 0);
                keybd_event(VkV, 0, 0, 0);
                keybd_event(VkV, 0, KeyUp, 0);
                keybd_event(VkControl, 0, KeyUp, 0);
                Write(new { ok = true, type = "pasted" });
                return 0;
            }

            if (args.Length > 0 && args[0].Equals("foreground", StringComparison.OrdinalIgnoreCase))
            {
                Write(new { ok = true, type = "foreground", targetWindow = GetForegroundWindow().ToInt64() });
                return 0;
            }

            if (args.Length > 0 && args[0].Equals("hook", StringComparison.OrdinalIgnoreCase))
            {
                return RunPushToTalkHook(args);
            }

            var targetWindow = GetForegroundWindow();
            using var recognizer = CreateRecognizer(args.Length > 0 ? args[0] : "auto");
            recognizer.Constraints.Add(new SpeechRecognitionTopicConstraint(SpeechRecognitionScenario.Dictation, "dictation"));
            var compiled = await recognizer.CompileConstraintsAsync();
            if (compiled.Status != SpeechRecognitionResultStatus.Success)
            {
                throw new InvalidOperationException($"Không khởi tạo được Speech Recognition: {compiled.Status}.");
            }

            var parts = new List<string>();
            recognizer.ContinuousRecognitionSession.ResultGenerated += (_, e) =>
            {
                var result = e.Result;
                var text = result?.Text?.Trim();
                if (!string.IsNullOrWhiteSpace(text) && result?.Status == SpeechRecognitionResultStatus.Success)
                {
                    lock (parts) parts.Add(text);
                    Write(new { ok = true, type = "result", text });
                }
            };
            recognizer.HypothesisGenerated += (_, e) =>
            {
                var text = e.Hypothesis?.Text?.Trim();
                if (!string.IsNullOrWhiteSpace(text)) Write(new { ok = true, type = "partial", text });
            };

            try
            {
                await recognizer.ContinuousRecognitionSession.StartAsync();
            }
            catch (COMException exception) when (IsSpeechPrivacyError(exception.Message))
            {
                throw new InvalidOperationException(
                    "Windows đang tắt Online speech recognition. Bật tại Settings > Privacy & security > Speech rồi thử lại.",
                    exception
                );
            }

            Write(new
            {
                ok = true,
                type = "ready",
                language = recognizer.CurrentLanguage.LanguageTag,
                targetWindow = targetWindow.ToInt64()
            });

            await Console.In.ReadLineAsync();
            await recognizer.ContinuousRecognitionSession.StopAsync();

            string finalText;
            lock (parts) finalText = string.Join(" ", parts).Trim();
            Write(new
            {
                ok = true,
                type = "final",
                text = finalText,
                language = recognizer.CurrentLanguage.LanguageTag,
                targetWindow = targetWindow.ToInt64()
            });
            return 0;
        }
        catch (Exception exception)
        {
            Write(new
            {
                ok = false,
                error = FriendlyError(exception),
                type = exception.GetType().Name,
                hresult = exception.HResult
            });
            return 1;
        }
    }

    private static int RunPushToTalkHook(string[] args)
    {
        if (args.Length > 1 && int.TryParse(args[1], out var threshold))
        {
            _holdThresholdMs = Math.Clamp(threshold, 80, 1000);
        }

        var rightControlWasDown = false;
        var cancelled = false;
        var started = false;
        long pressedAt = 0;
        Write(new { ok = true, type = "hook-ready", key = "RightCtrl", holdMs = _holdThresholdMs, mode = "poll" });

        while (true)
        {
            var rightControlDown = IsKeyDown(VkRightControl);
            if (rightControlDown && !rightControlWasDown)
            {
                rightControlWasDown = true;
                cancelled = IsAnyOtherKeyboardKeyDown();
                started = false;
                pressedAt = Environment.TickCount64;
            }
            else if (rightControlDown && rightControlWasDown)
            {
                if (!started && !cancelled)
                {
                    if (IsAnyOtherKeyboardKeyDown())
                    {
                        cancelled = true;
                    }
                    else if (Environment.TickCount64 - pressedAt >= _holdThresholdMs)
                    {
                        started = true;
                        Write(new { ok = true, type = "ptt-start", key = "RightCtrl", holdMs = _holdThresholdMs });
                    }
                }
            }
            else if (!rightControlDown && rightControlWasDown)
            {
                if (started) Write(new { ok = true, type = "ptt-stop", key = "RightCtrl" });
                rightControlWasDown = false;
                cancelled = false;
                started = false;
                pressedAt = 0;
            }

            Thread.Sleep(PushToTalkPollMs);
        }
    }

    private static bool IsKeyDown(int virtualKey)
    {
        return (GetAsyncKeyState(virtualKey) & 0x8000) != 0;
    }

    private static bool IsAnyOtherKeyboardKeyDown()
    {
        for (var virtualKey = 0x08; virtualKey <= 0xFE; virtualKey++)
        {
            if (virtualKey == VkRightControl || virtualKey is >= 0x01 and <= 0x07) continue;
            if (IsKeyDown(virtualKey)) return true;
        }
        return false;
    }

    private static SpeechRecognizer CreateRecognizer(string requestedLanguage)
    {
        var supported = SpeechRecognizer.SupportedTopicLanguages.ToArray();
        if (supported.Length == 0)
        {
            throw new InvalidOperationException("Windows chưa cài ngôn ngữ Speech Recognition nào.");
        }

        var language = ResolveLanguage(requestedLanguage, supported);
        return new SpeechRecognizer(language);
    }

    private static Language ResolveLanguage(string requestedLanguage, IReadOnlyList<Language> supported)
    {
        if (string.IsNullOrWhiteSpace(requestedLanguage) || requestedLanguage.Equals("auto", StringComparison.OrdinalIgnoreCase))
        {
            var systemLanguage = SpeechRecognizer.SystemSpeechLanguage;
            return FindLanguage(systemLanguage?.LanguageTag, supported)
                ?? FindLanguage(CultureInfo.CurrentUICulture.Name, supported)
                ?? supported[0];
        }

        var resolved = FindLanguage(requestedLanguage, supported);
        if (resolved is not null) return resolved;

        var installed = string.Join(", ", supported.Select(language => language.LanguageTag));
        throw new InvalidOperationException(
            $"Windows chưa cài Speech Recognition cho '{requestedLanguage}'. Ngôn ngữ đang có: {installed}."
        );
    }

    private static Language? FindLanguage(string? requestedLanguage, IReadOnlyList<Language> supported)
    {
        if (string.IsNullOrWhiteSpace(requestedLanguage)) return null;
        var normalized = requestedLanguage.Trim();
        var exact = supported.FirstOrDefault(language =>
            language.LanguageTag.Equals(normalized, StringComparison.OrdinalIgnoreCase));
        if (exact is not null) return exact;

        var prefix = normalized.Split('-', StringSplitOptions.RemoveEmptyEntries)[0];
        return supported.FirstOrDefault(language =>
            language.LanguageTag.Equals(prefix, StringComparison.OrdinalIgnoreCase) ||
            language.LanguageTag.StartsWith(prefix + "-", StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsSpeechPrivacyError(string? message)
    {
        return (message ?? string.Empty).Contains("speech privacy policy", StringComparison.OrdinalIgnoreCase);
    }

    private static string FriendlyError(Exception exception)
    {
        if (IsSpeechPrivacyError(exception.Message) ||
            (exception.InnerException is not null && IsSpeechPrivacyError(exception.InnerException.Message)))
        {
            return "Windows đang tắt Online speech recognition. Bật tại Settings > Privacy & security > Speech rồi thử lại.";
        }

        if (exception is UnauthorizedAccessException || exception.HResult == unchecked((int)0x80070005))
        {
            return "Windows đang chặn quyền micro cho ứng dụng desktop. Bật Microphone access và Let desktop apps access your microphone trong Settings > Privacy & security > Microphone.";
        }

        return exception.Message;
    }

    private static void Write(object payload)
    {
        lock (Console.Out)
        {
            Console.WriteLine(JsonSerializer.Serialize(payload));
            Console.Out.Flush();
        }
    }
}
