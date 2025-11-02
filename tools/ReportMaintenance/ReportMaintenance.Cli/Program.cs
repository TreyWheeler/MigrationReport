using System.CommandLine;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OpenTelemetry.Logs;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using ReportMaintenance.Configuration;
using ReportMaintenance.OpenAI;
using ReportMaintenance.Services;

var builder = Host.CreateApplicationBuilder(args);

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

    logging.AddOpenTelemetry(options =>
    {
        options.IncludeFormattedMessage = true;
        options.ParseStateValues = true;
        options.IncludeScopes = true;
        options.AddConsoleExporter();
    });
});

builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource.AddService("ReportMaintenance.Cli"))
    .WithTracing(tracerProviderBuilder =>
    {
        tracerProviderBuilder
            .AddSource(OpenAITelemetry.ActivitySourceName)
            .AddHttpClientInstrumentation(options =>
            {
                options.RecordException = true;
            })
            .AddConsoleExporter();
    });

builder.Services.AddSingleton<IReportRepository, FileReportRepository>();
builder.Services.AddSingleton<IRatingGuideProvider, RatingGuideProvider>();
builder.Services.AddSingleton<IFamilyProfileProvider, FamilyProfileProvider>();
builder.Services.AddSingleton<ReportContextFactory>();
builder.Services.AddSingleton<ReportUpdateService>();
builder.Services.AddSingleton<ICategoryKeyProvider, CategoryKeyProvider>();
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

using var host = builder.Build();

var rootCommand = new RootCommand("CLI utilities for updating migration reports with SOP-aligned automation.");

var updateReportsCommand = new Command("UpdateReports", "Update every report JSON file using OpenAI suggestions.");
var categoryOption = new Option<string?>(name: "--category", description: "Restrict updates to a category (ID or name) or single entry key.");
categoryOption.AddAlias("--Category");
categoryOption.AddAlias("-Category");
categoryOption.AddAlias("-c");

var startPrefixOption = new Option<string?>(name: "--start-prefix", description: "Resume when report file names reach this prefix (case-insensitive).");
startPrefixOption.AddAlias("--StartPrefix");
startPrefixOption.AddAlias("-StartPrefix");
startPrefixOption.AddAlias("-s");

updateReportsCommand.AddOption(categoryOption);
updateReportsCommand.AddOption(startPrefixOption);
updateReportsCommand.SetHandler(async (string? category, string? startPrefix) =>
{
    using var scope = host.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
    await service.UpdateAllReportsAsync(category, startPrefix);
}, categoryOption, startPrefixOption);

var reportOption = new Option<string>(name: "--report", description: "Report file name without extension (e.g., canada_report).");
reportOption.AddAlias("--Report");
reportOption.AddAlias("-Report");
reportOption.IsRequired = true;

var updateReportCommand = new Command("UpdateReport", "Update a single report JSON file using OpenAI suggestions.");
updateReportCommand.AddOption(reportOption);
updateReportCommand.AddOption(categoryOption);
updateReportCommand.SetHandler(async (string reportName, string? category) =>
{
    using var scope = host.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
    await service.UpdateReportAsync(reportName, category);
}, reportOption, categoryOption);

rootCommand.AddCommand(updateReportsCommand);
rootCommand.AddCommand(updateReportCommand);

return await rootCommand.InvokeAsync(args);
