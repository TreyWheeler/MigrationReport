using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
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
});

builder.Services.AddSingleton<IReportRepository, FileReportRepository>();
builder.Services.AddSingleton<IRatingGuideProvider, RatingGuideProvider>();
builder.Services.AddSingleton<IFamilyProfileProvider, FamilyProfileProvider>();
builder.Services.AddSingleton<ReportContextFactory>();
builder.Services.AddSingleton<ReportUpdateService>();
builder.Services.AddHttpClient<IOpenAIAlignmentClient, OpenAIAlignmentClient>();

using var host = builder.Build();

var rootCommand = new RootCommand("CLI utilities for updating migration reports with SOP-aligned automation.");

var updateReportsCommand = new Command("UpdateReports", "Update every report JSON file using OpenAI suggestions.");
updateReportsCommand.SetHandler(async () =>
{
    using var scope = host.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
    await service.UpdateAllReportsAsync();
});

var reportOption = new Option<string>(name: "--report", description: "Report file name without extension (e.g., canada_report).");
reportOption.AddAlias("--Report");
reportOption.AddAlias("-Report");
reportOption.IsRequired = true;

var updateReportCommand = new Command("UpdateReport", "Update a single report JSON file using OpenAI suggestions.");
updateReportCommand.AddOption(reportOption);
updateReportCommand.SetHandler(async (string reportName) =>
{
    using var scope = host.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
    await service.UpdateReportAsync(reportName);
}, reportOption);

rootCommand.AddCommand(updateReportsCommand);
rootCommand.AddCommand(updateReportCommand);

return await rootCommand.InvokeAsync(args);
