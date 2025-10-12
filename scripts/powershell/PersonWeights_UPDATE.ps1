[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Records
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'person_weights.json' -RootProperty 'personWeights'

foreach ($record in $Records) {
    $psRecord = Normalize-ToPsObject $record
    Assert-PropertyPresence -Record $psRecord -PropertyNames @('personId', 'categoryId')

    $existing = $table.Items | Where-Object { $_.personId -eq $psRecord.personId -and $_.categoryId -eq $psRecord.categoryId }
    if (-not $existing) {
        throw "Weight for personId '$($psRecord.personId)' and categoryId '$($psRecord.categoryId)' was not found."
    }

    foreach ($property in $psRecord.PSObject.Properties) {
        if ($property.Name -in @('personId', 'categoryId')) { continue }
        $existing | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value -Force
    }
}

Save-JsonTable -Table $table -RootProperty 'personWeights'
