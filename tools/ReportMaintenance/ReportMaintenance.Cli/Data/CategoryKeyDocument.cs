using System.Text.Json.Serialization;

namespace ReportMaintenance.Data;

public sealed class CategoryKeyDocument
{
    [JsonPropertyName("categoryKeys")]
    public List<CategoryKey> CategoryKeys { get; set; } = new();
}

public sealed class CategoryKey
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("metric")]
    public MetricDefinition? Metric { get; set; }

    [JsonPropertyName("categoryId")]
    public string CategoryId { get; set; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; set; } = string.Empty;

    [JsonPropertyName("model")]
    public string? Model { get; set; }

    [JsonPropertyName("order")]
    public int Order { get; set; }

    [JsonPropertyName("guidance")]
    public string? Guidance { get; set; }

    [JsonPropertyName("valueRequirements")]
    public string? ValueRequirements { get; set; }

    [JsonPropertyName("informational")]
    public bool Informational { get; set; }

    [JsonPropertyName("ratingGuide")]
    public List<RatingGuideEntry>? RatingGuide { get; set; }
}

public sealed class MetricDefinition
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("unit")]
    public string? Unit { get; set; }

    /// <summary>
    /// Free-form direction text such as "higher is better" or "lower is better".
    /// </summary>
    [JsonPropertyName("direction")]
    public string? Direction { get; set; }

    /// <summary>
    /// Optional description of valid ranges or how to measure the metric.
    /// </summary>
    [JsonPropertyName("rangeHint")]
    public string? RangeHint { get; set; }
}
