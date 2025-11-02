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
    private readonly ILogger<ReportUpdateService> _logger;
    private readonly ReportMaintenanceOptions _options;

    public ReportUpdateService(
        IReportRepository reportRepository,
        ReportContextFactory contextFactory,
        IOpenAIAlignmentClient openAiClient,
        ICategoryKeyProvider categoryKeyProvider,
        IOptions<ReportMaintenanceOptions> options,
        ILogger<ReportUpdateService> logger)
    {
        _reportRepository = reportRepository;
        _contextFactory = contextFactory;
        _openAiClient = openAiClient;
        _categoryKeyProvider = categoryKeyProvider;
        _logger = logger;
        _options = options.Value;
    }

    public async Task UpdateAllReportsAsync(string? category = null, CancellationToken cancellationToken = default)
    {
        category = NormalizeSelector(category);

        var reportNames = await _reportRepository.GetReportNamesAsync(cancellationToken);
        if (reportNames.Count == 0)
        {
            _logger.LogWarning("No report files were found in {Directory}.", _options.ReportsDirectory);
            return;
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

    public async Task UpdateReportAsync(string reportName, string? category = null, CancellationToken cancellationToken = default)
    {
        category = NormalizeSelector(category);

        if (string.IsNullOrWhiteSpace(reportName))
        {
            throw new ArgumentException("A report name must be provided.", nameof(reportName));
        }

        _logger.LogInformation("Updating report {ReportName}.", reportName);
        var document = await _reportRepository.LoadAsync(reportName, cancellationToken);
        var context = await _contextFactory.CreateAsync(reportName, document, cancellationToken);

        ICategoryKeyProvider.CategoryMatch? categoryMatch = null;
        if (category is not null)
        {
            categoryMatch = await _categoryKeyProvider.GetCategoryMatchAsync(category, cancellationToken);
        }

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

    private static string? NormalizeSelector(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
