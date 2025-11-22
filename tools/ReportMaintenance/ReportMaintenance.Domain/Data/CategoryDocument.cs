using System.Text.Json.Serialization;

namespace ReportMaintenance.Data;

public sealed class CategoryDocument
{
    [JsonPropertyName("categories")]
    public List<Category> Categories { get; set; } = new();
}

public sealed class Category
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("order")]
    public int Order { get; set; }
}
