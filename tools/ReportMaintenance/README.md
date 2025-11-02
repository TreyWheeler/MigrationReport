# Report Maintenance CLI

The Report Maintenance CLI is a .NET console application that automates SOP-driven updates to the migration report JSON files. It loads the household family profile, rating-guide expectations, and the existing report entries, then orchestrates OpenAI calls to refresh each alignment value and narrative.

## Prerequisites

- [.NET SDK 8.0](https://dotnet.microsoft.com/en-us/download) or later
- An OpenAI API key with access to the configured model (default: `gpt-4.1-mini`)
- Repository data kept up to date (`reports/*.json`, `data/rating_guides.json`, `family_profile.json`)

## Project layout

```
tools/
  ReportMaintenance/
    ReportMaintenance.Cli/
      Program.cs              # Entry point and command routing
      Configuration/          # Strongly typed configuration objects
      Data/                   # JSON models (reports, rating guides, family profile)
      Services/               # File I/O, context construction, orchestration
      OpenAI/                 # API client that builds SOP-aligned prompts
      appsettings.json        # Default relative paths and OpenAI defaults
```

The CLI is built with `System.CommandLine` so new commands can be added following SOP extensions (see `SOPs/` in the repository for reference material).

## Configuration

Settings can be provided in three ways (later entries override earlier ones):

1. `appsettings.json`
2. `appsettings.{Environment}.json`
3. Environment variables prefixed with `REPORT_MAINTENANCE_`

### Key settings

| Setting | Description |
|---------|-------------|
| `ReportMaintenance:ReportsDirectory` | Path to the folder containing `*_report.json` files. Defaults to `reports` relative to the working directory. |
| `ReportMaintenance:RatingGuidesPath` | Path to `data/rating_guides.json`. |
| `ReportMaintenance:FamilyProfilePath` | Path to `family_profile.json`. |
| `OpenAI:ApiKey` | Secret token used for API calls. **Must be supplied** (e.g., environment variable `REPORT_MAINTENANCE_OPENAI__APIKEY`). |
| `OpenAI:Model` | Chat/completions model identifier. |
| `OpenAI:Temperature` | Controls response creativity (default `0.4`). |
| `OpenAI:BaseUrl` | Override for custom OpenAI-compatible endpoints. |

### Example environment setup

```bash
export REPORT_MAINTENANCE_OPENAI__APIKEY="sk-..."
export REPORT_MAINTENANCE_OPENAI__MODEL="gpt-4.1-mini"
```

## Usage

Run the CLI from the repository root so the default relative paths resolve correctly.

```bash
# Update every report file (mirrors SOP bulk refresh workflow)
dotnet run --project tools/ReportMaintenance/ReportMaintenance.Cli -- UpdateReports

# Update a specific report (e.g., canada_report.json)
dotnet run --project tools/ReportMaintenance/ReportMaintenance.Cli -- UpdateReport -Report canada_report
```

### Command reference

- `UpdateReports`: Iterates over every `*_report.json` file, constructing the family/location context once per report and sending sequential OpenAI prompts for each key.
- `UpdateReport -Report <name>`: Targets a single report. Provide the file stem (omit `.json`).

Both commands:

1. Load the family profile and rating guides to build a reusable prompt package so shared context is not regenerated for every key.
2. Load the report JSON, then for each key:
   - Attach the existing alignment text/value and the relevant rating-guide ladder.
   - Call the OpenAI API and parse the structured JSON response (`alignmentValue`, `alignmentText`, `sameAsParent`).
   - Update the in-memory document.
3. Persist changes back to the source file once all keys succeed. Failures are logged and the original content is retained for manual follow-up as required by SOP QA steps.

## Extending the CLI

- New SOP commands can be added by creating additional `Command` instances in `Program.cs` and implementing dedicated services.
- Use the existing `ReportContextFactory` to keep family, location, and rating guide data synchronized across features.
- When introducing new OpenAI workflows, prefer the `IOpenAIAlignmentClient` abstraction so prompts and retry logic remain centralized.

## Troubleshooting

- **API key missing**: The CLI throws an error before making requests. Confirm the `REPORT_MAINTENANCE_OPENAI__APIKEY` environment variable is set.
- **File not found**: Ensure you run commands from the repository root or override the paths via configuration.
- **Rate limiting**: The OpenAI client includes exponential backoff. For large runs consider lowering concurrency (currently single-threaded) or batching reports per SOP guidance.

## Testing roadmap

Future iterations should introduce unit tests for:

- JSON parsing and serialization round-trips (`ReportRepository`)
- Prompt assembly (`OpenAIAlignmentClient` and `ReportContextFactory`)
- Command routing (System.CommandLine handler bindings)

Mock the OpenAI client to avoid live API calls during automated checks.
