[CmdletBinding()]
param([int]$VersionCode = 0, [string]$VersionName = '', [switch]$PassThru)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-AndroidEnvironment
New-AppSigningKey 'sideload'
$version = Reserve-Version $VersionCode $VersionName
Invoke-Gradle @('assembleSideloadRelease', "-PversionCode=$($version.Code)", "-PversionName=$($version.Name)")
$apk = Export-Artifact (Join-Path $script:AndroidDir 'app\build\outputs\apk\sideload\release\app-sideload-release.apk') "pong-wars-reloaded-v$($version.Name)-$($version.Code)-tv.apk"
Copy-Item -LiteralPath $apk -Destination (Join-Path $script:ReleasesDir 'pong-wars-reloaded-tv.apk') -Force
if ($PassThru) { [PSCustomObject]@{ Apk = $apk; Code = $version.Code; Name = $version.Name } }
