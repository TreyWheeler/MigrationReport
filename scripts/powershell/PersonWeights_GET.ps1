[CmdletBinding()]
param(
    [string[]]$PersonIds,
    [string[]]$CategoryIds,
    [switch]$AsJson
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'person_weights.json' -RootProperty 'person_weights'

$results = $table.Items
if ($PersonIds -and $PersonIds.Count -gt 0) {
    $normalizedPeople = $PersonIds | ForEach-Object { [string]$_ }
    $results = $results | Where-Object { $normalizedPeople -contains $_.personId }
}

if ($CategoryIds -and $CategoryIds.Count -gt 0) {
    $normalizedCategories = $CategoryIds | ForEach-Object { [string]$_ }
    $results = $results | Where-Object { $normalizedCategories -contains $_.categoryId }
}

if ($AsJson.IsPresent) {
    $results | ConvertTo-Json -Depth 10
}
else {
    $results
}
