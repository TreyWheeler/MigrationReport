using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public interface IFamilyProfileProvider
{
    Task<FamilyProfile> GetProfileAsync(CancellationToken cancellationToken = default);
}

public sealed class FamilyProfileProvider : IFamilyProfileProvider
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly ILogger<FamilyProfileProvider> _logger;
    private readonly ReportMaintenanceOptions _options;
    private FamilyProfile? _cache;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public FamilyProfileProvider(IOptions<ReportMaintenanceOptions> options, ILogger<FamilyProfileProvider> logger)
    {
        _logger = logger;
        _options = options.Value;
    }

    public async Task<FamilyProfile> GetProfileAsync(CancellationToken cancellationToken = default)
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

            var path = Path.GetFullPath(_options.FamilyProfilePath, Directory.GetCurrentDirectory());
            if (!File.Exists(path))
            {
                throw new FileNotFoundException("Family profile file not found.", path);
            }

            await using var stream = File.OpenRead(path);
            var profile = await JsonSerializer.DeserializeAsync<FamilyProfile>(stream, SerializerOptions, cancellationToken);
            if (profile is null)
            {
                throw new InvalidOperationException("Unable to deserialize family profile.");
            }

            _cache = profile;
            _logger.LogInformation("Loaded family profile for origin {City}, {Country}.", profile.Origin?.City, profile.Origin?.Country);
            return _cache;
        }
        finally
        {
            _gate.Release();
        }
    }
}
