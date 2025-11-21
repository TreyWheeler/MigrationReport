using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public sealed class ReportCreationService
{
    private const int CurrentReportVersion = 2;

    private readonly IReportRepository _reportRepository;
    private readonly IRatingGuideProvider _ratingGuideProvider;
    private readonly IKeyDefinitionProvider _keyDefinitionProvider;
    private readonly ILocationMetadataService _locationMetadataService;
    private readonly ILogger<ReportCreationService> _logger;
    private readonly ReportMaintenanceOptions _options;

    public ReportCreationService(
        IReportRepository reportRepository,
        IRatingGuideProvider ratingGuideProvider,
        IKeyDefinitionProvider keyDefinitionProvider,
        ILocationMetadataService locationMetadataService,
        IOptions<ReportMaintenanceOptions> options,
        ILogger<ReportCreationService> logger)
    {
        _reportRepository = reportRepository;
        _ratingGuideProvider = ratingGuideProvider;
        _keyDefinitionProvider = keyDefinitionProvider;
        _locationMetadataService = locationMetadataService;
        _logger = logger;
        _options = options.Value;
    }

    public async Task<string> CreateCountryReportAsync(string countryName, string iso, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(countryName))
        {
            throw new ArgumentException("A country name must be provided.", nameof(countryName));
        }

        if (string.IsNullOrWhiteSpace(iso))
        {
            throw new ArgumentException("An ISO code must be provided.", nameof(iso));
        }

        var slug = CreateSlug(countryName);
        var reportName = $"{slug}_report";

        if (await _reportRepository.ExistsAsync(reportName, cancellationToken).ConfigureAwait(false))
        {
            throw new InvalidOperationException($"Report '{reportName}' already exists in '{_options.ReportsDirectory}'.");
        }

        var normalizedIso = NormalizeIso(iso);
        var document = await CreateDocumentAsync(normalizedIso, cancellationToken).ConfigureAwait(false);
        await _reportRepository.SaveAsync(reportName, document, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Created country report {ReportName} ({Iso}).", reportName, normalizedIso);
        await _locationMetadataService.EnsureCountryEntryAsync(slug, countryName.Trim(), BuildReportPath(reportName), cancellationToken).ConfigureAwait(false);
        return reportName;
    }

    public async Task<CityReportCreationResult> CreateCityReportAsync(string countryName, string cityName, string? iso, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(countryName))
        {
            throw new ArgumentException("A country name must be provided.", nameof(countryName));
        }

        if (string.IsNullOrWhiteSpace(cityName))
        {
            throw new ArgumentException("A city name must be provided.", nameof(cityName));
        }

        var countrySlug = CreateSlug(countryName);
        var citySlug = CreateSlug(cityName);
        var countryReportName = $"{countrySlug}_report";
        var cityReportName = $"{countrySlug}_{citySlug}_report";

        if (await _reportRepository.ExistsAsync(cityReportName, cancellationToken).ConfigureAwait(false))
        {
            throw new InvalidOperationException($"Report '{cityReportName}' already exists in '{_options.ReportsDirectory}'.");
        }

        var countryExists = await _reportRepository.ExistsAsync(countryReportName, cancellationToken).ConfigureAwait(false);
        string? resolvedIso = iso;
        string? createdCountryReportName = null;

        if (!countryExists)
        {
            if (string.IsNullOrWhiteSpace(resolvedIso))
            {
                throw new InvalidOperationException($"Country report '{countryReportName}' does not exist. Provide an ISO code so it can be created automatically.");
            }

            await CreateCountryReportAsync(countryName, resolvedIso!, cancellationToken).ConfigureAwait(false);
            createdCountryReportName = countryReportName;
            resolvedIso = NormalizeIso(resolvedIso!);
        }
        else if (string.IsNullOrWhiteSpace(resolvedIso))
        {
            var countryDocument = await _reportRepository.LoadAsync(countryReportName, cancellationToken).ConfigureAwait(false);
            resolvedIso = countryDocument.Iso;
        }

        if (string.IsNullOrWhiteSpace(resolvedIso))
        {
            throw new InvalidOperationException("An ISO code must be provided when the country report does not specify one.");
        }

        var normalizedIso = NormalizeIso(resolvedIso);
        var document = await CreateDocumentAsync(normalizedIso, cancellationToken).ConfigureAwait(false);
        await _reportRepository.SaveAsync(cityReportName, document, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Created city report {ReportName} ({Iso}).", cityReportName, normalizedIso);
        var cityId = $"{countrySlug}_{citySlug}";
        await _locationMetadataService.EnsureCityEntryAsync(cityId, countrySlug, cityName.Trim(), BuildReportPath(cityReportName), cancellationToken).ConfigureAwait(false);
        return new CityReportCreationResult(cityReportName, createdCountryReportName);
    }

    private async Task<ReportDocument> CreateDocumentAsync(string iso, CancellationToken cancellationToken)
    {
        var ratingGuides = await _ratingGuideProvider.GetGuidesAsync(cancellationToken).ConfigureAwait(false);
        var keyDefinitions = await _keyDefinitionProvider.GetDefinitionsAsync(cancellationToken).ConfigureAwait(false);

        var entries = ratingGuides.Keys
            .Concat(keyDefinitions.Keys)
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Select(key => key!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(key => key, StringComparer.OrdinalIgnoreCase)
            .Select(key => new ReportEntry { Key = key })
            .ToList();

        return new ReportDocument
        {
            Version = CurrentReportVersion,
            Iso = iso,
            Values = entries
        };
    }

    private static string NormalizeIso(string iso)
    {
        var normalized = iso.Trim().ToUpperInvariant();
        if (normalized.Length == 0)
        {
            throw new ArgumentException("ISO code cannot be empty after trimming.", nameof(iso));
        }

        return normalized;
    }

    private string BuildReportPath(string reportName)
    {
        var fileName = reportName.EndsWith(".json", StringComparison.OrdinalIgnoreCase)
            ? reportName
            : $"{reportName}.json";

        var directory = string.IsNullOrWhiteSpace(_options.ReportsDirectory)
            ? string.Empty
            : _options.ReportsDirectory.Trim().TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        var combined = string.IsNullOrEmpty(directory)
            ? fileName
            : Path.Combine(directory, fileName);

        return combined.Replace('\\', '/');
    }

    private static string CreateSlug(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("Value cannot be null or whitespace.", nameof(value));
        }

        var trimmed = value.Trim();
        var builder = new StringBuilder(trimmed.Length);
        var lastWasSeparator = false;

        foreach (var ch in trimmed)
        {
            if (char.IsLetterOrDigit(ch))
            {
                builder.Append(char.ToLowerInvariant(ch));
                lastWasSeparator = false;
            }
            else if (!lastWasSeparator)
            {
                builder.Append('_');
                lastWasSeparator = true;
            }
        }

        var slug = builder.ToString().Trim('_');
        if (slug.Length == 0)
        {
            throw new InvalidOperationException($"Unable to create a slug from '{value}'.");
        }

        return slug;
    }
}

public sealed record CityReportCreationResult(string CityReportName, string? CreatedCountryReportName);
