[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Records
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'cities.json' -RootProperty 'cities'

foreach ($record in $Records) {
    $psRecord = Normalize-ToPsObject $record
    Assert-PropertyPresence -Record $psRecord -PropertyNames @('id', 'countryId', 'name', 'report')

    if ($table.Items | Where-Object { $_.id -eq $psRecord.id }) {
        throw "City with id '$($psRecord.id)' already exists."
    }

    $newItem = [ordered]@{
        id = $psRecord.id
        countryId = $psRecord.countryId
        name = $psRecord.name
        report = $psRecord.report
    }

    [void]$table.Items.Add([pscustomobject]$newItem)
}

Save-JsonTable -Table $table -RootProperty 'cities'
