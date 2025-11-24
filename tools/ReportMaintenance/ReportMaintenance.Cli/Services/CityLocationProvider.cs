using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;

namespace ReportMaintenance.Services;

public interface ICityLocationProvider
{
    Task<CityLocation?> GetLocationForReportAsync(string reportName, CancellationToken cancellationToken = default);

    Task<CityLocation?> GetLocationByCityIdAsync(string cityId, CancellationToken cancellationToken = default);
}

public sealed record CityLocation(string Id, double Latitude, double Longitude);

public sealed class CityLocationProvider : ICityLocationProvider
{
    private static readonly JsonSerializerOptions ReadOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly ReportMaintenanceOptions _options;
    private readonly ILogger<CityLocationProvider> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private LocationLookup? _lookup;

    public CityLocationProvider(IOptions<ReportMaintenanceOptions> options, ILogger<CityLocationProvider> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task<CityLocation?> GetLocationForReportAsync(string reportName, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reportName))
        {
            return null;
        }

        var normalized = NormalizeReportName(reportName);
        var lookup = await EnsureLookupAsync(cancellationToken).ConfigureAwait(false);
        return lookup.ByReportName.TryGetValue(normalized, out var location) ? location : null;
    }

    public async Task<CityLocation?> GetLocationByCityIdAsync(string cityId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(cityId))
        {
            return null;
        }

        var normalized = NormalizeKey(cityId);
        var lookup = await EnsureLookupAsync(cancellationToken).ConfigureAwait(false);
        return lookup.ById.TryGetValue(normalized, out var location) ? location : null;
    }

    private async Task<LocationLookup> EnsureLookupAsync(CancellationToken cancellationToken)
    {
        if (_lookup is not null)
        {
            return _lookup;
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_lookup is not null)
            {
                return _lookup;
            }

            var path = ResolvePath(_options.CitiesPath);
            if (!File.Exists(path))
            {
                _logger.LogWarning("Cities file {Path} was not found; coordinates will not be populated.", path);
                _lookup = LocationLookup.Empty;
                return _lookup;
            }

            CityLocationDocument? document;
            await using (var stream = File.OpenRead(path))
            {
                document = await JsonSerializer.DeserializeAsync<CityLocationDocument>(stream, ReadOptions, cancellationToken).ConfigureAwait(false);
            }

            if (document is null || document.Cities.Count == 0)
            {
                _logger.LogWarning("Cities file {Path} contained no entries; coordinates will not be populated.", path);
                _lookup = LocationLookup.Empty;
                return _lookup;
            }

            var byId = new Dictionary<string, CityLocation>(StringComparer.OrdinalIgnoreCase);
            var byReportName = new Dictionary<string, CityLocation>(StringComparer.OrdinalIgnoreCase);

            foreach (var record in document.Cities)
            {
                if (string.IsNullOrWhiteSpace(record.Id))
                {
                    continue;
                }

                var normalizedId = NormalizeKey(record.Id);
                var location = new CityLocation(normalizedId, record.Lat, record.Lng);

                if (!byId.ContainsKey(normalizedId))
                {
                    byId[normalizedId] = location;
                }
                else
                {
                    _logger.LogWarning("Duplicate city location found for {CityId}; using the first occurrence.", normalizedId);
                }

                var reportKey = NormalizeReportName(normalizedId);
                if (!byReportName.ContainsKey(reportKey))
                {
                    byReportName[reportKey] = location;
                }
            }

            _lookup = new LocationLookup(byId, byReportName);
            _logger.LogInformation("Loaded {Count} city locations.", byId.Count);
            return _lookup;
        }
        finally
        {
            _gate.Release();
        }
    }

    private static string NormalizeKey(string value) =>
        value.Trim();

    private static string NormalizeReportName(string value)
    {
        var trimmed = value.Trim();
        if (trimmed.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed[..^5];
        }

        if (trimmed.EndsWith("_report", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed[..^7];
        }

        return trimmed;
    }

    private string ResolvePath(string configuredPath)
    {
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            throw new InvalidOperationException("City locations path configuration is missing.");
        }

        if (Path.IsPathRooted(configuredPath))
        {
            return configuredPath;
        }

        var primary = Path.GetFullPath(configuredPath, Directory.GetCurrentDirectory());
        if (File.Exists(primary))
        {
            return primary;
        }

        var baseDirectory = AppContext.BaseDirectory;
        return string.IsNullOrWhiteSpace(baseDirectory)
            ? primary
            : Path.GetFullPath(configuredPath, baseDirectory);
    }

    private sealed record LocationLookup(
        IReadOnlyDictionary<string, CityLocation> ById,
        IReadOnlyDictionary<string, CityLocation> ByReportName)
    {
        public static LocationLookup Empty { get; } = new(
            new Dictionary<string, CityLocation>(StringComparer.OrdinalIgnoreCase),
            new Dictionary<string, CityLocation>(StringComparer.OrdinalIgnoreCase));
    }

    private sealed class CityLocationDocument
    {
        public List<CityLocationRecord> Cities { get; set; } = new();
    }

    private sealed class CityLocationRecord
    {
        public string? Id { get; set; }

        public double Lat { get; set; }

        public double Lng { get; set; }
    }
}
