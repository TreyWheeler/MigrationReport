[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Records
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'categories.json' -RootProperty 'categories'

foreach ($record in $Records) {
    $psRecord = Normalize-ToPsObject $record
    Assert-PropertyPresence -Record $psRecord -PropertyNames @('id', 'name')

    if ($table.Items | Where-Object { $_.id -eq $psRecord.id }) {
        throw "Category with id '$($psRecord.id)' already exists."
    }

    $newItem = [ordered]@{
        id = $psRecord.id
        name = $psRecord.name
    }

    if ($psRecord.PSObject.Properties['order']) {
        $newItem['order'] = $psRecord.order
    }

    [void]$table.Items.Add([pscustomobject]$newItem)
}

Save-JsonTable -Table $table -RootProperty 'categories'
