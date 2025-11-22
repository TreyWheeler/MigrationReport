using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;
using ReportMaintenance.OpenAI;

namespace ReportMaintenance.Services;

public sealed class ReportUpdateService
{
    private readonly IReportRepository _reportRepository;
    private readonly ReportContextFactory _contextFactory;
    private readonly IOpenAIAlignmentClient _openAiClient;
    private readonly ICategoryKeyProvider _categoryKeyProvider;
    private readonly IKeyDefinitionProvider _keyDefinitionProvider;
    private readonly IAlignmentSuggestionCache _cache;
    private readonly ILogger<ReportUpdateService> _logger;
    private readonly ReportMaintenanceOptions _options;

    public ReportUpdateService(
        IReportRepository reportRepository,
        ReportContextFactory contextFactory,
        IOpenAIAlignmentClient openAiClient,
        ICategoryKeyProvider categoryKeyProvider,
        IKeyDefinitionProvider keyDefinitionProvider,
        IAlignmentSuggestionCache cache,
        IOptions<ReportMaintenanceOptions> options,
        ILogger<ReportUpdateService> logger)
    {
        _reportRepository = reportRepository;
        _contextFactory = contextFactory;
        _openAiClient = openAiClient;
        _categoryKeyProvider = categoryKeyProvider;
        _keyDefinitionProvider = keyDefinitionProvider;
        _cache = cache;
        _logger = logger;
        _options = options.Value;
    }

    public async Task UpdateAllReportsAsync(string? category = null, string? startPrefix = null, CancellationToken cancellationToken = default)
    {
        category = NormalizeSelector(category);
        startPrefix = NormalizeSelector(startPrefix);

        var reportNames = await _reportRepository.GetReportNamesAsync(cancellationToken);
        if (reportNames.Count == 0)
        {
            _logger.LogWarning("No report files were found in {Directory}.", _options.ReportsDirectory);
            return;
        }

        if (!string.IsNullOrWhiteSpace(startPrefix))
        {
            var filtered = reportNames
                .Where(name => !string.IsNullOrWhiteSpace(name) && string.Compare(name, startPrefix, StringComparison.OrdinalIgnoreCase) >= 0)
                .ToList();

            if (filtered.Count == 0)
            {
                _logger.LogWarning("No reports matched the start prefix '{Prefix}'. Nothing to update.", startPrefix);
                return;
            }

            reportNames = filtered;
            _logger.LogInformation("Resuming updates from prefix '{Prefix}'. {Count} reports queued.", startPrefix, filtered.Count);
        }

        var concurrency = Math.Max(1, _options.MaxConcurrentReports);
        using var throttler = new SemaphoreSlim(concurrency, concurrency);
        var tasks = reportNames
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(async reportName =>
            {
                await throttler.WaitAsync(cancellationToken).ConfigureAwait(false);
                try
                {
                    await UpdateReportAsync(reportName!, category, cancellationToken).ConfigureAwait(false);
                }
                finally
                {
                    throttler.Release();
                }
            });

        await Task.WhenAll(tasks).ConfigureAwait(false);
    }

    public async Task<ReportEntryUpdateResult> UpdateSingleEntryAsync(
        string reportName,
        string key,
        string? category = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedReport = NormalizeSelector(reportName);
        var normalizedKey = NormalizeSelector(key);
        category = NormalizeSelector(category);

        if (string.IsNullOrWhiteSpace(normalizedReport))
        {
            throw new ArgumentException("A report name must be provided.", nameof(reportName));
        }

        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            throw new ArgumentException("A key identifier must be provided.", nameof(key));
        }

        _logger.LogInformation("Updating key {Key} for report {ReportName}.", normalizedKey, normalizedReport);

        var document = await _reportRepository.LoadAsync(normalizedReport, cancellationToken).ConfigureAwait(false);
        var definitions = await _keyDefinitionProvider.GetDefinitionsAsync(cancellationToken).ConfigureAwait(false);
        BackfillMissingEntries(document, definitions, normalizedReport);
        var context = await _contextFactory.CreateAsync(normalizedReport, document, cancellationToken).ConfigureAwait(false);

        ICategoryKeyProvider.CategoryMatch? categoryMatch = null;
        if (category is not null)
        {
            categoryMatch = await _categoryKeyProvider.GetCategoryMatchAsync(category, cancellationToken).ConfigureAwait(false);
            if (categoryMatch is { Keys.Count: > 0 } && !categoryMatch.Keys.Contains(normalizedKey, StringComparer.OrdinalIgnoreCase))
            {
                var message = $"Key '{normalizedKey}' is not part of category '{categoryMatch.DisplayName}'.";
                _logger.LogWarning(message);
                return ReportEntryUpdateResult.NotUpdated(normalizedReport, normalizedKey, message);
            }
        }

        try
        {
            var entry = document.Values.FirstOrDefault(e => e.Key.Equals(normalizedKey, StringComparison.OrdinalIgnoreCase));
            if (entry is null)
            {
                var message = $"Key '{normalizedKey}' was not found in report '{normalizedReport}'.";
                _logger.LogWarning(message);
                return ReportEntryUpdateResult.NotUpdated(normalizedReport, normalizedKey, message);
            }

            var originalText = entry.AlignmentText?.Trim();
            var originalValue = entry.AlignmentValue;
            var originalSame = entry.SameAsParent;

            try
            {
                var suggestion = await _openAiClient.GenerateSuggestionAsync(context, entry, cancellationToken).ConfigureAwait(false);

                var hasChanges =
                    !string.Equals(originalText, suggestion.AlignmentText, StringComparison.Ordinal) ||
                    originalValue != suggestion.AlignmentValue ||
                    originalSame != suggestion.SameAsParent;

                if (!hasChanges)
                {
                    var unchangedMessage = $"No changes detected for {normalizedKey}; skipping save.";
                    _logger.LogInformation(unchangedMessage);
                    return ReportEntryUpdateResult.Unchanged(normalizedReport, normalizedKey, entry);
                }

                entry.AlignmentText = suggestion.AlignmentText;
                entry.AlignmentValue = suggestion.AlignmentValue;
                entry.SameAsParent = suggestion.SameAsParent;

                await _reportRepository.SaveAsync(normalizedReport, document, cancellationToken).ConfigureAwait(false);
                _logger.LogInformation("Updated key {Key} with value {Value} for report {Report}.", normalizedKey, suggestion.AlignmentValue, normalizedReport);

                return ReportEntryUpdateResult.Updated(normalizedReport, normalizedKey, entry);
            }
            catch (Exception ex)
            {
                var message = $"Failed to update key '{normalizedKey}' for report '{normalizedReport}'.";
                _logger.LogError(ex, message);
                return ReportEntryUpdateResult.NotUpdated(normalizedReport, normalizedKey, message);
            }
        }
        finally
        {
            await _cache.FlushAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    public async Task UpdateReportsAsync(IEnumerable<string> reportNames, string? category = null, CancellationToken cancellationToken = default)
    {
        if (reportNames is null)
        {
            throw new ArgumentNullException(nameof(reportNames));
        }

        category = NormalizeSelector(category);
        var normalizedNames = reportNames
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (normalizedNames.Length == 0)
        {
            _logger.LogInformation("No report names were supplied; nothing to update.");
            return;
        }

        var concurrency = Math.Max(1, _options.MaxConcurrentReports);
        using var throttler = new SemaphoreSlim(concurrency, concurrency);
        var tasks = normalizedNames.Select(async reportName =>
        {
            await throttler.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                await UpdateReportAsync(reportName, category, cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                throttler.Release();
            }
        });

        await Task.WhenAll(tasks).ConfigureAwait(false);
    }

    public async Task UpdateReportAsync(string reportName, string? category = null, CancellationToken cancellationToken = default)
    {
        category = NormalizeSelector(category);

        if (string.IsNullOrWhiteSpace(reportName))
        {
            throw new ArgumentException("A report name must be provided.", nameof(reportName));
        }

        _logger.LogInformation("Updating report {ReportName}.", reportName);
        var document = await _reportRepository.LoadAsync(reportName, cancellationToken);
        var definitions = await _keyDefinitionProvider.GetDefinitionsAsync(cancellationToken).ConfigureAwait(false);
        BackfillMissingEntries(document, definitions, reportName);
        var context = await _contextFactory.CreateAsync(reportName, document, cancellationToken);

        ICategoryKeyProvider.CategoryMatch? categoryMatch = null;
        if (category is not null)
        {
            categoryMatch = await _categoryKeyProvider.GetCategoryMatchAsync(category, cancellationToken);
        }

        try
        {
            IEnumerable<ReportEntry> candidates = document.Values;
            if (categoryMatch is { Keys.Count: > 0 })
            {
                var keySet = new HashSet<string>(categoryMatch.Keys, StringComparer.OrdinalIgnoreCase);
                candidates = candidates.Where(entry => keySet.Contains(entry.Key));
                _logger.LogInformation("Updating category {CategoryId} ({CategoryName}) for report {ReportName}.", categoryMatch.CategoryId, categoryMatch.DisplayName, reportName);
            }
            else if (categoryMatch is { Keys.Count: 0 })
            {
                _logger.LogWarning("Category {Category} has no associated keys; skipping report {ReportName}.", categoryMatch.DisplayName, reportName);
                return;
            }
            else if (category is not null)
            {
                candidates = candidates.Where(entry => entry.Key.Equals(category, StringComparison.OrdinalIgnoreCase));
            }

            var entries = candidates.ToList();

            if (entries.Count == 0)
            {
                if (categoryMatch is not null)
                {
                    _logger.LogWarning("No entries matched category {Category} for report {ReportName}.", categoryMatch.DisplayName, reportName);
                }
                else if (category is not null)
                {
                    _logger.LogWarning("Key {Key} was not found in report {ReportName}.", category, reportName);
                }
                else
                {
                    _logger.LogWarning("No entries were matched for report {ReportName}.", reportName);
                }

                return;
            }

            var updatedEntries = new ConcurrentBag<ReportEntry>();
            var entryConcurrency = Math.Max(1, _options.MaxConcurrentEntries);
            using var entryThrottler = new SemaphoreSlim(entryConcurrency, entryConcurrency);

            var tasks = entries.Select(async entry =>
            {
                await entryThrottler.WaitAsync(cancellationToken).ConfigureAwait(false);
                try
                {
                    var originalText = entry.AlignmentText?.Trim();
                    var originalValue = entry.AlignmentValue;
                    var originalSame = entry.SameAsParent;

                    var suggestion = await _openAiClient.GenerateSuggestionAsync(context, entry, cancellationToken).ConfigureAwait(false);

                    var hasChanges =
                        !string.Equals(originalText, suggestion.AlignmentText, StringComparison.Ordinal) ||
                        originalValue != suggestion.AlignmentValue ||
                        originalSame != suggestion.SameAsParent;

                    if (!hasChanges)
                    {
                        _logger.LogInformation("No changes detected for {Key}; skipping update.", entry.Key);
                        return;
                    }

                    entry.AlignmentText = suggestion.AlignmentText;
                    entry.AlignmentValue = suggestion.AlignmentValue;
                    entry.SameAsParent = suggestion.SameAsParent;
                    updatedEntries.Add(entry);
                    _logger.LogInformation("Updated key {Key} with value {Value}.", entry.Key, suggestion.AlignmentValue);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to update key {Key} for report {ReportName}.", entry.Key, reportName);
                }
                finally
                {
                    entryThrottler.Release();
                }
            });

        await Task.WhenAll(tasks).ConfigureAwait(false);

        if (!updatedEntries.IsEmpty)
        {
            await _reportRepository.SaveAsync(reportName, document, cancellationToken);
        }
        else
        {
            _logger.LogWarning("No entries were updated for {ReportName}; file was not written.", reportName);
        }
    }
    finally
    {
        await _cache.FlushAsync(cancellationToken).ConfigureAwait(false);
    }
}

    private void BackfillMissingEntries(ReportDocument document, IReadOnlyDictionary<string, CategoryKey> definitions, string reportName)
    {
        if (definitions.Count == 0)
        {
            return;
        }

        var existingKeys = new HashSet<string>(
            document.Values.Select(v => v.Key).Where(k => !string.IsNullOrWhiteSpace(k)),
            StringComparer.OrdinalIgnoreCase);

        var definitionKeys = definitions.Keys
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Select(key => key.Trim());

        var missingKeys = definitionKeys
            .Where(key => !existingKeys.Contains(key))
            .OrderBy(key => key, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (missingKeys.Count == 0)
        {
            return;
        }

        foreach (var key in missingKeys)
        {
            document.Values.Add(new ReportEntry { Key = key });
        }

        _logger.LogInformation("Added {Count} missing entries to report {ReportName}.", missingKeys.Count, reportName);
    }

    private static string? NormalizeSelector(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
