using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public interface IRatingGuideProvider
{
    Task<IReadOnlyDictionary<string, RatingGuide>> GetGuidesAsync(CancellationToken cancellationToken = default);
}

public sealed class RatingGuideProvider : IRatingGuideProvider
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly ILogger<RatingGuideProvider> _logger;
    private readonly ReportMaintenanceOptions _options;
    private IReadOnlyDictionary<string, RatingGuide>? _cache;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public RatingGuideProvider(IOptions<ReportMaintenanceOptions> options, ILogger<RatingGuideProvider> logger)
    {
        _logger = logger;
        _options = options.Value;
    }

    public async Task<IReadOnlyDictionary<string, RatingGuide>> GetGuidesAsync(CancellationToken cancellationToken = default)
    {
        if (_cache is not null)
        {
            return _cache;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_cache is not null)
            {
                return _cache;
            }

            var path = Path.GetFullPath(_options.RatingGuidesPath, Directory.GetCurrentDirectory());
            if (!File.Exists(path))
            {
                throw new FileNotFoundException("Rating guide data not found.", path);
            }

            await using var stream = File.OpenRead(path);
            var document = await JsonSerializer.DeserializeAsync<RatingGuideDocument>(stream, SerializerOptions, cancellationToken);
            if (document is null)
            {
                throw new InvalidOperationException("Unable to deserialize rating guide data.");
            }

            _cache = document.RatingGuides
                .GroupBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            _logger.LogInformation("Loaded {Count} rating guide entries.", _cache.Count);
            return _cache;
        }
        finally
        {
            _gate.Release();
        }
    }
}
