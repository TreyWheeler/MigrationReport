using System.Text.Json.Serialization;

namespace ReportMaintenance.Data;

public sealed class ReportEntry
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = string.Empty;

    [JsonPropertyName("alignmentText")]
    public string? AlignmentText { get; set; }

    [JsonPropertyName("alignmentValue")]
    public int? AlignmentValue { get; set; }

    [JsonPropertyName("sameAsParent")]
    public bool? SameAsParent { get; set; }
}
