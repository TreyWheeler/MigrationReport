Report Maintenance CLI
======================

Run this CLI from the repository root so relative paths resolve (reports, data, cache).

Prerequisites
-------------
- .NET SDK 8.0+
- OpenAI API key available as `REPORT_MAINTENANCE_OPENAI__APIKEY`

Defaults and paths
------------------
- Reports: `reports/*.json`
- Rating guides: `data/rating_guides.json`
- Family profile: `family_profile.json`
- Cache: `cache/alignmentSuggestions.json`
- Environment: set `DOTNET_ENVIRONMENT=Development` when using the bundled dev settings.

Core commands
-------------
- Update every report:
  `DOTNET_ENVIRONMENT=Development dotnet run --project tools/ReportMaintenance/ReportMaintenance.Cli -- UpdateReports`
- Update a single report (omit `.json`):
  `DOTNET_ENVIRONMENT=Development dotnet run --project tools/ReportMaintenance/ReportMaintenance.Cli -- UpdateReport -Report united_states_report`
- Restrict updates to a category or key:
  add `-Category <id-or-name>` to either command.
- Resume from a filename prefix (bulk runs):
  add `-StartPrefix <prefix>` to `UpdateReports`.

Tuning options (env overrides)
------------------------------
- `REPORT_MAINTENANCE_REPORTMAINTENANCE__MAXCONCURRENTREPORTS` (default 6)
- `REPORT_MAINTENANCE_REPORTMAINTENANCE__MAXCONCURRENTENTRIES` (default 16)
- `REPORT_MAINTENANCE_OPENAI__MODEL`, `REPORT_MAINTENANCE_OPENAI__TEMPERATURE`, `REPORT_MAINTENANCE_OPENAI__BASEURL`

Logs
----
Logs write to `logs/report-maintenance_YYYYMMDD.log` by default. Tail this file to watch progress.
