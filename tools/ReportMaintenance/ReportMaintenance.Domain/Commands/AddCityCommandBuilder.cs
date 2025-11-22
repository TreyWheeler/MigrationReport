using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ReportMaintenance.Services;

namespace ReportMaintenance.Commands;

internal static class AddCityCommandBuilder
{
    public static Command Build(IServiceProvider services)
    {
        var countryOption = CommandOptions.CreateCountryOption();
        var cityOption = CommandOptions.CreateCityOption();
        var isoOption = CommandOptions.CreateIsoOption(required: false);

        var command = new Command("AddCity", "Create a new city report JSON file, ensuring the parent country exists.");
        command.AddOption(countryOption);
        command.AddOption(cityOption);
        command.AddOption(isoOption);
        command.SetHandler(async (string country, string city, string? iso) =>
        {
            using var scope = services.CreateScope();
            var creationService = scope.ServiceProvider.GetRequiredService<ReportCreationService>();
            var updateService = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();

            var result = await creationService.CreateCityReportAsync(country, city, iso);
            await updateService.UpdateReportAsync(result.CityReportName);
            if (!string.IsNullOrWhiteSpace(result.CreatedCountryReportName))
            {
                await updateService.UpdateReportAsync(result.CreatedCountryReportName!);
            }
        }, countryOption, cityOption, isoOption);

        return command;
    }
}
