[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Records
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'person_weights.json' -RootProperty 'personWeights'

foreach ($record in $Records) {
    $psRecord = Normalize-ToPsObject $record
    Assert-PropertyPresence -Record $psRecord -PropertyNames @('personId', 'categoryId', 'weight')

    $exists = $table.Items | Where-Object { $_.personId -eq $psRecord.personId -and $_.categoryId -eq $psRecord.categoryId }
    if ($exists) {
        throw "Weight for personId '$($psRecord.personId)' and categoryId '$($psRecord.categoryId)' already exists."
    }

    $newItem = [ordered]@{
        personId = $psRecord.personId
        categoryId = $psRecord.categoryId
        weight = $psRecord.weight
    }

    [void]$table.Items.Add([pscustomobject]$newItem)
}

Save-JsonTable -Table $table -RootProperty 'personWeights'
