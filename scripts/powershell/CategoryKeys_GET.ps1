[CmdletBinding()]
param(
    [string[]]$Ids,
    [string[]]$CategoryIds,
    [switch]$AsJson
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'category_keys.json' -RootProperty 'category_keys'

$results = $table.Items
if ($Ids -and $Ids.Count -gt 0) {
    $normalized = $Ids | ForEach-Object { [string]$_ }
    $results = $results | Where-Object { $normalized -contains $_.id }
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
