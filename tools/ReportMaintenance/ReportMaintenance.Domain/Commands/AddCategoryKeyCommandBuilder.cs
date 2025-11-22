using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ReportMaintenance.Services;

namespace ReportMaintenance.Commands;

internal static class AddCategoryKeyCommandBuilder
{
    public static Command Build(IServiceProvider services)
    {
        var categoryOption = CommandOptions.CreateCategoryOption();
        var keyLabelOption = CommandOptions.CreateKeyLabelOption();
        var guidanceOption = CommandOptions.CreateGuidanceOption();

        var command = new Command("AddCategoryKey", "Add a new category key, generate its rating guide, and refresh reports.");
        command.AddOption(categoryOption);
        command.AddOption(keyLabelOption);
        command.AddOption(guidanceOption);
        command.SetHandler(async (string category, string keyLabel, string? guidance) =>
        {
            using var scope = services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<CategoryKeyCreationService>();
            await service.AddCategoryKeyAsync(category, keyLabel, guidance);
        }, categoryOption, keyLabelOption, guidanceOption);

        return command;
    }
}
