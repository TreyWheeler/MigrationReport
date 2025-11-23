using System.CommandLine;
using System.IO;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OpenTelemetry.Logs;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;
using ReportMaintenance.Logging;
using ReportMaintenance.OpenAI;
using ReportMaintenance.Services;

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
});

    logging.Services.AddSingleton<ILoggerProvider>(sp =>
    {
        var reportOptions = sp.GetRequiredService<IOptions<ReportMaintenanceOptions>>().Value;
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

var missingOnlyOption = new Option<bool>(name: "--missing-only", getDefaultValue: () => false, description: "Only backfill entries that are missing alignment text/value.");
missingOnlyOption.AddAlias("--MissingOnly");

updateReportsCommand.AddOption(categoryOption);
updateReportsCommand.AddOption(startPrefixOption);
updateReportsCommand.AddOption(missingOnlyOption);
updateReportsCommand.SetHandler(async (string? category, string? startPrefix, bool missingOnly) =>
{
    using var scope = host.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
    await service.UpdateAllReportsAsync(category, startPrefix, missingOnly);
}, categoryOption, startPrefixOption, missingOnlyOption);

var reportOption = new Option<string>(name: "--report", description: "Report file name without extension (e.g., canada_report).");
reportOption.AddAlias("--Report");
reportOption.AddAlias("-Report");
reportOption.IsRequired = true;

var updateReportCommand = new Command("UpdateReport", "Update a single report JSON file using OpenAI suggestions.");
updateReportCommand.AddOption(reportOption);
updateReportCommand.AddOption(categoryOption);
updateReportCommand.AddOption(missingOnlyOption);
updateReportCommand.SetHandler(async (string reportName, string? category, bool missingOnly) =>
{
    using var scope = host.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
    await service.UpdateReportAsync(reportName, category, missingOnly);
}, reportOption, categoryOption, missingOnlyOption);

var backfillMissingCommand = new Command("BackfillMissing", "Backfill only entries with missing alignment text/value across reports.");
backfillMissingCommand.AddOption(categoryOption);
backfillMissingCommand.AddOption(startPrefixOption);
backfillMissingCommand.SetHandler(async (string? category, string? startPrefix) =>
{
    using var scope = host.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
    await service.UpdateAllReportsAsync(category, startPrefix, onlyMissingData: true);
}, categoryOption, startPrefixOption);

var addCountryCommand = new Command("AddCountry", "Create a new country report JSON file with empty entries.");
var countryNameOption = new Option<string>(name: "--country", description: "Country name used for the report slug and title.")
{
    IsRequired = true
};
countryNameOption.AddAlias("--Country");
countryNameOption.AddAlias("-Country");
countryNameOption.AddAlias("--name");
countryNameOption.AddAlias("-n");

var isoOption = new Option<string>(name: "--iso", description: "ISO country code stored in the report header.")
{
    IsRequired = true
};
isoOption.AddAlias("--Iso");
isoOption.AddAlias("-Iso");
isoOption.AddAlias("-i");

addCountryCommand.AddOption(countryNameOption);
addCountryCommand.AddOption(isoOption);
addCountryCommand.SetHandler(async (string country, string iso) =>
{
    using var scope = host.Services.CreateScope();
    var creationService = scope.ServiceProvider.GetRequiredService<ReportCreationService>();
    var updateService = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
    var reportName = await creationService.CreateCountryReportAsync(country, iso);
    await updateService.UpdateReportAsync(reportName);
}, countryNameOption, isoOption);

var addCityCommand = new Command("AddCity", "Create a new city report JSON file, ensuring the parent country exists.");
var cityCountryOption = new Option<string>(name: "--country", description: "Country associated with the new city report.")
{
    IsRequired = true
};
cityCountryOption.AddAlias("--Country");
cityCountryOption.AddAlias("-Country");

var cityNameOption = new Option<string>(name: "--city", description: "City name used for the report slug and title.")
{
    IsRequired = true
};
cityNameOption.AddAlias("--City");
cityNameOption.AddAlias("-City");

var cityIsoOption = new Option<string?>(name: "--iso", description: "Optional ISO code. Required if the country report does not exist.");
cityIsoOption.AddAlias("--Iso");
cityIsoOption.AddAlias("-Iso");

addCityCommand.AddOption(cityCountryOption);
addCityCommand.AddOption(cityNameOption);
addCityCommand.AddOption(cityIsoOption);
addCityCommand.SetHandler(async (string country, string city, string? iso) =>
{
    using var scope = host.Services.CreateScope();
    var creationService = scope.ServiceProvider.GetRequiredService<ReportCreationService>();
    var updateService = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();

    var result = await creationService.CreateCityReportAsync(country, city, iso);
    await updateService.UpdateReportAsync(result.CityReportName);
    if (!string.IsNullOrWhiteSpace(result.CreatedCountryReportName))
    {
        await updateService.UpdateReportAsync(result.CreatedCountryReportName!);
    }
}, cityCountryOption, cityNameOption, cityIsoOption);

var addCategoryCommand = new Command("AddCategory", "Create a new category and seed person weight estimates.");
var categoryNameOptionForAdd = new Option<string>(name: "--name", description: "Display name for the new category.")
{
    IsRequired = true
};
categoryNameOptionForAdd.AddAlias("--Name");
categoryNameOptionForAdd.AddAlias("-n");

var categoryIdOptionForAdd = new Option<string?>(name: "--id", description: "Optional category identifier. Defaults to a slug of the name.");
categoryIdOptionForAdd.AddAlias("--Id");

var categoryOrderOptionForAdd = new Option<int?>(name: "--order", description: "Optional ordering index. Existing categories at or after this value are shifted down.");
categoryOrderOptionForAdd.AddAlias("--Order");

addCategoryCommand.AddOption(categoryNameOptionForAdd);
addCategoryCommand.AddOption(categoryIdOptionForAdd);
addCategoryCommand.AddOption(categoryOrderOptionForAdd);
addCategoryCommand.SetHandler(async (string name, string? id, int? order) =>
{
    using var scope = host.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<CategoryCreationService>();
    await service.CreateCategoryAsync(name, id, order);
}, categoryNameOptionForAdd, categoryIdOptionForAdd, categoryOrderOptionForAdd);

var addCategoryKeyCommand = new Command("AddCategoryKey", "Add a new category key, generate its rating guide, and refresh reports.");
var addKeyCategoryOption = new Option<string>(name: "--category", description: "Category ID or name that will own the key.")
{
    IsRequired = true
};
addKeyCategoryOption.AddAlias("--Category");
addKeyCategoryOption.AddAlias("-Category");
addKeyCategoryOption.AddAlias("-c");

var keyNameOption = new Option<string>(name: "--label", description: "Display label for the new key.")
{
    IsRequired = true
};
keyNameOption.AddAlias("--Label");
keyNameOption.AddAlias("--key-name");
keyNameOption.AddAlias("--KeyName");
keyNameOption.AddAlias("-k");

var keyGuidanceOption = new Option<string?>(name: "--guidance", description: "Optional guidance describing the key's intent.");
keyGuidanceOption.AddAlias("--Guidance");
keyGuidanceOption.AddAlias("-g");

var metricNameOption = new Option<string>(name: "--metric-name", description: "Primary metric name (e.g., 'Net Profit').")
{
    IsRequired = true
};
metricNameOption.AddAlias("--MetricName");
metricNameOption.AddAlias("-m");

var metricUnitOption = new Option<string?>(name: "--metric-unit", description: "Unit or format for the metric (e.g., USD, hours/week).");
metricUnitOption.AddAlias("--MetricUnit");

var metricDirectionOption = new Option<string?>(name: "--metric-direction", description: "How to interpret the metric (e.g., 'higher is better').");
metricDirectionOption.AddAlias("--MetricDirection");

var metricRangeOption = new Option<string?>(name: "--metric-range", description: "Optional range hint or scoring reminder.");
metricRangeOption.AddAlias("--MetricRange");

addCategoryKeyCommand.AddOption(addKeyCategoryOption);
addCategoryKeyCommand.AddOption(keyNameOption);
addCategoryKeyCommand.AddOption(keyGuidanceOption);
addCategoryKeyCommand.AddOption(metricNameOption);
addCategoryKeyCommand.AddOption(metricUnitOption);
addCategoryKeyCommand.AddOption(metricDirectionOption);
addCategoryKeyCommand.AddOption(metricRangeOption);
addCategoryKeyCommand.SetHandler(async (string category, string keyLabel, string? guidance, string metricName, string? metricUnit, string? metricDirection, string? metricRange) =>
{
    using var scope = host.Services.CreateScope();
    var service = scope.ServiceProvider.GetRequiredService<CategoryKeyCreationService>();
    var metric = new MetricDefinition
    {
        Name = metricName,
        Unit = metricUnit,
        Direction = metricDirection,
        RangeHint = metricRange
    };

    await service.AddCategoryKeyAsync(category, keyLabel, guidance, metric);
}, addKeyCategoryOption, keyNameOption, keyGuidanceOption, metricNameOption, metricUnitOption, metricDirectionOption, metricRangeOption);

rootCommand.AddCommand(updateReportsCommand);
rootCommand.AddCommand(updateReportCommand);
rootCommand.AddCommand(backfillMissingCommand);
rootCommand.AddCommand(addCountryCommand);
rootCommand.AddCommand(addCityCommand);
rootCommand.AddCommand(addCategoryCommand);
rootCommand.AddCommand(addCategoryKeyCommand);

return await rootCommand.InvokeAsync(args);
