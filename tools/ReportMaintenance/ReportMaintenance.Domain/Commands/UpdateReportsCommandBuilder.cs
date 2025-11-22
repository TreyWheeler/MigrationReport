using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ReportMaintenance.Services;

namespace ReportMaintenance.Commands;

internal static class UpdateReportsCommandBuilder
{
    public static Command Build(IServiceProvider services)
    {
        var categoryOption = CommandOptions.CreateCategoryOption();
        var startPrefixOption = CommandOptions.CreateStartPrefixOption();

        var command = new Command("UpdateReports", "Update every report JSON file using OpenAI suggestions.");
        command.AddOption(categoryOption);
        command.AddOption(startPrefixOption);
        command.SetHandler(async (string? category, string? startPrefix) =>
        {
            using var scope = services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
            await service.UpdateAllReportsAsync(category, startPrefix);
        }, categoryOption, startPrefixOption);

        return command;
    }
}
