using System.IO;
using System.Linq;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public interface IKeyDefinitionProvider
{
    Task<IReadOnlyDictionary<string, CategoryKey>> GetDefinitionsAsync(CancellationToken cancellationToken = default);

    void Invalidate();
}

public sealed class KeyDefinitionProvider : IKeyDefinitionProvider
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly ILogger<KeyDefinitionProvider> _logger;
    private readonly ReportMaintenanceOptions _options;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private IReadOnlyDictionary<string, CategoryKey>? _cache;

    public KeyDefinitionProvider(IOptions<ReportMaintenanceOptions> options, ILogger<KeyDefinitionProvider> logger)
    {
        _logger = logger;
        _options = options.Value;
    }

    public async Task<IReadOnlyDictionary<string, CategoryKey>> GetDefinitionsAsync(CancellationToken cancellationToken = default)
    {
        if (_cache is not null)
        {
            return _cache;
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_cache is not null)
            {
                return _cache;
            }

            var path = Path.GetFullPath(_options.CategoryKeysPath, Directory.GetCurrentDirectory());
            if (!File.Exists(path))
            {
                throw new FileNotFoundException("Category key data not found.", path);
            }

            await using var stream = File.OpenRead(path);
            var document = await JsonSerializer.DeserializeAsync<CategoryKeyDocument>(stream, SerializerOptions, cancellationToken).ConfigureAwait(false);
            if (document is null)
            {
                throw new InvalidOperationException("Unable to deserialize category key data.");
            }

            var groupedKeys = document.CategoryKeys
                .Where(k => !string.IsNullOrWhiteSpace(k.Id))
                .GroupBy(k => k.Id!, StringComparer.OrdinalIgnoreCase);

            var dictionary = new Dictionary<string, CategoryKey>(StringComparer.OrdinalIgnoreCase);
            foreach (var group in groupedKeys)
            {
                var key = group.Key;
                var first = group.First();
                dictionary[key] = first;

                if (group.Skip(1).Any())
                {
                    _logger.LogWarning("Duplicate key definitions found for '{Key}'. Using the first occurrence.", key);
                }
            }

            _cache = dictionary;

            _logger.LogInformation("Loaded {Count} key definitions.", _cache.Count);
            return _cache;
        }
        finally
        {
            _gate.Release();
        }
    }

    public void Invalidate() => _cache = null;
}
