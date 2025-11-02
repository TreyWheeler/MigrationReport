using System.Text.Json.Serialization;

namespace ReportMaintenance.Data;

public sealed class ReportDocument
{
    [JsonPropertyName("version")]
    public int Version { get; set; }

    [JsonPropertyName("iso")]
    public string? Iso { get; set; }

    [JsonPropertyName("values")]
    public List<ReportEntry> Values { get; set; } = new();
}
