using System.Linq;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;
using ReportMaintenance.Services;

namespace ReportMaintenance.OpenAI;

public sealed record AlignmentSuggestion(int AlignmentValue, string AlignmentText, bool? SameAsParent, string RawResponse);

public interface IOpenAIAlignmentClient
{
    Task<AlignmentSuggestion> GenerateSuggestionAsync(ReportContext context, ReportEntry entry, CancellationToken cancellationToken = default);
}

public sealed class OpenAIAlignmentClient : IOpenAIAlignmentClient
{
    private readonly HttpClient _httpClient;
    private readonly OpenAIOptions _options;
    private readonly ILogger<OpenAIAlignmentClient> _logger;
    private readonly IAlignmentSuggestionCache _cache;

    public OpenAIAlignmentClient(HttpClient httpClient, IOptions<OpenAIOptions> options, ILogger<OpenAIAlignmentClient> logger, IAlignmentSuggestionCache cache)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
        _cache = cache ?? NoopAlignmentSuggestionCache.Instance;

        if (!string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            var normalizedBase = _options.BaseUrl!.TrimEnd('/') + "/";
            _httpClient.BaseAddress = new Uri(normalizedBase);
        }
    }

    public async Task<AlignmentSuggestion> GenerateSuggestionAsync(ReportContext context, ReportEntry entry, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException("OpenAI API key is not configured. Set REPORT_MAINTENANCE_OPENAI__APIKEY.");
        }

        var prompt = BuildPrompt(context, entry);
        var cacheKey = AlignmentSuggestionCacheKey.Create(prompt);

        if (await TryGetCachedSuggestionAsync(cacheKey, entry.Key, cancellationToken).ConfigureAwait(false) is { } cachedSuggestion)
        {
            return cachedSuggestion;
        }

        for (var attempt = 1; attempt <= Math.Max(1, _options.MaxRetryCount); attempt++)
        {
            using var requestMessage = CreateRequestMessage(prompt);
            using var response = await _httpClient.SendAsync(requestMessage, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                var suggestion = ParseResponse(body, entry.Key);
                await TrySetCachedSuggestionAsync(cacheKey, suggestion, entry.Key, cancellationToken).ConfigureAwait(false);
                return suggestion;
            }

            if (IsRetryable(response.StatusCode) && attempt < _options.MaxRetryCount)
            {
                var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt));
                _logger.LogWarning("OpenAI request for {Key} failed with status {StatusCode}. Retrying in {Delay}.", entry.Key, (int)response.StatusCode, delay);
                await Task.Delay(delay, cancellationToken);
                continue;
            }

            throw new HttpRequestException($"OpenAI request failed: {response.StatusCode} {body}");
        }

        throw new HttpRequestException("OpenAI request failed after retries.");
    }

    private HttpRequestMessage CreateRequestMessage(string prompt)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, "chat/completions");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _options.ApiKey);

        var payload = new
        {
            model = _options.Model,
            temperature = _options.Temperature,
            response_format = new { type = "json_object" },
            messages = new object[]
            {
                new { role = "system", content = "You are an analyst who updates migration report alignment values. Respond with valid JSON." },
                new { role = "user", content = prompt }
            }
        };

        message.Content = JsonContent.Create(payload);
        return message;
    }

    private static string BuildPrompt(ReportContext context, ReportEntry entry)
    {
        var sb = new StringBuilder();
        sb.AppendLine(context.SharedPromptContext);
        sb.AppendLine();
        sb.AppendLine($"Update the key '{entry.Key}'.");

        if (!string.IsNullOrWhiteSpace(entry.AlignmentText))
        {
            sb.AppendLine("Existing alignment text:");
            sb.AppendLine(entry.AlignmentText);
        }

        if (entry.AlignmentValue is int value)
        {
            sb.AppendLine($"Existing alignment value: {value}");
        }

        if (entry.SameAsParent is not null)
        {
            sb.AppendLine($"Existing sameAsParent flag: {entry.SameAsParent}");
        }

        var ratingGuide = context.GetRatingGuideForKey(entry.Key);
        if (!string.IsNullOrWhiteSpace(ratingGuide))
        {
            sb.AppendLine();
            sb.AppendLine(ratingGuide);
        }

        sb.AppendLine();
        sb.AppendLine("Instructions:");
        sb.AppendLine("- Choose an alignmentValue from 0-10 that best aligns with the family profile and rating guide.");
        sb.AppendLine("- Provide a concise alignmentText tailored to the family, referencing local details for the report city/country.");
        sb.AppendLine("- Include sameAsParent only when the child location inherits content without change.");
        sb.AppendLine("Respond with JSON: {\"alignmentValue\": number, \"alignmentText\": string, \"sameAsParent\": boolean?}.");

        return sb.ToString();
    }

    private AlignmentSuggestion ParseResponse(string json, string key)
    {
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("choices", out var choices))
        {
            throw new InvalidOperationException("OpenAI response missing choices array.");
        }

        var content = choices
            .EnumerateArray()
            .Select(choice => choice.GetProperty("message").GetProperty("content"))
            .FirstOrDefault();

        if (content.ValueKind != JsonValueKind.String)
        {
            throw new InvalidOperationException("OpenAI response content is not a string.");
        }

        var contentText = content.GetString() ?? string.Empty;
        AlignmentSuggestion ParseContent(string text)
        {
            using var suggestionDocument = JsonDocument.Parse(text);
            var root = suggestionDocument.RootElement;
            if (!root.TryGetProperty("alignmentValue", out var alignmentValueElement) || alignmentValueElement.ValueKind != JsonValueKind.Number)
            {
                throw new InvalidOperationException($"Missing alignmentValue in OpenAI response for {key}.");
            }

            var alignmentValue = alignmentValueElement.GetInt32();
            var alignmentText = root.GetProperty("alignmentText").GetString() ?? string.Empty;
            bool? sameAsParent = null;
            if (root.TryGetProperty("sameAsParent", out var sameAsParentElement) && sameAsParentElement.ValueKind != JsonValueKind.Null)
            {
                sameAsParent = sameAsParentElement.ValueKind switch
                {
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    _ => sameAsParent
                };
            }

            return new AlignmentSuggestion(alignmentValue, alignmentText.Trim(), sameAsParent, text);
        }

        try
        {
            return ParseContent(contentText);
        }
        catch (JsonException)
        {
            var extractedJson = ExtractJson(contentText);
            if (extractedJson is null)
            {
                throw;
            }

            return ParseContent(extractedJson);
        }
    }

    private static string? ExtractJson(string text)
    {
        var firstBrace = text.IndexOf('{');
        var lastBrace = text.LastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace)
        {
            return text[firstBrace..(lastBrace + 1)];
        }

        return null;
    }

    private static bool IsRetryable(System.Net.HttpStatusCode statusCode) =>
        statusCode == System.Net.HttpStatusCode.TooManyRequests || (int)statusCode >= 500;

    private async Task<AlignmentSuggestion?> TryGetCachedSuggestionAsync(string cacheKey, string entryKey, CancellationToken cancellationToken)
    {
        if (_cache is NoopAlignmentSuggestionCache)
        {
            return null;
        }

        try
        {
            var suggestion = await _cache.GetAsync(cacheKey, cancellationToken).ConfigureAwait(false);
            if (suggestion is not null)
            {
                _logger.LogInformation("Using cached suggestion for {Key}.", entryKey);
            }

            return suggestion;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read cached suggestion for {Key}. Falling back to OpenAI.", entryKey);
            return null;
        }
    }

    private async Task TrySetCachedSuggestionAsync(string cacheKey, AlignmentSuggestion suggestion, string entryKey, CancellationToken cancellationToken)
    {
        if (_cache is NoopAlignmentSuggestionCache)
        {
            return;
        }

        try
        {
            await _cache.SetAsync(cacheKey, suggestion, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist cached suggestion for {Key}.", entryKey);
        }
    }
}
