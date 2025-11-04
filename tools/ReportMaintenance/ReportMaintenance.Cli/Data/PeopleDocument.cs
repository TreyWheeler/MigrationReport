using System.Text.Json.Serialization;

namespace ReportMaintenance.Data;

public sealed class PeopleDocument
{
    [JsonPropertyName("people")]
    public List<Person> People { get; set; } = new();
}

public sealed class Person
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}
