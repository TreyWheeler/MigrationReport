using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;

namespace ReportMaintenance.OpenAI;

public interface IAlignmentSuggestionCache
{
    Task<AlignmentSuggestion?> GetAsync(string key, CancellationToken cancellationToken);

    Task SetAsync(string key, AlignmentSuggestion suggestion, CancellationToken cancellationToken);

    Task FlushAsync(CancellationToken cancellationToken);
}

public sealed class NoopAlignmentSuggestionCache : IAlignmentSuggestionCache
{
    public static readonly IAlignmentSuggestionCache Instance = new NoopAlignmentSuggestionCache();

    private NoopAlignmentSuggestionCache()
    {
    }

    public Task<AlignmentSuggestion?> GetAsync(string key, CancellationToken cancellationToken) =>
        Task.FromResult<AlignmentSuggestion?>(null);

    public Task SetAsync(string key, AlignmentSuggestion suggestion, CancellationToken cancellationToken) =>
        Task.CompletedTask;

    public Task FlushAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

public sealed class FileAlignmentSuggestionCache : IAlignmentSuggestionCache
{
    private readonly string _cachePath;
    private readonly ILogger<FileAlignmentSuggestionCache> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private CacheDocument _document = new();
    private bool _initialized;
    private bool _dirty;

    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public FileAlignmentSuggestionCache(IOptions<ReportMaintenanceOptions> options, ILogger<FileAlignmentSuggestionCache> logger)
    {
        if (options is null)
        {
            throw new ArgumentNullException(nameof(options));
        }

        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        var cachePath = options.Value.ContextCachePath;
        if (string.IsNullOrWhiteSpace(cachePath))
        {
            throw new ArgumentException("Context cache path must be provided when using FileAlignmentSuggestionCache.", nameof(options));
        }

        _cachePath = Path.GetFullPath(cachePath, Directory.GetCurrentDirectory());
    }

    public async Task<AlignmentSuggestion?> GetAsync(string key, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken).ConfigureAwait(false);
        if (_document.Entries.TryGetValue(key, out var entry))
        {
            return entry.Suggestion;
        }

        return null;
    }

    public async Task SetAsync(string key, AlignmentSuggestion suggestion, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken).ConfigureAwait(false);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            _document.Entries[key] = new CacheEntry(suggestion, DateTimeOffset.UtcNow);
            _dirty = true;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task FlushAsync(CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken).ConfigureAwait(false);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (!_dirty)
            {
                return;
            }

            await PersistAsync(cancellationToken).ConfigureAwait(false);
            _dirty = false;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task EnsureInitializedAsync(CancellationToken cancellationToken)
    {
        if (_initialized)
        {
            return;
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_initialized)
            {
                return;
            }

            var directory = Path.GetDirectoryName(_cachePath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            if (File.Exists(_cachePath))
            {
                try
                {
                    await using var stream = File.OpenRead(_cachePath);
                    var document = await JsonSerializer.DeserializeAsync<CacheDocument>(stream, SerializerOptions, cancellationToken).ConfigureAwait(false);
                    if (document is not null)
                    {
                        _document = document;
                        _dirty = false;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load alignment suggestion cache from {Path}. The cache will be recreated.", _cachePath);
                    _document = new CacheDocument();
                    _dirty = false;
                }
            }

            _initialized = true;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task PersistAsync(CancellationToken cancellationToken)
    {
        await using var stream = File.Create(_cachePath);
        await JsonSerializer.SerializeAsync(stream, _document, SerializerOptions, cancellationToken).ConfigureAwait(false);
    }

    private sealed record CacheDocument
    {
        public Dictionary<string, CacheEntry> Entries { get; init; } = new(StringComparer.Ordinal);
    }

    private sealed record CacheEntry(AlignmentSuggestion Suggestion, DateTimeOffset StoredAt);
}

public static class AlignmentSuggestionCacheKey
{
    public static string Create(string prefixTemplate, string model)
    {
        var normalizedModel = model?.Trim() ?? string.Empty;
        var composite = $"{normalizedModel}\n{prefixTemplate}";
        var bytes = Encoding.UTF8.GetBytes(composite);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash);
    }
}
