using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;

internal sealed record OcrCandidateSummary(
    string Language,
    double Score,
    double ScriptMatch,
    int Characters
);

internal sealed record OcrDetectionInfo(
    string Mode,
    int CandidatesChecked,
    double Confidence,
    IReadOnlyList<OcrCandidateSummary> Candidates
);

internal sealed record OcrRecognition(
    OcrEngine Engine,
    OcrResult Result,
    string Text,
    OcrDetectionInfo Detection
);

internal static class OcrAutoDetector
{
    private enum ScriptKind
    {
        Other,
        Latin,
        Greek,
        Cyrillic,
        Armenian,
        Hebrew,
        Arabic,
        Devanagari,
        Bengali,
        Gurmukhi,
        Gujarati,
        Oriya,
        Tamil,
        Telugu,
        Kannada,
        Malayalam,
        Sinhala,
        Thai,
        Lao,
        Tibetan,
        Myanmar,
        Georgian,
        Ethiopic,
        Khmer,
        Han,
        Hiragana,
        Katakana,
        Hangul
    }

    private sealed record Candidate(
        OcrEngine Engine,
        OcrResult Result,
        string Text,
        double Score,
        double ScriptMatch,
        double Readability,
        int Characters,
        int Priority
    );

    private static readonly Regex WordPattern = new(@"[\p{L}\p{M}]+", RegexOptions.Compiled);

    private static readonly HashSet<string> LatinLanguages = new(StringComparer.OrdinalIgnoreCase)
    {
        "af", "az", "bs", "ca", "cs", "cy", "da", "de", "en", "es", "et", "eu", "fi", "fil",
        "fr", "ga", "gd", "gl", "hr", "hu", "id", "is", "it", "lt", "lv", "ms", "mt", "nl",
        "no", "pl", "pt", "ro", "sk", "sl", "sq", "sv", "sw", "tr", "uz", "vi", "zu"
    };

    private static readonly Dictionary<string, string[]> CommonWords = new(StringComparer.OrdinalIgnoreCase)
    {
        ["en"] = ["the", "and", "this", "that", "with", "from", "you", "your", "for", "are", "is", "of", "to", "in"],
        ["vi"] = ["và", "của", "là", "có", "không", "cho", "một", "được", "trong", "này", "với", "tôi", "bạn"],
        ["fr"] = ["le", "la", "les", "de", "des", "et", "est", "une", "un", "pour", "avec", "dans", "vous"],
        ["de"] = ["der", "die", "das", "und", "ist", "ein", "eine", "mit", "für", "nicht", "von", "zu"],
        ["es"] = ["el", "la", "los", "las", "de", "del", "y", "es", "una", "un", "para", "con", "que"],
        ["pt"] = ["o", "a", "os", "as", "de", "do", "da", "e", "é", "uma", "um", "para", "com", "que"],
        ["it"] = ["il", "lo", "la", "gli", "le", "di", "e", "è", "una", "un", "per", "con", "che"],
        ["nl"] = ["de", "het", "een", "en", "is", "van", "voor", "met", "niet", "dat", "op"],
        ["pl"] = ["i", "w", "na", "jest", "nie", "dla", "z", "do", "to", "że", "się"],
        ["tr"] = ["ve", "bir", "bu", "için", "ile", "de", "da", "değil", "olan", "var"],
        ["id"] = ["dan", "yang", "ini", "itu", "untuk", "dengan", "dari", "adalah", "tidak", "di"],
        ["ru"] = ["и", "в", "не", "на", "что", "это", "для", "с", "как", "из", "по"],
        ["uk"] = ["і", "в", "не", "на", "що", "це", "для", "з", "як", "із", "по"]
    };

    private static readonly Dictionary<string, string> DistinctiveCharacters = new(StringComparer.OrdinalIgnoreCase)
    {
        ["vi"] = "ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ",
        ["de"] = "äöüß",
        ["fr"] = "àâæçéèêëîïôœùûüÿ",
        ["es"] = "áéíóúüñ¿¡",
        ["pt"] = "áâãàçéêíóôõú",
        ["pl"] = "ąćęłńóśźż",
        ["tr"] = "çğıöşüİ",
        ["ru"] = "ёыэъ",
        ["uk"] = "іїєґ"
    };

    public static async Task<OcrRecognition> RecognizeAsync(SoftwareBitmap bitmap, string? requestedLanguage)
    {
        var requested = requestedLanguage?.Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(requested) &&
            !requested.Equals("auto", StringComparison.OrdinalIgnoreCase))
        {
            var engine = CreateEngine(requested)
                ?? throw new InvalidOperationException($"Windows OCR language pack '{requested}' is not installed.");
            var candidate = await RecognizeCandidateAsync(engine, bitmap, 0);
            return new OcrRecognition(
                candidate.Engine,
                candidate.Result,
                candidate.Text,
                new OcrDetectionInfo(
                    "manual",
                    1,
                    1,
                    [ToSummary(candidate)]
                )
            );
        }

        var engines = CreateAutoEngines();
        if (engines.Count == 0)
        {
            throw new InvalidOperationException(
                "Windows OCR is unavailable. Install at least one OCR language pack in Windows Settings."
            );
        }

        var candidates = new List<Candidate>(engines.Count);
        for (var index = 0; index < engines.Count; index += 1)
        {
            candidates.Add(await RecognizeCandidateAsync(engines[index], bitmap, index));
        }

        var ranked = candidates
            .OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.Priority)
            .ToArray();
        var best = ranked[0];
        var runnerUp = ranked.Length > 1 ? ranked[1] : null;
        var confidence = ranked.Length > 1 ? CalculateConfidence(best, runnerUp) : 0;
        var summaries = ranked.Take(6).Select(ToSummary).ToArray();

        return new OcrRecognition(
            best.Engine,
            best.Result,
            best.Text,
            new OcrDetectionInfo(
                "auto",
                candidates.Count,
                confidence,
                summaries
            )
        );
    }

    private static List<OcrEngine> CreateAutoEngines()
    {
        var languages = OcrEngine.AvailableRecognizerLanguages
            .GroupBy(language => language.LanguageTag, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();
        var profileLanguage = OcrEngine.TryCreateFromUserProfileLanguages()?.RecognizerLanguage.LanguageTag;
        if (!string.IsNullOrWhiteSpace(profileLanguage))
        {
            languages = languages
                .OrderByDescending(language =>
                    language.LanguageTag.Equals(profileLanguage, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        return languages
            .Select(language => OcrEngine.TryCreateFromLanguage(language))
            .Where(engine => engine is not null)
            .Cast<OcrEngine>()
            .ToList();
    }

    private static OcrEngine? CreateEngine(string languageTag)
    {
        try
        {
            return OcrEngine.TryCreateFromLanguage(new Windows.Globalization.Language(languageTag));
        }
        catch
        {
            return null;
        }
    }

    private static async Task<Candidate> RecognizeCandidateAsync(
        OcrEngine engine,
        SoftwareBitmap bitmap,
        int priority)
    {
        var result = await engine.RecognizeAsync(bitmap);
        var text = NormalizeText(result.Text);
        var metrics = ScoreText(text, engine.RecognizerLanguage.LanguageTag, result.Lines.Count);
        var priorityBonus = priority == 0 ? 1.5 : Math.Max(0, 0.5 - priority * 0.05);
        return new Candidate(
            engine,
            result,
            text,
            metrics.Score + priorityBonus,
            metrics.ScriptMatch,
            metrics.Readability,
            metrics.Characters,
            priority
        );
    }

    private static (double Score, double ScriptMatch, double Readability, int Characters) ScoreText(
        string text,
        string languageTag,
        int lineCount)
    {
        var visible = 0;
        var letters = 0;
        var digits = 0;
        var invalid = 0;
        var scripts = new Dictionary<ScriptKind, int>();

        foreach (var rune in text.EnumerateRunes())
        {
            var category = Rune.GetUnicodeCategory(rune);
            if (!Rune.IsWhiteSpace(rune) && !Rune.IsControl(rune)) visible += 1;
            if (category is UnicodeCategory.Control or UnicodeCategory.Format or UnicodeCategory.Surrogate)
            {
                invalid += 1;
                continue;
            }
            if (Rune.IsDigit(rune))
            {
                digits += 1;
                continue;
            }
            if (!Rune.IsLetter(rune)) continue;
            letters += 1;
            var script = GetScript(rune.Value);
            scripts[script] = scripts.GetValueOrDefault(script) + 1;
        }

        var characters = letters + digits;
        if (characters == 0)
        {
            return (-1000 - invalid * 10, 0, 0, 0);
        }

        var expectedScripts = ExpectedScripts(languageTag);
        var matchedLetters = expectedScripts.Count == 0
            ? scripts.Values.DefaultIfEmpty(0).Max()
            : scripts.Where(pair => expectedScripts.Contains(pair.Key)).Sum(pair => pair.Value);
        var scriptMatch = letters > 0 ? (double)matchedLetters / letters : 1;
        var baseLanguage = BaseLanguage(languageTag);

        if (baseLanguage == "ja" &&
            scripts.GetValueOrDefault(ScriptKind.Han) > 0 &&
            scripts.GetValueOrDefault(ScriptKind.Hiragana) + scripts.GetValueOrDefault(ScriptKind.Katakana) == 0)
        {
            scriptMatch *= 0.92;
        }
        if (baseLanguage == "ko" &&
            scripts.GetValueOrDefault(ScriptKind.Han) > 0 &&
            scripts.GetValueOrDefault(ScriptKind.Hangul) == 0)
        {
            scriptMatch *= 0.82;
        }

        var readability = visible > 0 ? Math.Min(1, (double)characters / visible) : 0;
        var lengthQuality = 1 - Math.Exp(-characters / 22d);
        var lineQuality = Math.Min(1, Math.Max(1, lineCount) / 4d);
        var dominantShare = letters > 0
            ? (double)scripts.Values.DefaultIfEmpty(0).Max() / letters
            : 1;
        var languageEvidence = CalculateLanguageEvidence(text, baseLanguage);
        var invalidPenalty = Math.Min(25, invalid * 5);

        var score =
            scriptMatch * 55 +
            readability * 16 +
            lengthQuality * 14 +
            dominantShare * 6 +
            lineQuality * 3 +
            languageEvidence * 10 -
            invalidPenalty;

        return (score, scriptMatch, readability, characters);
    }

    private static double CalculateLanguageEvidence(string text, string baseLanguage)
    {
        var normalized = text.ToLowerInvariant();
        var tokens = WordPattern.Matches(normalized)
            .Select(match => match.Value)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var evidence = 0d;

        if (CommonWords.TryGetValue(baseLanguage, out var words) && words.Length > 0)
        {
            var hits = words.Count(tokens.Contains);
            evidence += Math.Min(0.7, hits / 4d);
        }

        if (DistinctiveCharacters.TryGetValue(baseLanguage, out var distinctive))
        {
            var hits = normalized.EnumerateRunes()
                .Count(rune => distinctive.Contains(rune.ToString(), StringComparison.OrdinalIgnoreCase));
            evidence += Math.Min(0.5, hits / 5d);
        }

        if (baseLanguage == "ja" &&
            normalized.EnumerateRunes().Any(rune =>
                GetScript(rune.Value) is ScriptKind.Hiragana or ScriptKind.Katakana))
        {
            evidence += 0.45;
        }
        if (baseLanguage == "ko" &&
            normalized.EnumerateRunes().Any(rune => GetScript(rune.Value) == ScriptKind.Hangul))
        {
            evidence += 0.45;
        }
        if (baseLanguage == "zh" &&
            normalized.EnumerateRunes().Any(rune => GetScript(rune.Value) == ScriptKind.Han))
        {
            evidence += 0.25;
        }

        return Math.Min(1, evidence);
    }

    private static double CalculateConfidence(Candidate best, Candidate? runnerUp)
    {
        var quality = Math.Clamp(best.ScriptMatch * 0.65 + best.Readability * 0.35, 0, 1);
        if (runnerUp is null) return Math.Round(Math.Clamp(0.4 + quality * 0.4, 0, 1), 3);
        var margin = Math.Max(0, best.Score - runnerUp.Score);
        return Math.Round(Math.Clamp(0.3 + quality * 0.4 + Math.Min(0.28, margin / 45), 0, 0.99), 3);
    }

    private static OcrCandidateSummary ToSummary(Candidate candidate)
    {
        return new OcrCandidateSummary(
            candidate.Engine.RecognizerLanguage.LanguageTag,
            Math.Round(candidate.Score, 3),
            Math.Round(candidate.ScriptMatch, 3),
            candidate.Characters
        );
    }

    private static HashSet<ScriptKind> ExpectedScripts(string languageTag)
    {
        var language = BaseLanguage(languageTag);
        if (LatinLanguages.Contains(language)) return [ScriptKind.Latin];
        return language switch
        {
            "el" => [ScriptKind.Greek],
            "be" or "bg" or "kk" or "ky" or "mk" or "mn" or "ru" or "sr" or "tg" or "tt" or "uk"
                => [ScriptKind.Cyrillic],
            "hy" => [ScriptKind.Armenian],
            "he" or "yi" => [ScriptKind.Hebrew],
            "ar" or "ckb" or "dv" or "fa" or "ps" or "sd" or "ug" or "ur"
                => [ScriptKind.Arabic],
            "hi" or "mr" or "ne" or "sa" or "mai" => [ScriptKind.Devanagari],
            "as" or "bn" => [ScriptKind.Bengali],
            "pa" => [ScriptKind.Gurmukhi],
            "gu" => [ScriptKind.Gujarati],
            "or" => [ScriptKind.Oriya],
            "ta" => [ScriptKind.Tamil],
            "te" => [ScriptKind.Telugu],
            "kn" => [ScriptKind.Kannada],
            "ml" => [ScriptKind.Malayalam],
            "si" => [ScriptKind.Sinhala],
            "th" => [ScriptKind.Thai],
            "lo" => [ScriptKind.Lao],
            "bo" or "dz" => [ScriptKind.Tibetan],
            "my" => [ScriptKind.Myanmar],
            "ka" => [ScriptKind.Georgian],
            "am" or "ti" => [ScriptKind.Ethiopic],
            "km" => [ScriptKind.Khmer],
            "zh" or "yue" => [ScriptKind.Han],
            "ja" => [ScriptKind.Han, ScriptKind.Hiragana, ScriptKind.Katakana],
            "ko" => [ScriptKind.Hangul, ScriptKind.Han],
            _ => []
        };
    }

    private static string BaseLanguage(string languageTag)
    {
        return (languageTag ?? string.Empty)
            .Replace('_', '-')
            .Split('-', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault()?
            .ToLowerInvariant() ?? string.Empty;
    }

    private static ScriptKind GetScript(int value)
    {
        if (In(value, 0x0041, 0x024F) || In(value, 0x1E00, 0x1EFF) || In(value, 0xAB30, 0xAB6F))
            return ScriptKind.Latin;
        if (In(value, 0x0370, 0x03FF) || In(value, 0x1F00, 0x1FFF))
            return ScriptKind.Greek;
        if (In(value, 0x0400, 0x052F) || In(value, 0x2DE0, 0x2DFF) || In(value, 0xA640, 0xA69F))
            return ScriptKind.Cyrillic;
        if (In(value, 0x0530, 0x058F)) return ScriptKind.Armenian;
        if (In(value, 0x0590, 0x05FF) || In(value, 0xFB1D, 0xFB4F)) return ScriptKind.Hebrew;
        if (In(value, 0x0600, 0x06FF) || In(value, 0x0750, 0x077F) || In(value, 0x08A0, 0x08FF) ||
            In(value, 0xFB50, 0xFDFF) || In(value, 0xFE70, 0xFEFF))
            return ScriptKind.Arabic;
        if (In(value, 0x0900, 0x097F)) return ScriptKind.Devanagari;
        if (In(value, 0x0980, 0x09FF)) return ScriptKind.Bengali;
        if (In(value, 0x0A00, 0x0A7F)) return ScriptKind.Gurmukhi;
        if (In(value, 0x0A80, 0x0AFF)) return ScriptKind.Gujarati;
        if (In(value, 0x0B00, 0x0B7F)) return ScriptKind.Oriya;
        if (In(value, 0x0B80, 0x0BFF)) return ScriptKind.Tamil;
        if (In(value, 0x0C00, 0x0C7F)) return ScriptKind.Telugu;
        if (In(value, 0x0C80, 0x0CFF)) return ScriptKind.Kannada;
        if (In(value, 0x0D00, 0x0D7F)) return ScriptKind.Malayalam;
        if (In(value, 0x0D80, 0x0DFF)) return ScriptKind.Sinhala;
        if (In(value, 0x0E00, 0x0E7F)) return ScriptKind.Thai;
        if (In(value, 0x0E80, 0x0EFF)) return ScriptKind.Lao;
        if (In(value, 0x0F00, 0x0FFF)) return ScriptKind.Tibetan;
        if (In(value, 0x1000, 0x109F) || In(value, 0xAA60, 0xAA7F) || In(value, 0xA9E0, 0xA9FF))
            return ScriptKind.Myanmar;
        if (In(value, 0x10A0, 0x10FF) || In(value, 0x2D00, 0x2D2F)) return ScriptKind.Georgian;
        if (In(value, 0x1200, 0x137F)) return ScriptKind.Ethiopic;
        if (In(value, 0x1780, 0x17FF)) return ScriptKind.Khmer;
        if (In(value, 0x3040, 0x309F)) return ScriptKind.Hiragana;
        if (In(value, 0x30A0, 0x30FF) || In(value, 0x31F0, 0x31FF)) return ScriptKind.Katakana;
        if (In(value, 0x1100, 0x11FF) || In(value, 0x3130, 0x318F) || In(value, 0xAC00, 0xD7AF))
            return ScriptKind.Hangul;
        if (In(value, 0x3400, 0x4DBF) || In(value, 0x4E00, 0x9FFF) || In(value, 0xF900, 0xFAFF) ||
            In(value, 0x20000, 0x3134F))
            return ScriptKind.Han;
        return ScriptKind.Other;
    }

    private static bool In(int value, int start, int end) => value >= start && value <= end;

    private static string NormalizeText(string? value)
    {
        return string.Join(
            Environment.NewLine,
            (value ?? string.Empty)
                .Replace("\r\n", "\n")
                .Replace('\r', '\n')
                .Split('\n')
                .Select(line => line.Trim())
                .Where(line => line.Length > 0)
        ).Trim();
    }
}
