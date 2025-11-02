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

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("order")]
    public int Order { get; set; }

    [JsonPropertyName("guidance")]
    public string? Guidance { get; set; }
}
