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
    ReportMaintenance.Domain/  # Shared domain services, commands, and abstractions
      Configuration/           # Strongly typed configuration objects
      Data/                    # JSON models (reports, rating guides, family profile)
      Services/                # File I/O, context construction, orchestration
      OpenAI/                  # API client that builds SOP-aligned prompts
      Commands/                # System.CommandLine command builders used by the CLI entry point
    ReportMaintenance.Cli/     # Console entry point (pulls commands from the domain library)
      Program.cs
      appsettings.json         # Default relative paths and OpenAI defaults
    ReportMaintenance.Api/     # Minimal API host (regeneration endpoint and Swagger)
      Program.cs
      Properties/launchSettings.json
```

The CLI is built with `System.CommandLine` via the shared domain command builders (see `ReportMaintenance.Domain/Commands`). The API host shares the same domain services so it no longer shells out to the CLI.

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

# Update a single key within a report
dotnet run --project tools/ReportMaintenance/ReportMaintenance.Cli -- UpdateKey -Report canada_report -Key cost_of_living_family_150m2_in_city_center
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

## HTTP regeneration API (for the UI regenerate button)

To drive single-key refreshes from the UI, start the lightweight API host:

```
dotnet run --project tools/ReportMaintenance/ReportMaintenance.Api
```

By default it listens on `http://localhost:5075` (matching the UI's default regenerate endpoint) and exposes:

- `POST /api/regenerate` with JSON body `{ "report": "canada_report", "keyId": "cost_of_living_family_150m2_in_city_center", "category": "Cost of Living" }`
- `GET /api/health` for a simple readiness check.

Open http://localhost:5075/swagger for an interactive contract view and quick manual testing.

The frontend looks for a regeneration endpoint in this order:

1. `window.__MIGRATION_REPORT_REGENERATE_ENDPOINT__` (set in the browser console or injected before `script.js`)
2. `localStorage.regenerateEndpoint`
3. Fallback to `http://localhost:5075/api/regenerate`

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
