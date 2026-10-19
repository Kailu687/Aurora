# Builds everything for a release:  npm run release
#   1. Android APK  -> downloads\Aurora.apk  (commit this so the website can serve it)
#   2. Windows installer -> dist\Aurora-Setup-<version>.exe  (attach to a GitHub Release, it is too big for git)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if (-not (Test-Path "$root\node_modules")) { npm install }
& "$PSScriptRoot\build-android.ps1"
Set-Location $root
npx electron-builder --win nsis
node tools/hash-releases.js
Write-Host ""
Write-Host "Done."
Write-Host "  Android : $root\downloads\Aurora.apk   (also dist\Aurora-<version>.apk for the GitHub Release)"
Get-ChildItem "$root\dist" -Filter 'Aurora-Setup-*.exe' | ForEach-Object { Write-Host "  Windows : $($_.FullName)" }
