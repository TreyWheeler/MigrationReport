using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.Extensions.Logging;
using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public sealed class ReportContext
{
    private readonly IReadOnlyDictionary<string, RatingGuide> _ratingGuides;
    private readonly IReadOnlyDictionary<string, CategoryKey> _keyDefinitions;
    private readonly string _familyProfileJson;

    public ReportContext(
        string reportName,
        string? iso,
        string locationLabel,
        FamilyProfile familyProfile,
        IReadOnlyDictionary<string, RatingGuide> ratingGuides,
        IReadOnlyDictionary<string, CategoryKey> keyDefinitions)
    {
        ReportName = reportName;
        Iso = iso;
        LocationLabel = locationLabel;
        FamilyProfile = familyProfile;
        _ratingGuides = ratingGuides;
        _keyDefinitions = keyDefinitions;
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
            return BuildRatingGuideText(key, guide.Entries);
        }

        var definition = GetKeyDefinition(key);
        if (definition is { RatingGuide: { Count: > 0 } ratingGuide })
        {
            return BuildRatingGuideText(key, ratingGuide);
        }

        return null;
    }

    public CategoryKey? GetKeyDefinition(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        return _keyDefinitions.TryGetValue(key, out var definition) ? definition : null;
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

    private string BuildRatingGuideText(string key, IEnumerable<RatingGuideEntry> entries)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Rating guidance for {GetKeyDescriptor(key)}:");
        foreach (var entry in entries.OrderByDescending(e => e.Rating))
        {
            sb.AppendLine($"- {entry.Rating}: {entry.Guidance}");
        }

        return sb.ToString();
    }

    private string GetKeyDescriptor(string key)
    {
        if (_keyDefinitions.TryGetValue(key, out var definition) && !string.IsNullOrWhiteSpace(definition.Label))
        {
            return $"'{definition.Label}' ({key})";
        }

        return $"'{key}'";
    }
}

public sealed class ReportContextFactory
{
    private readonly IFamilyProfileProvider _familyProfileProvider;
    private readonly IRatingGuideProvider _ratingGuideProvider;
    private readonly IKeyDefinitionProvider _keyDefinitionProvider;
    private readonly ILogger<ReportContextFactory> _logger;

    public ReportContextFactory(
        IFamilyProfileProvider familyProfileProvider,
        IRatingGuideProvider ratingGuideProvider,
        IKeyDefinitionProvider keyDefinitionProvider,
        ILogger<ReportContextFactory> logger)
    {
        _familyProfileProvider = familyProfileProvider;
        _ratingGuideProvider = ratingGuideProvider;
        _keyDefinitionProvider = keyDefinitionProvider;
        _logger = logger;
    }

    public async Task<ReportContext> CreateAsync(string reportName, ReportDocument document, CancellationToken cancellationToken = default)
    {
        var familyProfile = await _familyProfileProvider.GetProfileAsync(cancellationToken);
        var ratingGuides = await _ratingGuideProvider.GetGuidesAsync(cancellationToken);
        var keyDefinitions = await _keyDefinitionProvider.GetDefinitionsAsync(cancellationToken);
        var locationLabel = BuildLocationLabel(reportName);
        _logger.LogInformation("Prepared context for {ReportName} ({Iso}).", locationLabel, document.Iso);
        return new ReportContext(reportName, document.Iso, locationLabel, familyProfile, ratingGuides, keyDefinitions);
    }

    private static string BuildLocationLabel(string reportName)
    {
        var normalized = reportName.Replace(".json", string.Empty, StringComparison.OrdinalIgnoreCase);
        normalized = normalized.Replace('_', ' ');
        return System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(normalized);
    }
}
