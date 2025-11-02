using System.Text;
using System.Linq;
using Microsoft.Extensions.Logging;
using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public sealed class ReportContext
{
    private readonly IReadOnlyDictionary<string, RatingGuide> _ratingGuides;
    private readonly string _familyProfileJson;

    public ReportContext(string reportName, string? iso, string locationLabel, FamilyProfile familyProfile, IReadOnlyDictionary<string, RatingGuide> ratingGuides)
    {
        ReportName = reportName;
        Iso = iso;
        LocationLabel = locationLabel;
        FamilyProfile = familyProfile;
        _ratingGuides = ratingGuides;
        _familyProfileJson = familyProfile.ToIndentedJson();
        SharedPromptContext = BuildSharedPrompt();
    }

    public string ReportName { get; }

    public string? Iso { get; }

    public string LocationLabel { get; }

    public FamilyProfile FamilyProfile { get; }

    public string SharedPromptContext { get; }

    public string? GetRatingGuideForKey(string key)
    {
        if (_ratingGuides.TryGetValue(key, out var guide) && guide.Entries.Count > 0)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"Rating guidance for '{guide.Key}':");
            foreach (var entry in guide.Entries.OrderByDescending(e => e.Rating))
            {
                sb.AppendLine($"- {entry.Rating}: {entry.Guidance}");
            }

            return sb.ToString();
        }

        return null;
    }

    private string BuildSharedPrompt()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Location report: {LocationLabel} (ISO: {Iso ?? "n/a"})");
        sb.AppendLine();
        sb.AppendLine("Family profile (JSON):");
        sb.AppendLine(_familyProfileJson);
        return sb.ToString();
    }
}

public sealed class ReportContextFactory
{
    private readonly IFamilyProfileProvider _familyProfileProvider;
    private readonly IRatingGuideProvider _ratingGuideProvider;
    private readonly ILogger<ReportContextFactory> _logger;

    public ReportContextFactory(IFamilyProfileProvider familyProfileProvider, IRatingGuideProvider ratingGuideProvider, ILogger<ReportContextFactory> logger)
    {
        _familyProfileProvider = familyProfileProvider;
        _ratingGuideProvider = ratingGuideProvider;
        _logger = logger;
    }

    public async Task<ReportContext> CreateAsync(string reportName, ReportDocument document, CancellationToken cancellationToken = default)
    {
        var familyProfile = await _familyProfileProvider.GetProfileAsync(cancellationToken);
        var ratingGuides = await _ratingGuideProvider.GetGuidesAsync(cancellationToken);
        var locationLabel = BuildLocationLabel(reportName);
        _logger.LogInformation("Prepared context for {ReportName} ({Iso}).", locationLabel, document.Iso);
        return new ReportContext(reportName, document.Iso, locationLabel, familyProfile, ratingGuides);
    }

    private static string BuildLocationLabel(string reportName)
    {
        var normalized = reportName.Replace(".json", string.Empty, StringComparison.OrdinalIgnoreCase);
        normalized = normalized.Replace('_', ' ');
        return System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(normalized);
    }
}
