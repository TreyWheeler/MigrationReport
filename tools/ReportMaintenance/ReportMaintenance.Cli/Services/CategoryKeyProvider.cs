using System.Collections.ObjectModel;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public interface ICategoryKeyProvider
{
    Task<CategoryMatch?> GetCategoryMatchAsync(string input, CancellationToken cancellationToken = default);

    void Invalidate();

    public sealed record CategoryMatch(string CategoryId, string DisplayName, IReadOnlyList<string> Keys);
}

public sealed class CategoryKeyProvider : ICategoryKeyProvider
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly ILogger<CategoryKeyProvider> _logger;
    private readonly ReportMaintenanceOptions _options;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private CategoryLookup? _lookup;

    public CategoryKeyProvider(IOptions<ReportMaintenanceOptions> options, ILogger<CategoryKeyProvider> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task<ICategoryKeyProvider.CategoryMatch?> GetCategoryMatchAsync(string input, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return null;
        }

        var lookup = await EnsureLookupAsync(cancellationToken).ConfigureAwait(false);
        var trimmed = input.Trim();

        if (lookup.ById.TryGetValue(trimmed, out var byIdMatch))
        {
            return byIdMatch;
        }

        if (lookup.ByName.TryGetValue(trimmed, out var byNameMatch))
        {
            return byNameMatch;
        }

        var token = NormalizeToken(trimmed);
        if (token.Length == 0)
        {
            return null;
        }

        if (lookup.ByToken.TryGetValue(token, out var byTokenMatch))
        {
            return byTokenMatch;
        }

        return null;
    }

    public void Invalidate() => _lookup = null;

    private async Task<CategoryLookup> EnsureLookupAsync(CancellationToken cancellationToken)
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

            var baseDirectory = Directory.GetCurrentDirectory();
            var categoryKeysPath = Path.GetFullPath(_options.CategoryKeysPath, baseDirectory);
            if (!File.Exists(categoryKeysPath))
            {
                throw new FileNotFoundException("Category keys data not found.", categoryKeysPath);
            }

            CategoryKeyDocument? categoryKeyDocument;
            await using (var stream = File.OpenRead(categoryKeysPath))
            {
                categoryKeyDocument = await JsonSerializer.DeserializeAsync<CategoryKeyDocument>(stream, SerializerOptions, cancellationToken).ConfigureAwait(false);
            }

            if (categoryKeyDocument is null)
            {
                throw new InvalidOperationException("Unable to deserialize category key data.");
            }

            var categoriesPath = Path.GetFullPath(_options.CategoriesPath, baseDirectory);
            var categoriesById = new Dictionary<string, Category>(StringComparer.OrdinalIgnoreCase);
            if (File.Exists(categoriesPath))
            {
                try
                {
                    await using var stream = File.OpenRead(categoriesPath);
                    var categoryDocument = await JsonSerializer.DeserializeAsync<CategoryDocument>(stream, SerializerOptions, cancellationToken).ConfigureAwait(false);
                    if (categoryDocument is not null)
                    {
                        foreach (var category in categoryDocument.Categories)
                        {
                            if (!string.IsNullOrWhiteSpace(category.Id))
                            {
                                categoriesById[category.Id] = category;
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load categories metadata from {Path}. Continuing with IDs only.", categoriesPath);
                }
            }
            else
            {
                _logger.LogWarning("Categories metadata file {Path} was not found. Category IDs will be used as display names.", categoriesPath);
            }

            var byId = new Dictionary<string, ICategoryKeyProvider.CategoryMatch>(StringComparer.OrdinalIgnoreCase);
            var byName = new Dictionary<string, ICategoryKeyProvider.CategoryMatch>(StringComparer.OrdinalIgnoreCase);
            var byToken = new Dictionary<string, ICategoryKeyProvider.CategoryMatch>(StringComparer.Ordinal);

            foreach (var grouping in categoryKeyDocument.CategoryKeys.GroupBy(k => k.CategoryId, StringComparer.OrdinalIgnoreCase))
            {
                var keyNames = grouping
                    .Select(k => k.Name?.Trim())
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .Select(name => name!)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
                    .ToArray();

                var readOnlyKeys = Array.AsReadOnly(keyNames);
                var displayName = categoriesById.TryGetValue(grouping.Key, out var category) && !string.IsNullOrWhiteSpace(category.Name)
                    ? category.Name
                    : grouping.Key;

                var match = new ICategoryKeyProvider.CategoryMatch(grouping.Key, displayName, readOnlyKeys);
                byId[grouping.Key] = match;

                if (!string.IsNullOrWhiteSpace(displayName))
                {
                    byName[displayName] = match;
                    var displayToken = NormalizeToken(displayName);
                    if (displayToken.Length > 0)
                    {
                        byToken[displayToken] = match;
                    }
                }

                var idToken = NormalizeToken(grouping.Key);
                if (idToken.Length > 0)
                {
                    byToken[idToken] = match;
                }
            }

            _lookup = new CategoryLookup(byId, byName, byToken);
            _logger.LogInformation("Loaded {Count} category-key groups.", byId.Count);
            return _lookup;
        }
        finally
        {
            _gate.Release();
        }
    }

    private static string NormalizeToken(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (char.IsLetterOrDigit(ch))
            {
                builder.Append(char.ToLowerInvariant(ch));
            }
        }

        return builder.ToString();
    }

    private sealed record CategoryLookup(
        IReadOnlyDictionary<string, ICategoryKeyProvider.CategoryMatch> ById,
        IReadOnlyDictionary<string, ICategoryKeyProvider.CategoryMatch> ByName,
        IReadOnlyDictionary<string, ICategoryKeyProvider.CategoryMatch> ByToken);
}
