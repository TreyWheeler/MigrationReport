using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.OpenAI;
using ReportMaintenance.Services;

namespace ReportMaintenance;

public static class DependencyInjection
{
    public static IServiceCollection AddReportMaintenanceCore(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ReportMaintenanceOptions>(configuration.GetSection("ReportMaintenance"));
        services.Configure<OpenAIOptions>(configuration.GetSection("OpenAI"));

        services.AddSingleton<IReportRepository, FileReportRepository>();
        services.AddSingleton<IRatingGuideProvider, RatingGuideProvider>();
        services.AddSingleton<IFamilyProfileProvider, FamilyProfileProvider>();
        services.AddSingleton<IKeyDefinitionProvider, KeyDefinitionProvider>();
        services.AddSingleton<ReportContextFactory>();
        services.AddSingleton<ReportUpdateService>();
        services.AddSingleton<ICategoryKeyProvider, CategoryKeyProvider>();
        services.AddSingleton<ReportCreationService>();
        services.AddSingleton<CategoryCreationService>();
        services.AddSingleton<CategoryKeyCreationService>();
        services.AddSingleton<ILocationMetadataService, LocationMetadataService>();
        services.AddSingleton<IAlignmentSuggestionCache>(sp =>
        {
            var options = sp.GetRequiredService<IOptions<ReportMaintenanceOptions>>().Value;
            if (string.IsNullOrWhiteSpace(options.ContextCachePath))
            {
                return NoopAlignmentSuggestionCache.Instance;
            }

            return ActivatorUtilities.CreateInstance<FileAlignmentSuggestionCache>(sp);
        });

        services.AddHttpClient<IOpenAIAlignmentClient, OpenAIAlignmentClient>();
        services.AddHttpClient<IOpenAIRatingGuideClient, OpenAIRatingGuideClient>();

        return services;
    }
}
