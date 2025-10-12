[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Records
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'rating_guides.json' -RootProperty 'ratingGuides'

foreach ($record in $Records) {
    $psRecord = Normalize-ToPsObject $record
    Assert-PropertyPresence -Record $psRecord -PropertyNames @('key', 'ratingGuide')

    $existing = $table.Items | Where-Object { $_.key -eq $psRecord.key }
    if ($existing) {
        throw "Rating guide for key '$($psRecord.key)' already exists."
    }

    $newItem = [ordered]@{
        key = $psRecord.key
        ratingGuide = @($psRecord.ratingGuide)
    }

    if ($psRecord.PSObject.Properties['considerations']) {
        $newItem.considerations = $psRecord.considerations
    }

    [void]$table.Items.Add([pscustomobject]$newItem)
}

Save-JsonTable -Table $table -RootProperty 'ratingGuides'
