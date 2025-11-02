namespace ReportMaintenance.Configuration;

public sealed class ReportMaintenanceOptions
{
    public string ReportsDirectory { get; set; } = "reports";

    public string RatingGuidesPath { get; set; } = "data/rating_guides.json";

    public string FamilyProfilePath { get; set; } = "family_profile.json";

    public string? ContextCachePath { get; set; }
}
