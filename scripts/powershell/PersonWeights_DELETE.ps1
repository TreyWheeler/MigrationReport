[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Keys
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'person_weights.json' -RootProperty 'personWeights'

$normalized = @()
foreach ($key in $Keys) {
    $psKey = Normalize-ToPsObject $key
    Assert-PropertyPresence -Record $psKey -PropertyNames @('personId', 'categoryId')
    $normalized += ,@($psKey.personId, $psKey.categoryId)
}

$table.Items = [System.Collections.ArrayList]@(
    $table.Items | Where-Object {
        $match = $false
        foreach ($pair in $normalized) {
            if ($_.personId -eq $pair[0] -and $_.categoryId -eq $pair[1]) {
                $match = $true
                break
            }
        }
        -not $match
    }
)

Save-JsonTable -Table $table -RootProperty 'personWeights'
