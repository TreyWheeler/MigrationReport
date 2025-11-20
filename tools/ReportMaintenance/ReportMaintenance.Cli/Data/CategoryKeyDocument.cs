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

    [JsonPropertyName("categoryId")]
    public string CategoryId { get; set; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; set; } = string.Empty;

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
