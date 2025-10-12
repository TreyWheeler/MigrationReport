[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][array]$Ids
)

. (Join-Path $PSScriptRoot 'JsonTableHelpers.ps1')

$table = Get-JsonTable -FileName 'people.json' -RootProperty 'people'

$normalizedIds = @()
foreach ($id in $Ids) {
    if ($id -is [string]) {
        $normalizedIds += $id
    }
    elseif ($id -is [psobject] -and $id.PSObject.Properties['id']) {
        $normalizedIds += [string]$id.id
    }
    else {
        throw "Invalid identifier supplied: $id"
    }
}

$table.Items = [System.Collections.ArrayList]@(
    $table.Items | Where-Object { $normalizedIds -notcontains $_.id }
)

Save-JsonTable -Table $table -RootProperty 'people'
