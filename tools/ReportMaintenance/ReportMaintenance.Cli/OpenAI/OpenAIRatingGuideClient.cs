using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;
using ReportMaintenance.Services;

namespace ReportMaintenance.OpenAI;

public sealed record RatingGuideSuggestion(IReadOnlyList<RatingGuideEntry> Entries, string RawResponse);

public interface IOpenAIRatingGuideClient
{
    Task<RatingGuideSuggestion> GenerateRatingGuideAsync(
        string keyName,
        string categoryName,
        FamilyProfile familyProfile,
        string? keyDescription,
        MetricDefinition metricDefinition,
        CancellationToken cancellationToken = default);
}

public sealed class OpenAIRatingGuideClient : IOpenAIRatingGuideClient
{
    private readonly HttpClient _httpClient;
    private readonly OpenAIOptions _options;
    private readonly ILogger<OpenAIRatingGuideClient> _logger;
    private string? _cachedSystemPromptContentId;

    public OpenAIRatingGuideClient(HttpClient httpClient, IOptions<OpenAIOptions> options, ILogger<OpenAIRatingGuideClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;

        if (!string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            var normalizedBase = _options.BaseUrl!.TrimEnd('/') + "/";
            _httpClient.BaseAddress = new Uri(normalizedBase);
        }

        _httpClient.Timeout = TimeSpan.FromSeconds(Math.Max(1, _options.RequestTimeoutSeconds));
    }

    public async Task<RatingGuideSuggestion> GenerateRatingGuideAsync(
        string keyName,
        string categoryName,
        FamilyProfile familyProfile,
        string? keyDescription,
        MetricDefinition metricDefinition,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException("OpenAI API key is not configured. Set REPORT_MAINTENANCE_OPENAI__APIKEY.");
        }

        if (string.IsNullOrWhiteSpace(keyName))
        {
            throw new ArgumentException("Key name must be provided.", nameof(keyName));
        }

        if (metricDefinition is null)
        {
            throw new ArgumentNullException(nameof(metricDefinition));
        }

        var metric = NormalizeMetric(metricDefinition);
        if (string.IsNullOrWhiteSpace(metric.Name))
        {
            throw new ArgumentException("Metric definition must include a name.", nameof(metricDefinition));
        }

        var prompt = BuildPrompt(keyName.Trim(), categoryName, familyProfile, keyDescription, metric);

        using var activity = OpenAITelemetry.ActivitySource.StartActivity("GenerateRatingGuide", ActivityKind.Client);
        activity?.SetTag("http.method", HttpMethod.Post.Method);
        activity?.SetTag("ai.system", "openai");
        activity?.SetTag("ai.model", _options.Model);
        activity?.SetTag("report.rating_guide_key", keyName.Trim());

        using var requestMessage = CreateRequestMessage(prompt, out var requestBody, out var systemPromptCacheHit);
        var requestUri = requestMessage.RequestUri?.IsAbsoluteUri == true
            ? requestMessage.RequestUri
            : (_httpClient.BaseAddress is not null && requestMessage.RequestUri is not null
                ? new Uri(_httpClient.BaseAddress, requestMessage.RequestUri)
                : requestMessage.RequestUri);

        if (requestUri is not null)
        {
            activity?.SetTag("http.url", requestUri.ToString());
        }

        activity?.SetTag("openai.system_prompt.cache_hit", systemPromptCacheHit);

        activity?.AddEvent(new ActivityEvent("http.request", tags: new ActivityTagsCollection
        {
            { "http.request.body", requestBody },
            { "openai.system_prompt.cache_hit", systemPromptCacheHit }
        }));

        _logger.LogInformation(
            "OpenAI rating-guide request for {Key} (system prompt cache {CacheStatus}): {Body}",
            keyName,
            systemPromptCacheHit ? "hit" : "miss",
            requestBody);

        using var response = await _httpClient.SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        activity?.SetTag("http.status_code", (int)response.StatusCode);
        activity?.AddEvent(new ActivityEvent("http.response", tags: new ActivityTagsCollection
        {
            { "http.response.body", body }
        }));

        _logger.LogInformation("OpenAI rating-guide response for {Key}: {Body}", keyName, body);

        TryCaptureCachedSystemPrompt(body);

        if (!response.IsSuccessStatusCode)
        {
            activity?.SetStatus(ActivityStatusCode.Error, $"Request failed: {(int)response.StatusCode}");
            throw new HttpRequestException($"OpenAI request failed: {response.StatusCode} {body}");
        }

        var suggestion = ParseResponse(body, keyName, metric);
        activity?.SetStatus(ActivityStatusCode.Ok);
        return suggestion;
    }

    private void TryCaptureCachedSystemPrompt(string responseBody)
    {
        if (_cachedSystemPromptContentId is not null)
        {
            return;
        }

        var cachedContentId = TryFindCachedContentId(responseBody);
        if (cachedContentId is null)
        {
            _logger.LogInformation("System prompt cache miss. No cached_content id returned.");
            return;
        }

        _cachedSystemPromptContentId = cachedContentId;
        _logger.LogInformation("Captured system prompt cached_content id {CachedContentId}.", cachedContentId);
    }

    private static string? TryFindCachedContentId(string responseBody)
    {
        try
        {
            using var document = JsonDocument.Parse(responseBody);
            return FindCachedContentId(document.RootElement);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? FindCachedContentId(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            if (element.TryGetProperty("cached_content", out var cachedContent) && cachedContent.ValueKind == JsonValueKind.String)
            {
                return cachedContent.GetString();
            }

            foreach (var property in element.EnumerateObject())
            {
                var nested = FindCachedContentId(property.Value);
                if (nested is not null)
                {
                    return nested;
                }
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                var nested = FindCachedContentId(item);
                if (nested is not null)
                {
                    return nested;
                }
            }
        }

        return null;
    }

    private HttpRequestMessage CreateRequestMessage(string prompt, out string requestBody, out bool systemPromptCacheHit)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, "responses");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _options.ApiKey);

        systemPromptCacheHit = _cachedSystemPromptContentId is not null;

        var systemPromptContent = _cachedSystemPromptContentId is null
            ? new
            {
                type = "input_text",
                text = "You are an expert migration advisor who writes concise rating guides. Respond with valid JSON.",
                cache_control = new { type = "ephemeral" }
            }
            : new
            {
                type = "cached_content",
                id = _cachedSystemPromptContentId
            };

        var payload = new
        {
            model = _options.Model,
            temperature = _options.Temperature,
            text = new { format = new { type = "json_object" } },
            input = new object[]
            {
                new
                {
                    role = "system",
                    content = new object[]
                    {
                        systemPromptContent
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

    private static string BuildPrompt(string keyName, string categoryName, FamilyProfile familyProfile, string? keyDescription, MetricDefinition metricDefinition)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Family profile (JSON):");
        sb.AppendLine(familyProfile.ToIndentedJson());
        sb.AppendLine();
        sb.AppendLine($"Create a migration rating guide for the key '{keyName}' within the category '{categoryName}'.");
        sb.AppendLine("Metric definition (JSON):");
        sb.AppendLine(JsonSerializer.Serialize(metricDefinition, new JsonSerializerOptions { WriteIndented = true }));
        sb.AppendLine();
        sb.AppendLine("Stay focused on this metric only. Every rating must describe thresholds or qualitative statements about the same metric and unit.");

        if (!string.IsNullOrWhiteSpace(keyDescription))
        {
            sb.AppendLine("Key intent:");
            sb.AppendLine(keyDescription.Trim());
        }

        sb.AppendLine();
        sb.AppendLine("Return guidance for ratings 10 through 1 inclusive. Each guidance line should be one or two sentences explaining how that score fits this family's needs.");
        sb.AppendLine("Ensure the guidance helps differentiate thresholds and references family priorities when relevant.");
        sb.AppendLine("Respond with JSON: {\"ratingGuide\":[{\"rating\":number,\"guidance\":string}, ...]}.");

        return sb.ToString();
    }

    private RatingGuideSuggestion ParseResponse(string json, string keyName, MetricDefinition metricDefinition)
    {
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("output", out var output))
        {
            throw new InvalidOperationException("OpenAI response missing output content.");
        }

        var contentText = ExtractResponsesContent(output);
        return ParseRatingGuideContent(contentText, keyName, metricDefinition);
    }

    private static RatingGuideSuggestion ParseRatingGuideContent(string text, string keyName, MetricDefinition metricDefinition)
    {
        using var ratingDocument = JsonDocument.Parse(text);
        var root = ratingDocument.RootElement;
        if (!root.TryGetProperty("ratingGuide", out var ratingArray))
        {
            throw new InvalidOperationException($"Missing ratingGuide array in OpenAI response for {keyName}.");
        }

        var entries = new List<RatingGuideEntry>();
        foreach (var element in ratingArray.EnumerateArray())
        {
            if (!element.TryGetProperty("rating", out var ratingElement) || ratingElement.ValueKind != JsonValueKind.Number)
            {
                throw new InvalidOperationException($"Missing rating in OpenAI rating guide response for {keyName}.");
            }

            var guidance = element.TryGetProperty("guidance", out var guidanceElement) && guidanceElement.ValueKind == JsonValueKind.String
                ? guidanceElement.GetString() ?? string.Empty
                : throw new InvalidOperationException($"Missing guidance text in OpenAI rating guide response for {keyName}.");

            entries.Add(new RatingGuideEntry
            {
                Rating = ratingElement.GetInt32(),
                Guidance = guidance.Trim()
            });
        }

        var ordered = entries
            .OrderByDescending(e => e.Rating)
            .ThenBy(e => e.Guidance, StringComparer.Ordinal)
            .ToList();

        ValidateMetricUsage(ordered, metricDefinition, keyName);
        return new RatingGuideSuggestion(ordered, text);
    }

    private static string ExtractResponsesContent(JsonElement outputElement)
    {
        foreach (var message in outputElement.EnumerateArray())
        {
            if (message.ValueKind == JsonValueKind.Object && message.TryGetProperty("content", out var contentElement))
            {
                foreach (var part in contentElement.EnumerateArray())
                {
                    if (part.ValueKind == JsonValueKind.Object && part.TryGetProperty("text", out var textElement) && textElement.ValueKind == JsonValueKind.String)
                    {
                        var text = textElement.GetString();
                        if (!string.IsNullOrWhiteSpace(text))
                        {
                            return text!;
                        }
                    }
                }
            }
        }

        throw new InvalidOperationException("Unable to extract text content from OpenAI response.");
    }

    private static void ValidateMetricUsage(IReadOnlyList<RatingGuideEntry> entries, MetricDefinition metricDefinition, string keyName)
    {
        var tokens = new List<string>();
        if (!string.IsNullOrWhiteSpace(metricDefinition.Name))
        {
            tokens.Add(metricDefinition.Name.Trim());
        }

        if (!string.IsNullOrWhiteSpace(metricDefinition.Unit))
        {
            tokens.Add(metricDefinition.Unit.Trim());
        }

        if (tokens.Count == 0)
        {
            return;
        }

        foreach (var entry in entries)
        {
            if (string.IsNullOrWhiteSpace(entry.Guidance))
            {
                continue;
            }

            if (!ContainsMetricToken(entry.Guidance, tokens))
            {
                throw new InvalidOperationException($"Rating guide for {keyName} must describe the {metricDefinition.Name} metric or its unit '{metricDefinition.Unit}'.");
            }
        }
    }

    private static bool ContainsMetricToken(string guidance, IReadOnlyList<string> tokens)
    {
        foreach (var token in tokens)
        {
            if (string.IsNullOrWhiteSpace(token))
            {
                continue;
            }

            if (guidance.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }
        }

        return false;
    }

    private static MetricDefinition NormalizeMetric(MetricDefinition metricDefinition)
    {
        return new MetricDefinition
        {
            Name = metricDefinition.Name?.Trim() ?? string.Empty,
            Unit = string.IsNullOrWhiteSpace(metricDefinition.Unit) ? null : metricDefinition.Unit.Trim(),
            Direction = string.IsNullOrWhiteSpace(metricDefinition.Direction) ? null : metricDefinition.Direction.Trim(),
            RangeHint = string.IsNullOrWhiteSpace(metricDefinition.RangeHint) ? null : metricDefinition.RangeHint.Trim()
        };
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
}
