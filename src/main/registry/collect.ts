import type { ParsedRegistrySnapshot } from './parse'
import { parseRegistrySnapshot } from './parse'
import { runPs } from '../win/powershell'

const REGISTRY_SCRIPT = `
$uninstall = @()
$uninstallPaths = @(
  @{ Hive = 'HKLM'; Path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' },
  @{ Hive = 'HKLM'; Path = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' },
  @{ Hive = 'HKCU'; Path = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' }
)
foreach ($source in $uninstallPaths) {
  $uninstall += Get-ItemProperty -Path $source.Path -ErrorAction SilentlyContinue | ForEach-Object {
    $keyPath = ($_.PSPath -replace '^Microsoft\\.PowerShell\\.Core\\\\Registry::', '')
    $keyPath = $keyPath -replace '^HKEY_LOCAL_MACHINE\\\\', ''
    $keyPath = $keyPath -replace '^HKEY_CURRENT_USER\\\\', ''
    [pscustomobject]@{
      Hive = $source.Hive
      KeyPath = $keyPath
      DisplayName = $_.DisplayName
      Publisher = $_.Publisher
      DisplayVersion = $_.DisplayVersion
      InstallLocation = $_.InstallLocation
      UninstallString = $_.UninstallString
      DisplayIcon = $_.DisplayIcon
      EstimatedSize = $_.EstimatedSize
      PSChildName = $_.PSChildName
      SystemComponent = $_.SystemComponent
    }
  }
}

$appPaths = @()
$appPathRoot = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'
if (Test-Path $appPathRoot) {
  $appPaths = Get-ChildItem $appPathRoot -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{ Exe = $_.PSChildName; Path = $_.GetValue('') }
  }
}

$publisherKeys = @()
foreach ($root in @(
  @{ Hive = 'HKLM'; Path = 'HKLM:\\SOFTWARE' },
  @{ Hive = 'HKCU'; Path = 'HKCU:\\SOFTWARE' }
)) {
  $publisherKeys += Get-ChildItem $root.Path -ErrorAction SilentlyContinue | Where-Object {
    $_.PSChildName -notmatch '^(Microsoft|Windows|Classes|Policies|RegisteredApplications|WOW6432Node)$'
  } | ForEach-Object {
    [pscustomobject]@{ Hive = $root.Hive; Name = $_.PSChildName }
  }
}

$services = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
  Select-Object Name, PathName

$uwp = @()
try {
  $uwp = Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue |
    Select-Object Name, PackageFullName, InstallLocation, Publisher
} catch {
  $uwp = @()
}
if (@($uwp).Count -eq 0) {
  $uwp = Get-AppxPackage -ErrorAction SilentlyContinue |
    Select-Object Name, PackageFullName, InstallLocation, Publisher
}

[pscustomobject]@{
  uninstall = $uninstall
  appPaths = $appPaths
  publisherKeys = $publisherKeys
  services = $services
  uwp = $uwp
} | ConvertTo-Json -Depth 5 -Compress
`

export async function collectRegistrySnapshot(): Promise<ParsedRegistrySnapshot> {
  if (process.platform !== 'win32') {
    return { apps: [], registryEntries: [] }
  }

  const stdout = await runPs(REGISTRY_SCRIPT, { timeoutMs: 90_000 })
  if (!stdout.trim()) {
    return { apps: [], registryEntries: [] }
  }

  try {
    return parseRegistrySnapshot(JSON.parse(stdout) as unknown)
  } catch {
    return { apps: [], registryEntries: [] }
  }
}
