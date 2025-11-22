using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ReportMaintenance.Services;

namespace ReportMaintenance.Commands;

internal static class AddCategoryCommandBuilder
{
    public static Command Build(IServiceProvider services)
    {
        var nameOption = CommandOptions.CreateCategoryNameOption();
        var idOption = CommandOptions.CreateCategoryIdOption();
        var orderOption = CommandOptions.CreateCategoryOrderOption();

        var command = new Command("AddCategory", "Create a new category and seed person weight estimates.");
        command.AddOption(nameOption);
        command.AddOption(idOption);
        command.AddOption(orderOption);
        command.SetHandler(async (string name, string? id, int? order) =>
        {
            using var scope = services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<CategoryCreationService>();
            await service.CreateCategoryAsync(name, id, order);
        }, nameOption, idOption, orderOption);

        return command;
    }
}
