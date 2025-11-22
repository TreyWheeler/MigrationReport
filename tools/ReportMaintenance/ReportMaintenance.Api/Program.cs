using Microsoft.Extensions.Options;
using ReportMaintenance;
using ReportMaintenance.Configuration;
using ReportMaintenance.Logging;
using ReportMaintenance.Services;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:5075");

builder.Configuration
    .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables(prefix: "REPORT_MAINTENANCE_");

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

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddReportMaintenanceCore(builder.Configuration);

var app = builder.Build();

app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();

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

    return Results.Json(new RegenerateResponse(result.IsUpdated, result.Message)
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
