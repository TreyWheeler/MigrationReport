using System.Text.Json.Serialization;

namespace ReportMaintenance.Data;

public sealed class ReportEntry
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = string.Empty;

    [JsonPropertyName("alignmentText")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AlignmentText { get; set; }

    [JsonPropertyName("alignmentValue")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? AlignmentValue { get; set; }

    [JsonPropertyName("sameAsParent")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? SameAsParent { get; set; }
}
