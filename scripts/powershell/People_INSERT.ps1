[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Records
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'people.json' -RootProperty 'people'

foreach ($record in $Records) {
    $psRecord = Normalize-ToPsObject $record
    Assert-PropertyPresence -Record $psRecord -PropertyNames @('id', 'name')

    if ($table.Items | Where-Object { $_.id -eq $psRecord.id }) {
        throw "Person with id '$($psRecord.id)' already exists."
    }

    $newItem = [ordered]@{
        id = $psRecord.id
        name = $psRecord.name
    }

    [void]$table.Items.Add([pscustomobject]$newItem)
}

Save-JsonTable -Table $table -RootProperty 'people'
