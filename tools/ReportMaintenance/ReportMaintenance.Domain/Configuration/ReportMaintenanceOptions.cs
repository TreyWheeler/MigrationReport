namespace ReportMaintenance.Configuration;

public sealed class ReportMaintenanceOptions
{
    public string ReportsDirectory { get; set; } = "reports";

    public string RatingGuidesPath { get; set; } = "data/rating_guides.json";

    public string FamilyProfilePath { get; set; } = "family_profile.json";

    public string? ContextCachePath { get; set; }

    public int MaxConcurrentReports { get; set; } = 2;

    public int MaxConcurrentEntries { get; set; } = 4;

    public string CategoryKeysPath { get; set; } = "data/category_keys.json";

    public string CategoriesPath { get; set; } = "data/categories.json";

    public string PersonWeightsPath { get; set; } = "data/person_weights.json";

    public string PeoplePath { get; set; } = "data/people.json";

    public string CountriesPath { get; set; } = "data/countries.json";

    public string CitiesPath { get; set; } = "data/cities.json";

    public string LogsDirectory { get; set; } = "logs";
}
