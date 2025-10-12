[CmdletBinding()]
param(
    [string[]]$Keys,
    [switch]$AsJson
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'rating_guides.json' -RootProperty 'ratingGuides'

$results = $table.Items
if ($Keys -and $Keys.Count -gt 0) {
    $normalized = $Keys | ForEach-Object { [string]$_ }
    $results = $results | Where-Object { $normalized -contains $_.key }
}

if ($AsJson.IsPresent) {
    $results | ConvertTo-Json -Depth 10
}
else {
    $results
}
