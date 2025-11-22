using System.Text.Json;
using System.Linq;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public interface IReportRepository
{
    Task<IReadOnlyList<string>> GetReportNamesAsync(CancellationToken cancellationToken = default);

    Task<ReportDocument> LoadAsync(string reportName, CancellationToken cancellationToken = default);

    Task SaveAsync(string reportName, ReportDocument document, CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(string reportName, CancellationToken cancellationToken = default);
}

public sealed class FileReportRepository : IReportRepository
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly ILogger<FileReportRepository> _logger;
    private readonly ReportMaintenanceOptions _options;

    public FileReportRepository(IOptions<ReportMaintenanceOptions> options, ILogger<FileReportRepository> logger)
    {
        _logger = logger;
        _options = options.Value;
    }

    public async Task<IReadOnlyList<string>> GetReportNamesAsync(CancellationToken cancellationToken = default)
    {
        var directory = ResolveReportsDirectory();
        if (!Directory.Exists(directory))
        {
            _logger.LogWarning("Reports directory '{Directory}' does not exist.", directory);
            return Array.Empty<string>();
        }

        var files = Directory.EnumerateFiles(directory, "*_report.json", SearchOption.TopDirectoryOnly)
            .Select(Path.GetFileNameWithoutExtension)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!) // safe due to preceding null/whitespace filter
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return await Task.FromResult(files);
    }

    public async Task<ReportDocument> LoadAsync(string reportName, CancellationToken cancellationToken = default)
    {
        var path = ResolveReportPath(reportName, ensureExists: true);
        await using var stream = File.OpenRead(path);
        var document = await JsonSerializer.DeserializeAsync<ReportDocument>(stream, SerializerOptions, cancellationToken);
        if (document is null)
        {
            throw new InvalidOperationException($"Report '{reportName}' could not be deserialized.");
        }

        return document;
    }

    public async Task SaveAsync(string reportName, ReportDocument document, CancellationToken cancellationToken = default)
    {
        var path = ResolveReportPath(reportName, ensureExists: false);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var stream = File.Create(path);
        await JsonSerializer.SerializeAsync(stream, document, SerializerOptions, cancellationToken);
        _logger.LogInformation("Persisted updates to {Report}", Path.GetFileName(path));
    }

    public Task<bool> ExistsAsync(string reportName, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reportName))
        {
            return Task.FromResult(false);
        }

        var path = ResolveReportPath(reportName, ensureExists: false);
        return Task.FromResult(File.Exists(path));
    }

    private string ResolveReportsDirectory()
    {
        return Path.GetFullPath(_options.ReportsDirectory, Directory.GetCurrentDirectory());
    }

    private string ResolveReportPath(string reportName, bool ensureExists)
    {
        var directory = ResolveReportsDirectory();
        var fileName = NormalizeFileName(reportName);
        var fullPath = Path.GetFullPath(Path.Combine(directory, fileName));

        if (ensureExists && !File.Exists(fullPath))
        {
            throw new FileNotFoundException($"Could not find report '{reportName}'.", fullPath);
        }

        return fullPath;
    }

    private static string NormalizeFileName(string reportName)
    {
        if (reportName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            return reportName;
        }

        return $"{reportName}.json";
    }
}
