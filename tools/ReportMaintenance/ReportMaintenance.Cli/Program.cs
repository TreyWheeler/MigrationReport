using System.CommandLine;
using System.IO;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry.Logs;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using ReportMaintenance;
using ReportMaintenance.Commands;
using ReportMaintenance.Configuration;
using ReportMaintenance.Logging;
using ReportMaintenance.OpenAI;

var builder = Host.CreateApplicationBuilder(args);

builder.Configuration
    .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true);

var assemblyBasePath = AppContext.BaseDirectory;
if (!string.IsNullOrWhiteSpace(assemblyBasePath))
{
    var assemblyAppSettings = Path.Combine(assemblyBasePath, "appsettings.json");
    if (File.Exists(assemblyAppSettings))
    {
        builder.Configuration.AddJsonFile(assemblyAppSettings, optional: true, reloadOnChange: true);
    }

    var assemblyEnvSettings = Path.Combine(assemblyBasePath, $"appsettings.{builder.Environment.EnvironmentName}.json");
    if (File.Exists(assemblyEnvSettings))
    {
        builder.Configuration.AddJsonFile(assemblyEnvSettings, optional: true, reloadOnChange: true);
    }
}

builder.Configuration.AddEnvironmentVariables(prefix: "REPORT_MAINTENANCE_");

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

    logging.Services.AddSingleton<ILoggerProvider>(sp =>
    {
        var reportOptions = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<ReportMaintenanceOptions>>().Value;
        return new FileLoggerProvider(reportOptions.LogsDirectory);
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

builder.Services.AddReportMaintenanceCore(builder.Configuration);

using var host = builder.Build();

var rootCommand = RootCommandBuilder.Build(host.Services);

return await rootCommand.InvokeAsync(args);
