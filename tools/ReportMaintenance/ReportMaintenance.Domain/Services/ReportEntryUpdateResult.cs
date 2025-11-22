using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public sealed record ReportEntryUpdateResult(
    string ReportName,
    string Key,
    bool IsUpdated,
    string Message,
    ReportEntry? Entry)
{
    public static ReportEntryUpdateResult Updated(string reportName, string key, ReportEntry entry) =>
        new(reportName, key, true, "Updated", entry);

    public static ReportEntryUpdateResult Unchanged(string reportName, string key, ReportEntry entry) =>
        new(reportName, key, false, "No changes detected", entry);

    public static ReportEntryUpdateResult NotUpdated(string reportName, string key, string message) =>
        new(reportName, key, false, message, null);
}
