using System.Text.Json.Serialization;

namespace ReportMaintenance.Data;

public sealed class RatingGuideDocument
{
    [JsonPropertyName("ratingGuides")]
    public List<RatingGuide> RatingGuides { get; set; } = new();
}

public sealed class RatingGuide
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = string.Empty;

    [JsonPropertyName("ratingGuide")]
    public List<RatingGuideEntry> Entries { get; set; } = new();
}

public sealed class RatingGuideEntry
{
    [JsonPropertyName("rating")]
    public int Rating { get; set; }

    [JsonPropertyName("guidance")]
    public string Guidance { get; set; } = string.Empty;
}
