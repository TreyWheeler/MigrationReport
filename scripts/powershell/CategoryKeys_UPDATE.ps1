[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Records
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'category_keys.json' -RootProperty 'categoryKeys'

foreach ($record in $Records) {
    $psRecord = Normalize-ToPsObject $record
    Assert-PropertyPresence -Record $psRecord -PropertyNames @('id')

    $existing = $table.Items | Where-Object { $_.id -eq $psRecord.id }
    if (-not $existing) {
        throw "Category key with id '$($psRecord.id)' was not found."
    }

    foreach ($property in $psRecord.PSObject.Properties) {
        if ($property.Name -eq 'id') { continue }
        $existing | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value -Force
    }
}

Save-JsonTable -Table $table -RootProperty 'categoryKeys'
