using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Logging;
using ReportMaintenance.OpenAI;
using ReportMaintenance.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration
    .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables(prefix: "REPORT_MAINTENANCE_");

builder.Services.Configure<ReportMaintenanceOptions>(builder.Configuration.GetSection("ReportMaintenance"));
builder.Services.Configure<OpenAIOptions>(builder.Configuration.GetSection("OpenAI"));

builder.Services.AddLogging(logging =>
{
    logging.AddSimpleConsole(options =>
    {
        options.SingleLine = true;
        options.TimestampFormat = "HH:mm:ss ";
    });

    logging.Services.AddSingleton<ILoggerProvider>(sp =>
    {
        var reportOptions = sp.GetRequiredService<IOptions<ReportMaintenanceOptions>>().Value;
        return new FileLoggerProvider(reportOptions.LogsDirectory);
    });
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

builder.Services.AddSingleton<IReportRepository, FileReportRepository>();
builder.Services.AddSingleton<IRatingGuideProvider, RatingGuideProvider>();
builder.Services.AddSingleton<IFamilyProfileProvider, FamilyProfileProvider>();
builder.Services.AddSingleton<IKeyDefinitionProvider, KeyDefinitionProvider>();
builder.Services.AddSingleton<ReportContextFactory>();
builder.Services.AddSingleton<ReportUpdateService>();
builder.Services.AddSingleton<ICategoryKeyProvider, CategoryKeyProvider>();
builder.Services.AddSingleton<ReportCreationService>();
builder.Services.AddSingleton<CategoryCreationService>();
builder.Services.AddSingleton<CategoryKeyCreationService>();
builder.Services.AddSingleton<ILocationMetadataService, LocationMetadataService>();
builder.Services.AddSingleton<IAlignmentSuggestionCache>(sp =>
{
    var options = sp.GetRequiredService<IOptions<ReportMaintenanceOptions>>().Value;
    if (string.IsNullOrWhiteSpace(options.ContextCachePath))
    {
        return NoopAlignmentSuggestionCache.Instance;
    }

    return ActivatorUtilities.CreateInstance<FileAlignmentSuggestionCache>(sp);
});

builder.Services.AddHttpClient<IOpenAIAlignmentClient, OpenAIAlignmentClient>();
builder.Services.AddHttpClient<IOpenAIRatingGuideClient, OpenAIRatingGuideClient>();

var app = builder.Build();

app.UseCors();

app.MapPost("/api/regenerate", async (
    RegenerateRequest request,
    ReportUpdateService updateService,
    CancellationToken cancellationToken) =>
{
    if (request is null)
    {
        return Results.BadRequest(new RegenerateResponse(false, "Request body is required."));
    }

    var reportName = NormalizeReportName(request.Report);
    if (string.IsNullOrWhiteSpace(reportName))
    {
        return Results.BadRequest(new RegenerateResponse(false, "Report name is required."));
    }

    var keyId = (request.KeyId ?? string.Empty).Trim();
    if (string.IsNullOrWhiteSpace(keyId))
    {
        return Results.BadRequest(new RegenerateResponse(false, "KeyId is required."));
    }

    var result = await updateService
        .UpdateSingleEntryAsync(reportName, keyId, request.Category, cancellationToken)
        .ConfigureAwait(false);

    return Results.Json(new RegenerateResponse(result.Updated, result.Message)
    {
        Report = result.ReportName,
        KeyId = result.Key,
        Entry = result.Entry,
    });
});

app.MapGet("/api/health", () => Results.Ok(new { Status = "OK" }));

app.Run();

static string NormalizeReportName(string? input)
{
    if (string.IsNullOrWhiteSpace(input))
    {
        return string.Empty;
    }

    var trimmed = input.Trim();
    var fileName = Path.GetFileNameWithoutExtension(trimmed);
    if (fileName.EndsWith("_report", StringComparison.OrdinalIgnoreCase))
    {
        return fileName;
    }

    return string.IsNullOrWhiteSpace(fileName)
        ? string.Empty
        : fileName + "_report";
}

internal sealed record RegenerateRequest(string? Report, string? KeyId, string? Category);

internal sealed record RegenerateResponse(bool Success, string Message)
{
    public string? Report { get; init; }

    public string? KeyId { get; init; }

    public object? Entry { get; init; }
}
