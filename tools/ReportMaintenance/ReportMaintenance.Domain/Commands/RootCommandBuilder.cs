using System.CommandLine;

namespace ReportMaintenance.Commands;

public static class RootCommandBuilder
{
    public static RootCommand Build(IServiceProvider services)
    {
        var rootCommand = new RootCommand("CLI utilities for updating migration reports with SOP-aligned automation.");

        rootCommand.AddCommand(UpdateReportsCommandBuilder.Build(services));
        rootCommand.AddCommand(UpdateReportCommandBuilder.Build(services));
        rootCommand.AddCommand(UpdateKeyCommandBuilder.Build(services));
        rootCommand.AddCommand(AddCountryCommandBuilder.Build(services));
        rootCommand.AddCommand(AddCityCommandBuilder.Build(services));
        rootCommand.AddCommand(AddCategoryCommandBuilder.Build(services));
        rootCommand.AddCommand(AddCategoryKeyCommandBuilder.Build(services));

        return rootCommand;
    }
}
