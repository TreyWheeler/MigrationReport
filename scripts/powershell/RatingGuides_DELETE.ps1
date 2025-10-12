[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Keys
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'rating_guides.json' -RootProperty 'ratingGuides'

$normalizedKeys = @()
foreach ($key in $Keys) {
    if ($key -is [string]) {
        $normalizedKeys += $key
    }
    elseif ($key -is [psobject] -and $key.PSObject.Properties['key']) {
        $normalizedKeys += [string]$key.key
    }
    else {
        throw "Invalid key identifier supplied: $key"
    }
}

$table.Items = [System.Collections.ArrayList]@(
    $table.Items | Where-Object { $normalizedKeys -notcontains $_.key }
)

Save-JsonTable -Table $table -RootProperty 'ratingGuides'
