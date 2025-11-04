using System.Text.Json.Serialization;

namespace ReportMaintenance.Data;

public sealed class PersonWeightsDocument
{
    [JsonPropertyName("personWeights")]
    public List<PersonWeight> PersonWeights { get; set; } = new();
}

public sealed class PersonWeight
{
    [JsonPropertyName("personId")]
    public string PersonId { get; set; } = string.Empty;

    [JsonPropertyName("categoryId")]
    public string CategoryId { get; set; } = string.Empty;

    [JsonPropertyName("weight")]
    public int Weight { get; set; }
}
