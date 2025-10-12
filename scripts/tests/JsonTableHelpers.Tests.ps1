$ErrorActionPreference = 'Stop'

$helpersRoot = Join-Path $PSScriptRoot '..'
$helpersPath = Join-Path $helpersRoot 'powershell/JsonTableHelpers.ps1'
. $helpersPath

Describe 'Get-JsonTable' {
    It 'loads JSON data from the repository data folder' {
        $table = Get-JsonTable -FileName 'people.json' -RootProperty 'people'
        $table.Path | Should -Match 'data/people.json'
        $table.Items.Count | Should -BeGreaterThan 0
    }

    It 'throws a descriptive error when the file does not exist' {
        { Get-JsonTable -FileName 'missing.json' -RootProperty 'items' } | Should -Throw -ErrorMessage "Data file"
    }
}

Describe 'Save-JsonTable' {
    $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) (([System.IO.Path]::GetRandomFileName()) + '.json')
    $table = [pscustomobject]@{
        Path = $tempFile
        Items = [System.Collections.ArrayList]@([pscustomobject]@{ id = 1; name = 'Test' })
    }

    It 'writes the JSON wrapper with the provided root property' {
        Save-JsonTable -Table $table -RootProperty 'items'
        Test-Path $tempFile | Should -BeTrue
        $json = Get-Content -Path $tempFile -Raw | ConvertFrom-Json
        $json.items.Count | Should -Be 1
        $json.items[0].name | Should -Be 'Test'
    }

    AfterAll {
        if (Test-Path $tempFile) {
            Remove-Item $tempFile -Force
        }
    }
}

Describe 'Assert-PropertyPresence' {
    It 'throws when a required property is missing or empty' {
        { Assert-PropertyPresence -Record ([pscustomobject]@{ id = 1 }) -PropertyNames 'name' } | Should -Throw
    }

    It 'succeeds when all required properties exist' {
        Assert-PropertyPresence -Record ([pscustomobject]@{ id = 1; name = 'Valid' }) -PropertyNames 'name'
    }
}

Describe 'Normalize-ToPsObject' {
    It 'returns PSCustomObject when given a hashtable' {
        $result = Normalize-ToPsObject -Record @{ id = 1 }
        $result.PSObject.TypeNames[0] | Should -Be 'System.Management.Automation.PSCustomObject'
        $result.id | Should -Be 1
    }

    It 'throws for unsupported types' {
        { Normalize-ToPsObject -Record 5 } | Should -Throw
    }
}
