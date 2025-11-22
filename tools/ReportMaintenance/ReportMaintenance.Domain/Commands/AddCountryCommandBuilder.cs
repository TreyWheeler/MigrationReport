using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ReportMaintenance.Services;

namespace ReportMaintenance.Commands;

internal static class AddCountryCommandBuilder
{
    public static Command Build(IServiceProvider services)
    {
        var countryOption = CommandOptions.CreateCountryOption();
        var isoOption = CommandOptions.CreateIsoOption(required: true);

        var command = new Command("AddCountry", "Create a new country report JSON file with empty entries.");
        command.AddOption(countryOption);
        command.AddOption(isoOption);
        command.SetHandler(async (string country, string iso) =>
        {
            using var scope = services.CreateScope();
            var creationService = scope.ServiceProvider.GetRequiredService<ReportCreationService>();
            var updateService = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
            var reportName = await creationService.CreateCountryReportAsync(country, iso);
            await updateService.UpdateReportAsync(reportName);
        }, countryOption, isoOption);

        return command;
    }
}
