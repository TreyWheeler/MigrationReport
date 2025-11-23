using System.Collections.Generic;
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

        _httpClient.Timeout = TimeSpan.FromSeconds(Math.Max(1, _options.RequestTimeoutSeconds));
    }

    public async Task<AlignmentSuggestion> GenerateSuggestionAsync(ReportContext context, ReportEntry entry, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException("OpenAI API key is not configured. Set REPORT_MAINTENANCE_OPENAI__APIKEY.");
        }

        var keyDefinition = context.GetKeyDefinition(entry.Key);
        var model = ResolveModel(keyDefinition);
        var format = ValueRequirementHelper.GetValueFormat(keyDefinition);
        var basePrompt = BuildPrompt(context, entry, keyDefinition, format, validationFeedback: null);
        var informational = keyDefinition?.Informational == true;
        var cacheKey = AlignmentSuggestionCacheKey.Create(basePrompt, model);

        if (await TryGetCachedSuggestionAsync(cacheKey, entry.Key, cancellationToken).ConfigureAwait(false) is { } cachedSuggestion)
        {
            return cachedSuggestion;
        }

        string? validationFeedback = null;
        var totalAttempts = Math.Max(1, _options.MaxRetryCount);
        for (var attempt = 1; attempt <= totalAttempts; attempt++)
        {
            var prompt = validationFeedback is null
                ? basePrompt
                : BuildPrompt(context, entry, keyDefinition, format, validationFeedback);

            using var activity = OpenAITelemetry.ActivitySource.StartActivity("GenerateSuggestion", ActivityKind.Client);
            activity?.SetTag("http.method", HttpMethod.Post.Method);
            activity?.SetTag("ai.system", "openai");
            activity?.SetTag("ai.model", model);
            activity?.SetTag("report.entry_key", entry.Key);

            using var requestMessage = CreateRequestMessage(prompt, model, out var requestBody);
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
                { "http.request.length", requestBody?.Length ?? 0 }
            }));

            _logger.LogInformation("OpenAI request for {Key} using {Model} (attempt {Attempt}/{Total}).", entry.Key, model, attempt, totalAttempts);

            try
            {
                using var response = await _httpClient.SendAsync(requestMessage, cancellationToken);
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                activity?.SetTag("http.status_code", (int)response.StatusCode);
                activity?.AddEvent(new ActivityEvent("http.response", tags: new ActivityTagsCollection
                {
                    { "http.response.length", body?.Length ?? 0 }
                }));

                _logger.LogInformation("OpenAI response for {Key} status {StatusCode} (len {Length})", entry.Key, (int)response.StatusCode, body?.Length ?? 0);

                if (response.IsSuccessStatusCode)
                {
                    var suggestion = ParseResponse(body, entry.Key, informational);
                    var validation = ValueRequirementHelper.Validate(format, suggestion.AlignmentText, context.Iso, keyDefinition);
                    if (!validation.IsValid)
                    {
                        if (attempt < totalAttempts)
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

                if (IsRetryable(response.StatusCode) && attempt < totalAttempts)
                {
                    var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt));
                    _logger.LogWarning("OpenAI request for {Key} failed with status {StatusCode}. Retrying in {Delay}.", entry.Key, (int)response.StatusCode, delay);
                    activity?.SetStatus(ActivityStatusCode.Error, $"Retrying due to status {(int)response.StatusCode}");
                    await Task.Delay(delay, cancellationToken);
                    continue;
                }

                activity?.SetStatus(ActivityStatusCode.Error, $"Request failed: {(int)response.StatusCode}");
                throw new HttpRequestException($"OpenAI request failed: {response.StatusCode}");
            }
            catch (TaskCanceledException) when (attempt < totalAttempts && !cancellationToken.IsCancellationRequested)
            {
                var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt));
                _logger.LogWarning("OpenAI request for {Key} timed out. Retrying in {Delay}.", entry.Key, delay);
                await Task.Delay(delay, cancellationToken);
                continue;
            }
            catch (HttpRequestException ex) when (attempt < totalAttempts)
            {
                var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt));
                _logger.LogWarning(ex, "OpenAI request for {Key} failed. Retrying in {Delay}.", entry.Key, delay);
                await Task.Delay(delay, cancellationToken);
                continue;
            }
        }

        throw new HttpRequestException("OpenAI request failed after retries.");
    }

    private string ResolveModel(CategoryKey? keyDefinition)
    {
        if (!string.IsNullOrWhiteSpace(keyDefinition?.Model))
        {
            return keyDefinition.Model!.Trim();
        }

        if (string.IsNullOrWhiteSpace(_options.Model))
        {
            throw new InvalidOperationException("OpenAI model is not configured. Set REPORT_MAINTENANCE_OPENAI__MODEL.");
        }

        return _options.Model.Trim();
    }

    private HttpRequestMessage CreateRequestMessage(string prompt, string model, out string requestBody)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, "responses");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _options.ApiKey);

        var payload = new
        {
            model = model,
            temperature = _options.Temperature,
            text = new { format = new { type = "json_object" } },
            input = new object[]
            {
                new
                {
                    role = "system",
                    content = new object[]
                    {
                        new { type = "input_text", text = "You are an analyst who updates migration report alignment values. Respond with valid JSON." }
                    }
                },
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "input_text", text = prompt }
                    }
                }
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
        if (document.RootElement.TryGetProperty("output", out var output))
        {
            var responsesContent = ExtractResponsesContent(output);
            try
            {
                return ParseSuggestionContent(responsesContent, key, informational);
            }
            catch (JsonException)
            {
                var extracted = ExtractJson(responsesContent);
                if (extracted is null)
                {
                    throw;
                }

                return ParseSuggestionContent(extracted, key, informational);
            }
        }

        throw new InvalidOperationException("OpenAI response missing output content.");
    }

    private static AlignmentSuggestion ParseSuggestionContent(string text, string key, bool informational)
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

    private static string ExtractResponsesContent(JsonElement outputElement)
    {
        string? firstText = null;

        IEnumerable<JsonElement> EnumerateContent(JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in element.EnumerateArray())
                {
                    yield return child;
                }
            }
            else
            {
                yield return element;
            }
        }

        foreach (var item in EnumerateContent(outputElement))
        {
            if (item.ValueKind == JsonValueKind.Object && item.TryGetProperty("content", out var contentElement))
            {
                foreach (var content in EnumerateContent(contentElement))
                {
                    if (content.ValueKind == JsonValueKind.Object)
                    {
                        if (content.TryGetProperty("text", out var textElement) && textElement.ValueKind == JsonValueKind.String)
                        {
                            firstText ??= textElement.GetString();
                        }
                        else if (content.TryGetProperty("output_text", out var altTextElement) && altTextElement.ValueKind == JsonValueKind.String)
                        {
                            firstText ??= altTextElement.GetString();
                        }
                    }
                    else if (content.ValueKind == JsonValueKind.String)
                    {
                        firstText ??= content.GetString();
                    }

                    if (!string.IsNullOrWhiteSpace(firstText))
                    {
                        return firstText!;
                    }
                }
            }
            else if (item.ValueKind == JsonValueKind.String)
            {
                firstText ??= item.GetString();
                if (!string.IsNullOrWhiteSpace(firstText))
                {
                    return firstText!;
                }
            }
        }

        throw new InvalidOperationException("Unable to extract response content from OpenAI responses payload.");
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
