function Get-JsonTable {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [Parameter(Mandatory = $true)][string]$RootProperty
    )

    $repoRoot = Split-Path (Join-Path $PSScriptRoot '..') -Parent
    $dataPath = Join-Path $repoRoot "data/$FileName"
    if (-not (Test-Path -Path $dataPath)) {
        throw "Data file '$dataPath' not found."
    }

    $raw = Get-Content -Path $dataPath -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) {
        $wrapper = [ordered]@{}
        $wrapper[$RootProperty] = @()
    }
    else {
        $wrapper = $raw | ConvertFrom-Json -Depth 10
    }

    $items = $wrapper.$RootProperty
    if ($null -eq $items) {
        $items = @()
    }

    return [pscustomobject]@{
        Path = $dataPath
        Wrapper = $wrapper
        Items = [System.Collections.ArrayList]@($items)
    }
}

function Save-JsonTable {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][psobject]$Table,
        [Parameter(Mandatory = $true)][string]$RootProperty
    )

    $output = [ordered]@{}
    $output[$RootProperty] = @($Table.Items)
    $json = $output | ConvertTo-Json -Depth 10
    Set-Content -Path $Table.Path -Value ($json + "`n") -Encoding UTF8
}

function Assert-PropertyPresence {
    param(
        [psobject]$Record,
        [string[]]$PropertyNames
    )

    foreach ($name in $PropertyNames) {
        $property = $Record.PSObject.Properties[$name]
        if ($null -eq $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) {
            throw "Record is missing required property '$name'."
        }
    }
}

function Normalize-ToPsObject {
    param([object]$Record)

    if ($Record -is [psobject]) {
        return $Record
    }

    if ($Record -is [hashtable]) {
        return [pscustomobject]$Record
    }

    throw "Unsupported record type '$($Record.GetType().FullName)'."
}
