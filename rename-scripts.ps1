# PowerShell script to rename .js files to .cjs in a directory

param(
    [Parameter(Mandatory=$true)]
    [string]$DirPath
)

if (Test-Path -Path $DirPath) {
    Write-Host "Renaming .js files to .cjs in $DirPath..."
    Get-ChildItem -Path $DirPath -Recurse -Filter *.js | ForEach-Object {
        $newName = $_.Name -replace '\.js$', '.cjs'
        $newFullName = Join-Path -Path $_.DirectoryName -ChildPath $newName
        try {
            Rename-Item -Path $_.FullName -NewName $newName -ErrorAction Stop
            Write-Host "Renamed $($_.Name) to $newName"
        } catch {
            Write-Error "Error renaming $($_.FullName): $($_.Exception.Message)"
        }
    }
    Write-Host "Rename process completed."
} else {
    Write-Warning "Directory not found: $DirPath. Skipping rename."
} 