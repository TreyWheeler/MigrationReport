using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;

namespace ReportMaintenance.Services;

public interface ILocationMetadataService
{
    Task EnsureCountryEntryAsync(string countryId, string countryName, string reportPath, CancellationToken cancellationToken = default);

    Task EnsureCityEntryAsync(string cityId, string countryId, string cityName, string reportPath, CancellationToken cancellationToken = default);
}

public sealed class LocationMetadataService : ILocationMetadataService
{
    private static readonly JsonSerializerOptions ReadOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private static readonly JsonSerializerOptions WriteOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly SemaphoreSlim _countryLock = new(1, 1);
    private readonly SemaphoreSlim _cityLock = new(1, 1);
    private readonly ReportMaintenanceOptions _options;
    private readonly ILogger<LocationMetadataService> _logger;

    public LocationMetadataService(IOptions<ReportMaintenanceOptions> options, ILogger<LocationMetadataService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task EnsureCountryEntryAsync(string countryId, string countryName, string reportPath, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(countryId))
        {
            throw new ArgumentException("Country identifier must be provided.", nameof(countryId));
        }

        if (string.IsNullOrWhiteSpace(countryName))
        {
            throw new ArgumentException("Country name must be provided.", nameof(countryName));
        }

        if (string.IsNullOrWhiteSpace(reportPath))
        {
            throw new ArgumentException("Report path must be provided.", nameof(reportPath));
        }

        var resolvedPath = ResolvePath(_options.CountriesPath);
        var normalizedId = NormalizeKey(countryId);
        var normalizedReport = NormalizeReportPath(reportPath);

        await _countryLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var document = await LoadDocumentAsync<CountryDocument>(resolvedPath, () => new CountryDocument(), cancellationToken).ConfigureAwait(false);
            var entry = document.Countries.FirstOrDefault(c => string.Equals(c.Id, normalizedId, StringComparison.OrdinalIgnoreCase));
            var updated = false;

            if (entry is null)
            {
                entry = new CountryRecord
                {
                    Id = normalizedId,
                    Name = countryName.Trim(),
                    Report = normalizedReport
                };
                document.Countries.Add(entry);
                updated = true;
                _logger.LogInformation("Added country metadata for {Country}.", countryName);
            }
            else
            {
                if (!string.Equals(entry.Name, countryName.Trim(), StringComparison.Ordinal))
                {
                    entry.Name = countryName.Trim();
                    updated = true;
                }

                if (!string.Equals(entry.Report, normalizedReport, StringComparison.Ordinal))
                {
                    entry.Report = normalizedReport;
                    updated = true;
                }
            }

            if (updated)
            {
                await PersistDocumentAsync(resolvedPath, document, cancellationToken).ConfigureAwait(false);
            }
        }
        finally
        {
            _countryLock.Release();
        }
    }

    public async Task EnsureCityEntryAsync(string cityId, string countryId, string cityName, string reportPath, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(cityId))
        {
            throw new ArgumentException("City identifier must be provided.", nameof(cityId));
        }

        if (string.IsNullOrWhiteSpace(countryId))
        {
            throw new ArgumentException("Country identifier must be provided.", nameof(countryId));
        }

        if (string.IsNullOrWhiteSpace(cityName))
        {
            throw new ArgumentException("City name must be provided.", nameof(cityName));
        }

        if (string.IsNullOrWhiteSpace(reportPath))
        {
            throw new ArgumentException("Report path must be provided.", nameof(reportPath));
        }

        var resolvedPath = ResolvePath(_options.CitiesPath);
        var normalizedCityId = NormalizeKey(cityId);
        var normalizedCountryId = NormalizeKey(countryId);
        var normalizedReport = NormalizeReportPath(reportPath);

        await _cityLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var document = await LoadDocumentAsync<CityDocument>(resolvedPath, () => new CityDocument(), cancellationToken).ConfigureAwait(false);
            var entry = document.Cities.FirstOrDefault(c => string.Equals(c.Id, normalizedCityId, StringComparison.OrdinalIgnoreCase));
            var updated = false;

            if (entry is null)
            {
                entry = new CityRecord
                {
                    Id = normalizedCityId,
                    CountryId = normalizedCountryId,
                    Name = cityName.Trim(),
                    Report = normalizedReport
                };
                document.Cities.Add(entry);
                updated = true;
                _logger.LogInformation("Added city metadata for {City}.", cityName);
            }
            else
            {
                if (!string.Equals(entry.Name, cityName.Trim(), StringComparison.Ordinal))
                {
                    entry.Name = cityName.Trim();
                    updated = true;
                }

                if (!string.Equals(entry.CountryId, normalizedCountryId, StringComparison.Ordinal))
                {
                    entry.CountryId = normalizedCountryId;
                    updated = true;
                }

                if (!string.Equals(entry.Report, normalizedReport, StringComparison.Ordinal))
                {
                    entry.Report = normalizedReport;
                    updated = true;
                }
            }

            if (updated)
            {
                await PersistDocumentAsync(resolvedPath, document, cancellationToken).ConfigureAwait(false);
            }
        }
        finally
        {
            _cityLock.Release();
        }
    }

    private static string NormalizeKey(string value) =>
        value.Trim();

    private static string NormalizeReportPath(string value) =>
        value.Replace('\\', '/');

    private static async Task<TDocument> LoadDocumentAsync<TDocument>(string path, Func<TDocument> factory, CancellationToken cancellationToken)
    {
        if (!File.Exists(path))
        {
            return factory();
        }

        await using var stream = File.OpenRead(path);
        var document = await JsonSerializer.DeserializeAsync<TDocument>(stream, ReadOptions, cancellationToken).ConfigureAwait(false);
        return document ?? factory();
    }

    private static async Task PersistDocumentAsync<TDocument>(string path, TDocument document, CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await using var stream = File.Create(path);
        await JsonSerializer.SerializeAsync(stream, document, WriteOptions, cancellationToken).ConfigureAwait(false);
    }

    private string ResolvePath(string configuredPath)
    {
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            throw new InvalidOperationException("The metadata path configuration is missing.");
        }

        if (Path.IsPathRooted(configuredPath))
        {
            return configuredPath;
        }

        var primary = Path.GetFullPath(configuredPath, Directory.GetCurrentDirectory());
        if (File.Exists(primary) || Directory.Exists(Path.GetDirectoryName(primary) ?? string.Empty))
        {
            return primary;
        }

        var baseDirectory = AppContext.BaseDirectory;
        if (!string.IsNullOrWhiteSpace(baseDirectory))
        {
            return Path.GetFullPath(configuredPath, baseDirectory);
        }

        return primary;
    }

    private sealed class CountryDocument
    {
        public List<CountryRecord> Countries { get; set; } = new();
    }

    private sealed class CountryRecord
    {
        public string? Id { get; set; }

        public string? Name { get; set; }

        public string? Report { get; set; }
    }

    private sealed class CityDocument
    {
        public List<CityRecord> Cities { get; set; } = new();
    }

    private sealed class CityRecord
    {
        public string? Id { get; set; }

        public string? CountryId { get; set; }

        public string? Name { get; set; }

        public string? Report { get; set; }
    }
}
