using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ReportMaintenance.Services;

namespace ReportMaintenance.Commands;

internal static class UpdateReportCommandBuilder
{
    public static Command Build(IServiceProvider services)
    {
        var reportOption = CommandOptions.CreateReportOption();
        var categoryOption = CommandOptions.CreateCategoryOption();

        var command = new Command("UpdateReport", "Update a single report JSON file using OpenAI suggestions.");
        command.AddOption(reportOption);
        command.AddOption(categoryOption);
        command.SetHandler(async (string reportName, string? category) =>
        {
            using var scope = services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<ReportUpdateService>();
            await service.UpdateReportAsync(reportName, category);
        }, reportOption, categoryOption);

        return command;
    }
}
