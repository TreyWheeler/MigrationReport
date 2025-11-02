using System.Text.Json;
using System.Text.Json.Serialization;

namespace ReportMaintenance.Data;

public sealed class FamilyProfile
{
    [JsonPropertyName("generated_at")]
    public string? GeneratedAt { get; set; }

    [JsonPropertyName("origin")]
    public OriginProfile? Origin { get; set; }

    [JsonPropertyName("household")]
    public HouseholdProfile? Household { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }

    public string ToIndentedJson()
    {
        var options = new JsonSerializerOptions
        {
            WriteIndented = true
        };

        return JsonSerializer.Serialize(this, options);
    }
}

public sealed class OriginProfile
{
    [JsonPropertyName("city")]
    public string? City { get; set; }

    [JsonPropertyName("state")]
    public string? State { get; set; }

    [JsonPropertyName("country")]
    public string? Country { get; set; }

    [JsonPropertyName("timezone")]
    public string? Timezone { get; set; }

    [JsonPropertyName("primary_airport")]
    public string? PrimaryAirport { get; set; }
}

public sealed class HouseholdProfile
{
    [JsonPropertyName("adults")]
    public int Adults { get; set; }

    [JsonPropertyName("children")]
    public int Children { get; set; }

    [JsonPropertyName("members")]
    public List<HouseholdMember> Members { get; set; } = new();
}

public sealed class HouseholdMember
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("age")]
    public int? Age { get; set; }

    [JsonPropertyName("gender")]
    public string? Gender { get; set; }

    [JsonPropertyName("ethnicity")]
    public string? Ethnicity { get; set; }

    [JsonPropertyName("roles")]
    public List<string> Roles { get; set; } = new();

    [JsonPropertyName("occupations")]
    public List<string> Occupations { get; set; } = new();

    [JsonPropertyName("skills")]
    public List<string> Skills { get; set; } = new();

    [JsonPropertyName("interests")]
    public List<string> Interests { get; set; } = new();
}
