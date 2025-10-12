[CmdletBinding()]
param(
    [string[]]$Ids,
    [switch]$AsJson
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'categories.json' -RootProperty 'categories'

$results = $table.Items
if ($Ids -and $Ids.Count -gt 0) {
    $normalized = $Ids | ForEach-Object { [string]$_ }
    $results = $results | Where-Object { $normalized -contains $_.id }
}

if ($AsJson.IsPresent) {
    $results | ConvertTo-Json -Depth 10
}
else {
    $results
}
