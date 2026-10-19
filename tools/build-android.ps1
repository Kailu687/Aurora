# Builds the signed Android APK and copies it to downloads\Aurora.apk
#   npm run android
# Needs: Node, JDK 17+ and the Android SDK (Android Studio installs both). Release signing uses android\keystore.properties.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if (-not (Test-Path "$root\android\keystore.properties")) { Write-Warning "android\keystore.properties not found: the APK will be signed with the debug key and cannot update an APK signed with your release key." }
if (-not $env:JAVA_HOME -and (Test-Path 'D:\Android Studio\jbr')) { $env:JAVA_HOME = 'D:\Android Studio\jbr' }
npx cap sync android
Set-Location "$root\android"
.\gradlew.bat assembleRelease --no-daemon -q
if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed' }
Set-Location $root
New-Item -ItemType Directory -Force "$root\downloads" | Out-Null
Copy-Item "$root\android\app\build\outputs\apk\release\app-release.apk" "$root\downloads\Aurora.apk" -Force
$ver = (Get-Content "$root\package.json" -Raw | ConvertFrom-Json).version
New-Item -ItemType Directory -Force "$root\dist" | Out-Null
Copy-Item "$root\downloads\Aurora.apk" "$root\dist\Aurora-$ver.apk" -Force   # the file name to attach to the GitHub Release
Write-Host "APK ready: $root\downloads\Aurora.apk"
