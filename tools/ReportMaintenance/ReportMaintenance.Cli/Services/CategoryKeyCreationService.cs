using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;
using ReportMaintenance.OpenAI;

namespace ReportMaintenance.Services;

public sealed class CategoryKeyCreationService
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

    private readonly ICategoryKeyProvider _categoryKeyProvider;
    private readonly IFamilyProfileProvider _familyProfileProvider;
    private readonly IOpenAIRatingGuideClient _ratingGuideClient;
    private readonly IRatingGuideProvider _ratingGuideProvider;
    private readonly IReportRepository _reportRepository;
    private readonly ReportUpdateService _reportUpdateService;
    private readonly ReportMaintenanceOptions _options;
    private readonly ILogger<CategoryKeyCreationService> _logger;

    public CategoryKeyCreationService(
        ICategoryKeyProvider categoryKeyProvider,
        IFamilyProfileProvider familyProfileProvider,
        IOpenAIRatingGuideClient ratingGuideClient,
        IRatingGuideProvider ratingGuideProvider,
        IReportRepository reportRepository,
        ReportUpdateService reportUpdateService,
        IOptions<ReportMaintenanceOptions> options,
        ILogger<CategoryKeyCreationService> logger)
    {
        _categoryKeyProvider = categoryKeyProvider;
        _familyProfileProvider = familyProfileProvider;
        _ratingGuideClient = ratingGuideClient;
        _ratingGuideProvider = ratingGuideProvider;
        _reportRepository = reportRepository;
        _reportUpdateService = reportUpdateService;
        _options = options.Value;
        _logger = logger;
    }

    public async Task AddCategoryKeyAsync(string categorySelector, string keyName, string? keyGuidance, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(categorySelector))
        {
            throw new ArgumentException("A category selector must be provided.", nameof(categorySelector));
        }

        if (string.IsNullOrWhiteSpace(keyName))
        {
            throw new ArgumentException("A key name must be provided.", nameof(keyName));
        }

        keyName = keyName.Trim();
        keyGuidance = string.IsNullOrWhiteSpace(keyGuidance) ? null : keyGuidance.Trim();

        var categoryMatch = await _categoryKeyProvider.GetCategoryMatchAsync(categorySelector, cancellationToken).ConfigureAwait(false);
        if (categoryMatch is null)
        {
            throw new InvalidOperationException($"Category '{categorySelector}' was not found.");
        }

        if (string.IsNullOrWhiteSpace(categoryMatch.CategoryId))
        {
            throw new InvalidOperationException($"Category '{categorySelector}' does not have a valid identifier.");
        }

        var categoryId = categoryMatch.CategoryId.Trim();
        var categoryName = string.IsNullOrWhiteSpace(categoryMatch.DisplayName)
            ? categoryId
            : categoryMatch.DisplayName.Trim();
        var keyId = BuildKeyId(categoryId, keyName);

        var categoryKeysDocument = await LoadCategoryKeyDocumentAsync(cancellationToken).ConfigureAwait(false);
        ValidateCategoryKeyUniqueness(categoryKeysDocument, categoryId, keyId, keyName);

        var ratingGuidesDocument = await LoadRatingGuideDocumentAsync(cancellationToken).ConfigureAwait(false);
        ValidateRatingGuideUniqueness(ratingGuidesDocument, keyName);

        var familyProfile = await _familyProfileProvider.GetProfileAsync(cancellationToken).ConfigureAwait(false);
        var ratingGuideSuggestion = await _ratingGuideClient
            .GenerateRatingGuideAsync(keyName, categoryName, familyProfile, keyGuidance, cancellationToken)
            .ConfigureAwait(false);

        await PersistRatingGuideAsync(ratingGuidesDocument, keyName, ratingGuideSuggestion, cancellationToken).ConfigureAwait(false);
        await PersistCategoryKeyAsync(categoryKeysDocument, categoryId, keyId, keyName, keyGuidance, cancellationToken).ConfigureAwait(false);

        _categoryKeyProvider.Invalidate();
        _ratingGuideProvider.Invalidate();

        var addedCount = await EnsureKeyExistsInReportsAsync(keyName, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Ensured key {Key} exists in {Count} reports.", keyName, addedCount);

        await _reportUpdateService.UpdateAllReportsAsync(keyName, null, cancellationToken).ConfigureAwait(false);
    }

    private async Task<CategoryKeyDocument> LoadCategoryKeyDocumentAsync(CancellationToken cancellationToken)
    {
        var path = ResolvePath(_options.CategoryKeysPath);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("Category keys data not found.", path);
        }

        await using var stream = File.OpenRead(path);
        var document = await JsonSerializer.DeserializeAsync<CategoryKeyDocument>(stream, ReadOptions, cancellationToken).ConfigureAwait(false);
        if (document is null)
        {
            throw new InvalidOperationException("Unable to deserialize category key data.");
        }

        return document;
    }

    private async Task<RatingGuideDocument> LoadRatingGuideDocumentAsync(CancellationToken cancellationToken)
    {
        var path = ResolvePath(_options.RatingGuidesPath);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("Rating guides data not found.", path);
        }

        await using var stream = File.OpenRead(path);
        var document = await JsonSerializer.DeserializeAsync<RatingGuideDocument>(stream, ReadOptions, cancellationToken).ConfigureAwait(false);
        if (document is null)
        {
            throw new InvalidOperationException("Unable to deserialize rating guide data.");
        }

        return document;
    }

    private async Task PersistCategoryKeyAsync(CategoryKeyDocument document, string categoryId, string keyId, string keyName, string? keyGuidance, CancellationToken cancellationToken)
    {
        var order = document.CategoryKeys
            .Where(k => k.CategoryId.Equals(categoryId, StringComparison.OrdinalIgnoreCase))
            .Select(k => k.Order)
            .DefaultIfEmpty(0)
            .Max() + 1;

        document.CategoryKeys.Add(new CategoryKey
        {
            Id = keyId,
            CategoryId = categoryId,
            Name = keyName,
            Order = order,
            Guidance = keyGuidance
        });

        var path = ResolvePath(_options.CategoryKeysPath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var stream = File.Create(path);
        await JsonSerializer.SerializeAsync(stream, document, WriteOptions, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Added key {KeyName} ({KeyId}) to category {CategoryId}.", keyName, keyId, categoryId);
    }

    private async Task PersistRatingGuideAsync(RatingGuideDocument document, string keyName, RatingGuideSuggestion suggestion, CancellationToken cancellationToken)
    {
        document.RatingGuides.Add(new RatingGuide
        {
            Key = keyName,
            Entries = suggestion.Entries
                .Select(entry => new RatingGuideEntry
                {
                    Rating = entry.Rating,
                    Guidance = entry.Guidance
                })
                .ToList()
        });

        var path = ResolvePath(_options.RatingGuidesPath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var stream = File.Create(path);
        await JsonSerializer.SerializeAsync(stream, document, WriteOptions, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Persisted rating guide for {KeyName} with {Count} entries.", keyName, suggestion.Entries.Count);
    }

    private async Task<int> EnsureKeyExistsInReportsAsync(string keyName, CancellationToken cancellationToken)
    {
        var reportNames = await _reportRepository.GetReportNamesAsync(cancellationToken).ConfigureAwait(false);
        var updates = 0;

        foreach (var reportName in reportNames)
        {
            var document = await _reportRepository.LoadAsync(reportName, cancellationToken).ConfigureAwait(false);
            if (document.Values.Any(entry => entry.Key.Equals(keyName, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            document.Values.Add(new ReportEntry { Key = keyName });
            document.Values.Sort((left, right) => string.Compare(left.Key, right.Key, StringComparison.OrdinalIgnoreCase));
            await _reportRepository.SaveAsync(reportName, document, cancellationToken).ConfigureAwait(false);
            updates++;
        }

        return updates;
    }

    private static void ValidateCategoryKeyUniqueness(CategoryKeyDocument document, string categoryId, string keyId, string keyName)
    {
        if (document.CategoryKeys.Any(key => key.Id.Equals(keyId, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException($"A category key with id '{keyId}' already exists.");
        }

        if (document.CategoryKeys.Any(key => key.CategoryId.Equals(categoryId, StringComparison.OrdinalIgnoreCase) && key.Name.Equals(keyName, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException($"A key named '{keyName}' already exists for category '{categoryId}'.");
        }
    }

    private static void ValidateRatingGuideUniqueness(RatingGuideDocument document, string keyName)
    {
        if (document.RatingGuides.Any(guide => guide.Key.Equals(keyName, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException($"A rating guide for key '{keyName}' already exists.");
        }
    }

    private string ResolvePath(string relativePath)
    {
        return Path.GetFullPath(relativePath, Directory.GetCurrentDirectory());
    }

    private static string BuildKeyId(string categoryId, string keyName)
    {
        var builder = new StringBuilder(categoryId.Length + keyName.Length + 1);
        builder.Append(categoryId.Trim());
        builder.Append('_');

        var normalized = keyName.Trim();
        var lastWasSeparator = true;
        foreach (var ch in normalized)
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

        var result = builder.ToString().TrimEnd('_');
        if (result.Length == 0)
        {
            throw new InvalidOperationException($"Unable to build a key identifier from '{keyName}'.");
        }

        return result;
    }
}
