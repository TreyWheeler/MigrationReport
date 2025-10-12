[CmdletBinding()]
param(
    [string[]]$Ids,
    [string[]]$CountryIds,
    [switch]$AsJson
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'cities.json' -RootProperty 'cities'

$results = $table.Items
if ($Ids -and $Ids.Count -gt 0) {
    $normalized = $Ids | ForEach-Object { [string]$_ }
    $results = $results | Where-Object { $normalized -contains $_.id }
}

if ($CountryIds -and $CountryIds.Count -gt 0) {
    $normalizedCountries = $CountryIds | ForEach-Object { [string]$_ }
    $results = $results | Where-Object { $normalizedCountries -contains $_.countryId }
}

if ($AsJson.IsPresent) {
    $results | ConvertTo-Json -Depth 10
}
else {
    $results
}
