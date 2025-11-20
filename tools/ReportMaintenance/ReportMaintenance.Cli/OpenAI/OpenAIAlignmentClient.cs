using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;
using ReportMaintenance.Services;

namespace ReportMaintenance.OpenAI;

public static class OpenAITelemetry
{
    public const string ActivitySourceName = "ReportMaintenance.OpenAI.OpenAIAlignmentClient";

    public static readonly ActivitySource ActivitySource = new(ActivitySourceName);
}

public sealed record AlignmentSuggestion(int? AlignmentValue, string AlignmentText, bool? SameAsParent, string RawResponse);

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

        var keyDefinition = context.GetKeyDefinition(entry.Key);
        var format = ValueRequirementHelper.GetValueFormat(keyDefinition);
        var basePrompt = BuildPrompt(context, entry, keyDefinition, format, validationFeedback: null);
        var informational = keyDefinition?.Informational == true;
        var cacheKey = AlignmentSuggestionCacheKey.Create(basePrompt);

        if (await TryGetCachedSuggestionAsync(cacheKey, entry.Key, cancellationToken).ConfigureAwait(false) is { } cachedSuggestion)
        {
            return cachedSuggestion;
        }

        string? validationFeedback = null;
        for (var attempt = 1; attempt <= Math.Max(1, _options.MaxRetryCount); attempt++)
        {
            var prompt = validationFeedback is null
                ? basePrompt
                : BuildPrompt(context, entry, keyDefinition, format, validationFeedback);

            using var activity = OpenAITelemetry.ActivitySource.StartActivity("GenerateSuggestion", ActivityKind.Client);
            activity?.SetTag("http.method", HttpMethod.Post.Method);
            activity?.SetTag("ai.system", "openai");
            activity?.SetTag("ai.model", _options.Model);
            activity?.SetTag("report.entry_key", entry.Key);

            using var requestMessage = CreateRequestMessage(prompt, out var requestBody);
            var requestUri = requestMessage.RequestUri?.IsAbsoluteUri == true
                ? requestMessage.RequestUri
                : (_httpClient.BaseAddress is not null && requestMessage.RequestUri is not null
                    ? new Uri(_httpClient.BaseAddress, requestMessage.RequestUri)
                    : requestMessage.RequestUri);

            if (requestUri is not null)
            {
                activity?.SetTag("http.url", requestUri.ToString());
            }

            activity?.AddEvent(new ActivityEvent("http.request", tags: new ActivityTagsCollection
            {
                { "http.request.body", requestBody }
            }));

            _logger.LogInformation("OpenAI request for {Key}: {Body}", entry.Key, requestBody);

            using var response = await _httpClient.SendAsync(requestMessage, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            activity?.SetTag("http.status_code", (int)response.StatusCode);
            activity?.AddEvent(new ActivityEvent("http.response", tags: new ActivityTagsCollection
            {
                { "http.response.body", body }
            }));

            _logger.LogInformation("OpenAI response for {Key}: {Body}", entry.Key, body);

            if (response.IsSuccessStatusCode)
            {
                var suggestion = ParseResponse(body, entry.Key, informational);
                var validation = ValueRequirementHelper.Validate(format, suggestion.AlignmentText, context.Iso, keyDefinition);
                if (!validation.IsValid)
                {
                    if (attempt < Math.Max(1, _options.MaxRetryCount))
                    {
                        validationFeedback = validation.ErrorMessage;
                        _logger.LogWarning("Suggestion for {Key} failed validation: {Error}. Retrying with stricter instructions.", entry.Key, validationFeedback);
                        activity?.SetStatus(ActivityStatusCode.Error, validationFeedback);
                        continue;
                    }

                    throw new InvalidOperationException($"OpenAI returned invalid alignment for {entry.Key}: {validation.ErrorMessage}");
                }

                await TrySetCachedSuggestionAsync(cacheKey, suggestion, entry.Key, cancellationToken).ConfigureAwait(false);
                activity?.SetStatus(ActivityStatusCode.Ok);
                return suggestion;
            }

            if (IsRetryable(response.StatusCode) && attempt < _options.MaxRetryCount)
            {
                var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt));
                _logger.LogWarning("OpenAI request for {Key} failed with status {StatusCode}. Retrying in {Delay}.", entry.Key, (int)response.StatusCode, delay);
                activity?.SetStatus(ActivityStatusCode.Error, $"Retrying due to status {(int)response.StatusCode}");
                await Task.Delay(delay, cancellationToken);
                continue;
            }

            activity?.SetStatus(ActivityStatusCode.Error, $"Request failed: {(int)response.StatusCode}");
            throw new HttpRequestException($"OpenAI request failed: {response.StatusCode} {body}");
        }

        throw new HttpRequestException("OpenAI request failed after retries.");
    }

    private HttpRequestMessage CreateRequestMessage(string prompt, out string requestBody)
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

        requestBody = JsonSerializer.Serialize(payload);
        message.Content = new StringContent(requestBody, Encoding.UTF8, "application/json");
        return message;
    }

    private static string BuildPrompt(ReportContext context, ReportEntry entry, CategoryKey? keyDefinition, ValueFormat format, string? validationFeedback)
    {
        var sb = new StringBuilder();
        sb.AppendLine(context.SharedPromptContext);
        sb.AppendLine();
        var keyDescriptor = string.IsNullOrWhiteSpace(keyDefinition?.Label)
            ? $"'{entry.Key}'"
            : $"'{keyDefinition.Label}' ({entry.Key})";
        sb.AppendLine($"Update the key {keyDescriptor}.");

        if (!string.IsNullOrWhiteSpace(keyDefinition?.Guidance))
        {
            sb.AppendLine("Key guidance:");
            sb.AppendLine(keyDefinition.Guidance);
        }

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

        if (!string.IsNullOrWhiteSpace(keyDefinition?.ValueRequirements))
        {
            sb.AppendLine();
            sb.AppendLine($"Value requirements: {keyDefinition.ValueRequirements}");
        }

        sb.AppendLine();
        sb.AppendLine("Instructions:");
        if (keyDefinition?.Informational == true)
        {
            sb.AppendLine("- This key is informational; set alignmentValue to null.");
            sb.AppendLine("- Write a concise, location-specific alignmentText that is actionable/descriptive and avoids meta phrases like 'informational' or 'not scored'.");
            if (!string.IsNullOrWhiteSpace(keyDefinition?.ValueRequirements))
            {
                sb.AppendLine("- Respect the value requirements above when crafting the text.");
            }
            sb.AppendLine("- Include sameAsParent only when the child location inherits content without change.");
            sb.AppendLine("Respond with JSON: {\\\"alignmentValue\\\": null, \\\"alignmentText\\\": string, \\\"sameAsParent\\\": boolean?}.");
        }
        else
        {
            sb.AppendLine("- Choose an alignmentValue from 0-10 that best aligns with the family profile and rating guide.");
            sb.AppendLine("- Provide a concise alignmentText tailored to the family, referencing local details for the report city/country.");
            if (!string.IsNullOrWhiteSpace(keyDefinition?.ValueRequirements))
            {
                sb.AppendLine("- Ensure alignmentText adheres to the value requirements above.");
            }
            sb.AppendLine("- Keep alignmentText under 160 characters (roughly two short sentences).");
            sb.AppendLine("- Include sameAsParent only when the child location inherits content without change.");
            sb.AppendLine("Respond with JSON: {\\\"alignmentValue\\\": number, \\\"alignmentText\\\": string, \\\"sameAsParent\\\": boolean?}.");
        }

        var formatInstruction = ValueRequirementHelper.GetFormatInstruction(format, context.Iso);
        if (!string.IsNullOrWhiteSpace(formatInstruction))
        {
            sb.AppendLine(formatInstruction);
        }

        if (!string.IsNullOrWhiteSpace(validationFeedback))
        {
            sb.AppendLine($"- Previous response failed validation because {validationFeedback}. Provide a corrected response that satisfies this requirement.");
        }

        return sb.ToString();
    }

    private AlignmentSuggestion ParseResponse(string json, string key, bool informational)
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
            int? alignmentValue = null;
            if (root.TryGetProperty("alignmentValue", out var alignmentValueElement))
            {
                if (alignmentValueElement.ValueKind != JsonValueKind.Null)
                {
                    if (alignmentValueElement.ValueKind != JsonValueKind.Number)
                    {
                        throw new InvalidOperationException($"Missing alignmentValue in OpenAI response for {key}.");
                    }

                    alignmentValue = alignmentValueElement.GetInt32();
                }
            }
            else if (!informational)
            {
                throw new InvalidOperationException($"Missing alignmentValue in OpenAI response for {key}.");
            }

            if (!informational && alignmentValue is null)
            {
                throw new InvalidOperationException($"alignmentValue must be present for {key}.");
            }

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
