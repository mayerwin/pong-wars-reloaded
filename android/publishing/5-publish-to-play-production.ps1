[CmdletBinding()]
param([int]$VersionCode = 0, [string]$VersionName = '')
# Explicit production entry point, matching the Chained-Timers workflow.
& (Join-Path $PSScriptRoot '4-publish-to-play.ps1') -Tracks @('internal','alpha','production') -Status completed -VersionCode $VersionCode -VersionName $VersionName
