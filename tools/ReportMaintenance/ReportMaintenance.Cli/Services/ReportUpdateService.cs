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
    private readonly ILogger<ReportUpdateService> _logger;
    private readonly ReportMaintenanceOptions _options;

    public ReportUpdateService(
        IReportRepository reportRepository,
        ReportContextFactory contextFactory,
        IOpenAIAlignmentClient openAiClient,
        IOptions<ReportMaintenanceOptions> options,
        ILogger<ReportUpdateService> logger)
    {
        _reportRepository = reportRepository;
        _contextFactory = contextFactory;
        _openAiClient = openAiClient;
        _logger = logger;
        _options = options.Value;
    }

    public async Task UpdateAllReportsAsync(CancellationToken cancellationToken = default)
    {
        var reportNames = await _reportRepository.GetReportNamesAsync(cancellationToken);
        if (reportNames.Count == 0)
        {
            _logger.LogWarning("No report files were found in {Directory}.", _options.ReportsDirectory);
            return;
        }

        foreach (var reportName in reportNames)
        {
            await UpdateReportAsync(reportName!, cancellationToken);
        }
    }

    public async Task UpdateReportAsync(string reportName, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reportName))
        {
            throw new ArgumentException("A report name must be provided.", nameof(reportName));
        }

        _logger.LogInformation("Updating report {ReportName}.", reportName);
        var document = await _reportRepository.LoadAsync(reportName, cancellationToken);
        var context = await _contextFactory.CreateAsync(reportName, document, cancellationToken);

        var updatedEntries = new List<ReportEntry>();
        foreach (var entry in document.Values)
        {
            try
            {
                var suggestion = await _openAiClient.GenerateSuggestionAsync(context, entry, cancellationToken);
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
        }

        if (updatedEntries.Count > 0)
        {
            await _reportRepository.SaveAsync(reportName, document, cancellationToken);
        }
        else
        {
            _logger.LogWarning("No entries were updated for {ReportName}; file was not written.", reportName);
        }
    }
}
