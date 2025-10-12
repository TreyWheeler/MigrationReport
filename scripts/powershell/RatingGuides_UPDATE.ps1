[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Records
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'rating_guides.json' -RootProperty 'ratingGuides'

foreach ($record in $Records) {
    $psRecord = Normalize-ToPsObject $record
    Assert-PropertyPresence -Record $psRecord -PropertyNames @('key')

    $existing = $table.Items | Where-Object { $_.key -eq $psRecord.key }
    if (-not $existing) {
        throw "Rating guide for key '$($psRecord.key)' was not found."
    }

    foreach ($property in $psRecord.PSObject.Properties) {
        if ($property.Name -eq 'key') { continue }
        $value = if ($property.Name -eq 'ratingGuide') { @($property.Value) } else { $property.Value }
        $existing | Add-Member -NotePropertyName $property.Name -NotePropertyValue $value -Force
    }
}

Save-JsonTable -Table $table -RootProperty 'ratingGuides'
