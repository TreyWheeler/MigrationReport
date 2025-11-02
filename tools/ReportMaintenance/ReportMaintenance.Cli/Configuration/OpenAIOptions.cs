namespace ReportMaintenance.Configuration;

public sealed class OpenAIOptions
{
    public string? ApiKey { get; set; }

    public string Model { get; set; } = "gpt-5-nano";

    public string BaseUrl { get; set; } = "https://api.openai.com/v1";

    public double Temperature { get; set; } = 1.0;

    public int MaxRetryCount { get; set; } = 3;
}
