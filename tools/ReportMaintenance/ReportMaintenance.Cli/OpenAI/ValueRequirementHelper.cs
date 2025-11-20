using System.Globalization;
using System.Text.RegularExpressions;
using ReportMaintenance.Data;

namespace ReportMaintenance.OpenAI;

internal enum ValueFormat
{
    None,
    CurrencyWithUsd,
    Percentage,
    Integer,
    Fahrenheit,
    BulletCurrencyList
}

internal static class ValueRequirementHelper
{
    private static readonly Regex PercentageRegex = new(@"^\d{1,3}%$", RegexOptions.Compiled);
    private static readonly Regex IntegerRegex = new(@"^\d+$", RegexOptions.Compiled);
    private static readonly Regex FahrenheitRegex = new(@"\d+\s*°?\s*F", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static ValueFormat GetValueFormat(CategoryKey? key)
    {
        var requirements = key?.ValueRequirements;
        if (string.IsNullOrWhiteSpace(requirements))
        {
            return ValueFormat.None;
        }

        var normalized = requirements.ToLowerInvariant();
        if (normalized.Contains("bullet lines"))
        {
            return ValueFormat.BulletCurrencyList;
        }

        if (normalized.Contains("single numerical value") && normalized.Contains("local currency"))
        {
            return ValueFormat.CurrencyWithUsd;
        }

        if (normalized.Contains("single percentage value"))
        {
            return ValueFormat.Percentage;
        }

        if (normalized.Contains("single integer"))
        {
            return ValueFormat.Integer;
        }

        if (normalized.Contains("fahrenheit"))
        {
            return ValueFormat.Fahrenheit;
        }

        return ValueFormat.None;
    }

    public static string? GetFormatInstruction(ValueFormat format, string? isoCode)
    {
        var currencyCode = GetCurrencyCode(isoCode) ?? "LOCAL";
        return format switch
        {
            ValueFormat.CurrencyWithUsd => $"alignmentText MUST be formatted exactly as \"{currencyCode} 1,234.56 ($1,345.67)\" with the local currency amount rounded to two decimals followed by the USD conversion in parentheses and no additional text.",
            ValueFormat.Percentage => "alignmentText MUST be a single percentage such as \"35%\" with no other words.",
            ValueFormat.Integer => "alignmentText MUST be a single integer (e.g., \"1620\") with no labels or units.",
            ValueFormat.Fahrenheit => "alignmentText must explicitly include Fahrenheit values (e.g., \"35°F–55°F\").",
            ValueFormat.BulletCurrencyList => $"Provide 1-5 bullet lines. Each line MUST start with \"- {currencyCode} <localAmount> ($<usdAmount>)\" using real monetary values rounded to two decimals, then continue with \" – ProgramName – 1-sentence justification\". Use \"- None – ...\" only when no programmes exist.",
            _ => null
        };
    }

    public static (bool IsValid, string? ErrorMessage) Validate(ValueFormat format, string? text, string? isoCode, CategoryKey? keyDefinition)
    {
        var trimmed = text?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(trimmed))
        {
            return (false, "alignmentText was empty");
        }

        return format switch
        {
            ValueFormat.CurrencyWithUsd => ValidateCurrency(trimmed, isoCode, keyDefinition),
            ValueFormat.BulletCurrencyList => ValidateBulletCurrencyList(trimmed, isoCode, keyDefinition),
            ValueFormat.Percentage => PercentageRegex.IsMatch(trimmed)
                ? (true, null)
                : (false, "expected a single percentage like \"35%\""),
            ValueFormat.Integer => IntegerRegex.IsMatch(trimmed)
                ? (true, null)
                : (false, "expected a single integer value"),
            ValueFormat.Fahrenheit => FahrenheitRegex.IsMatch(trimmed)
                ? (true, null)
                : (false, "must include Fahrenheit values such as \"35°F\""),
            _ => (true, null)
        };
    }

    private static (bool IsValid, string? ErrorMessage) ValidateCurrency(string text, string? isoCode, CategoryKey? keyDefinition)
    {
        var currencyCode = GetCurrencyCode(isoCode) ?? "LOCAL";
        if (!TryExtractCurrencyAmount(text, currencyCode, out var amount, out var error))
        {
            return (false, error ?? "invalid currency format");
        }

        if (RequiresPositiveAmount(keyDefinition) && amount <= 0)
        {
            return (false, "value must be greater than zero for this metric");
        }

        return (true, null);
    }

    private static (bool IsValid, string? ErrorMessage) ValidateBulletCurrencyList(string text, string? isoCode, CategoryKey? keyDefinition)
    {
        var lines = text
            .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(l => l.Trim())
            .Where(l => l.Length > 0)
            .ToList();

        if (lines.Count == 0)
        {
            return (false, "expected 1-5 bullet lines");
        }

        if (lines.Count > 5)
        {
            return (false, "expected at most 5 bullet lines");
        }

        var currencyCode = GetCurrencyCode(isoCode) ?? "LOCAL";
        foreach (var line in lines)
        {
            if (!line.StartsWith("-", StringComparison.Ordinal))
            {
                return (false, "each line must start with '-'");
            }

            var remainder = line[1..].Trim();
            if (remainder.StartsWith("None", StringComparison.OrdinalIgnoreCase))
            {
                if (lines.Count > 1)
                {
                    return (false, "the 'None' bullet must be the only line");
                }

                continue;
            }

            var separatorIndex = remainder.IndexOf('–');
            if (separatorIndex < 0)
            {
                separatorIndex = remainder.IndexOf('-');
            }

            var amountSegment = separatorIndex > 0
                ? remainder[..separatorIndex].Trim()
                : remainder;

            var (valid, error) = ValidateCurrency(amountSegment, isoCode, keyDefinition);
            if (!valid)
            {
                return (false, $"bullet format invalid: {error}");
            }
        }

        return (true, null);
    }

    private static bool TryExtractCurrencyAmount(string text, string currencyCode, out double amount, out string? error)
    {
        amount = 0;
        error = null;
        var isUsd = currencyCode.Equals("USD", StringComparison.OrdinalIgnoreCase);
        Regex regex;
        if (isUsd)
        {
            regex = new Regex($@"^{Regex.Escape(currencyCode)}\s\d{{1,3}}(,\d{{3}})*\.\d{{2}}$", RegexOptions.Compiled);
            if (!regex.IsMatch(text))
            {
                error = $"expected format \"{currencyCode} 1,234.56\"";
                return false;
            }

            var numberSegment = text.Substring(currencyCode.Length).Trim();
            return TryParseAmount(numberSegment, out amount);
        }

        regex = new Regex($@"^{Regex.Escape(currencyCode)}\s\d{{1,3}}(,\d{{3}})*\.\d{{2}}\s\(\$\d{{1,3}}(,\d{{3}})*\.\d{{2}}\)$", RegexOptions.Compiled);
        if (!regex.IsMatch(text))
        {
            error = $"expected format \"{currencyCode} 1,234.56 ($1,345.67)\"";
            return false;
        }

        var amountPart = text.Split('(')[0].Trim();
        var numberPart = amountPart.Substring(currencyCode.Length).Trim();
        return TryParseAmount(numberPart, out amount);
    }

    private static bool TryParseAmount(string text, out double value)
    {
        var sanitized = text.Replace(",", string.Empty);
        return double.TryParse(sanitized, NumberStyles.Number, CultureInfo.InvariantCulture, out value);
    }

    private static bool RequiresPositiveAmount(CategoryKey? keyDefinition) =>
        keyDefinition?.Id != null && keyDefinition.Id.Contains("roi_", StringComparison.OrdinalIgnoreCase);

    private static string? GetCurrencyCode(string? isoCode)
    {
        if (string.IsNullOrWhiteSpace(isoCode))
        {
            return null;
        }

        try
        {
            var region = new RegionInfo(isoCode);
            return region.ISOCurrencySymbol;
        }
        catch
        {
            return null;
        }
    }
}
