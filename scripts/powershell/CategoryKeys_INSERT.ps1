[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Records
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'category_keys.json' -RootProperty 'categoryKeys'

foreach ($record in $Records) {
    $psRecord = Normalize-ToPsObject $record
    Assert-PropertyPresence -Record $psRecord -PropertyNames @('id', 'categoryId', 'name')

    if ($table.Items | Where-Object { $_.id -eq $psRecord.id }) {
        throw "Category key with id '$($psRecord.id)' already exists."
    }

    $newItem = [ordered]@{
        id = $psRecord.id
        categoryId = $psRecord.categoryId
        name = $psRecord.name
    }

    if ($psRecord.PSObject.Properties['order']) {
        $newItem['order'] = [int]$psRecord.order
    }

    if ($psRecord.PSObject.Properties['guidance']) {
        $newItem['guidance'] = $psRecord.guidance
    }

    [void]$table.Items.Add([pscustomobject]$newItem)
}

Save-JsonTable -Table $table -RootProperty 'categoryKeys'
