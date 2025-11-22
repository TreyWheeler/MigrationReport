using System.CommandLine;

namespace ReportMaintenance.Commands;

internal static class CommandOptions
{
    public static Option<string?> CreateCategoryOption()
    {
        var option = new Option<string?>(name: "--category", description: "Restrict updates to a category (ID or name) or single entry key.");
        option.AddAlias("--Category");
        option.AddAlias("-Category");
        option.AddAlias("-c");
        return option;
    }

    public static Option<string?> CreateStartPrefixOption()
    {
        var option = new Option<string?>(name: "--start-prefix", description: "Resume when report file names reach this prefix (case-insensitive).");
        option.AddAlias("--StartPrefix");
        option.AddAlias("-StartPrefix");
        option.AddAlias("-s");
        return option;
    }

    public static Option<string> CreateReportOption(bool required = true)
    {
        var option = new Option<string>(name: "--report", description: "Report file name without extension (e.g., canada_report).");
        option.AddAlias("--Report");
        option.AddAlias("-Report");
        option.IsRequired = required;
        return option;
    }

    public static Option<string> CreateKeyOption()
    {
        var option = new Option<string>(name: "--key", description: "Key identifier to refresh (category key ID or label).");
        option.AddAlias("--Key");
        option.AddAlias("-Key");
        option.AddAlias("-k");
        option.IsRequired = true;
        return option;
    }

    public static Option<string> CreateCountryOption()
    {
        var option = new Option<string>(name: "--country", description: "Country name used for the report slug and title.")
        {
            IsRequired = true
        };
        option.AddAlias("--Country");
        option.AddAlias("-Country");
        option.AddAlias("--name");
        option.AddAlias("-n");
        return option;
    }

    public static Option<string> CreateIsoOption(bool required)
    {
        var option = new Option<string>(name: "--iso", description: "ISO country code stored in the report header.")
        {
            IsRequired = required
        };
        option.AddAlias("--Iso");
        option.AddAlias("-Iso");
        option.AddAlias("-i");
        return option;
    }

    public static Option<string> CreateCityOption()
    {
        var option = new Option<string>(name: "--city", description: "City name used for the report slug and title.")
        {
            IsRequired = true
        };
        option.AddAlias("--City");
        option.AddAlias("-City");
        return option;
    }

    public static Option<string> CreateCategoryNameOption()
    {
        var option = new Option<string>(name: "--name", description: "Display name for the new category.")
        {
            IsRequired = true
        };
        option.AddAlias("--Name");
        option.AddAlias("-n");
        return option;
    }

    public static Option<string?> CreateCategoryIdOption()
    {
        var option = new Option<string?>(name: "--id", description: "Optional category identifier. Defaults to a slug of the name.");
        option.AddAlias("--Id");
        return option;
    }

    public static Option<int?> CreateCategoryOrderOption()
    {
        var option = new Option<int?>(name: "--order", description: "Optional ordering index. Existing categories at or after this value are shifted down.");
        option.AddAlias("--Order");
        return option;
    }

    public static Option<string> CreateKeyLabelOption()
    {
        var option = new Option<string>(name: "--label", description: "Display label for the new key.")
        {
            IsRequired = true
        };
        option.AddAlias("--Label");
        option.AddAlias("--key-name");
        option.AddAlias("--KeyName");
        option.AddAlias("-k");
        return option;
    }

    public static Option<string?> CreateGuidanceOption()
    {
        var option = new Option<string?>(name: "--guidance", description: "Optional guidance describing the key's intent.");
        option.AddAlias("--Guidance");
        option.AddAlias("-g");
        return option;
    }
}
