using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ReportMaintenance.Services;

namespace ReportMaintenance.Commands;

internal static class UpdateKeyCommandBuilder
{
    public static Command Build(IServiceProvider services)
    {
        var reportOption = CommandOptions.CreateReportOption();
        var keyOption = CommandOptions.CreateKeyOption();
        var categoryOption = CommandOptions.CreateCategoryOption();

        var command = new Command("UpdateKey", "Update a single key within a report using OpenAI suggestions.");
        command.AddOption(reportOption);
        command.AddOption(keyOption);
        command.AddOption(categoryOption);
        command.SetHandler(async (string reportName, string key, string? category) =>
        {
            using var scope = services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
            await service.UpdateSingleEntryAsync(reportName, key, category);
        }, reportOption, keyOption, categoryOption);

        return command;
    }
}
