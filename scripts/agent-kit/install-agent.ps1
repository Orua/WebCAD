# WebCAD finite local skill installer. Run explicitly; never starts a service.
# Example: & .\install-agent.ps1 -BaseUrl 'http://localhost:17674/'
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [string]$Destination = (Join-Path $env:USERPROFILE '.codex/skills/webcad-page-api')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$http = $null; $installLock = $null; $stage = $null; $backup = $null
$oldMoved = $false; $newMoved = $false

function Confirm-ChildPath([string]$ParentPath, [string]$ChildPath) {
  $prefix = [IO.Path]::GetFullPath($ParentPath).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $full = [IO.Path]::GetFullPath($ChildPath)
  if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installer path escapes its intended parent directory.' }
  return $full
}
function Get-KitBytes([Uri]$Url, [int]$MaxBytes) {
  $response = $http.GetAsync($Url, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  try {
    $response.EnsureSuccessStatusCode() | Out-Null
    if ($null -ne $response.Content.Headers.ContentLength -and $response.Content.Headers.ContentLength -gt $MaxBytes) { throw 'Download exceeds the finite package size limit.' }
    $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $memory = New-Object IO.MemoryStream
    try {
      $buffer = New-Object byte[] 8192
      while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        if ($memory.Length + $count -gt $MaxBytes) { throw 'Download exceeds the finite package size limit.' }
        $memory.Write($buffer, 0, $count)
      }
      return ,$memory.ToArray()
    } finally { $memory.Dispose(); $stream.Dispose() }
  } finally { $response.Dispose() }
}

try {
  $source = [Uri]$BaseUrl
  if (-not $source.IsAbsoluteUri -or $source.Scheme -notin @('http','https') -or $source.UserInfo -or $source.Query -or $source.Fragment) { throw 'BaseUrl must be an absolute HTTP(S) page root without credentials, query or fragment.' }
  $baseText = $source.AbsoluteUri.TrimEnd('/') + '/'
  $automation = if ($source.AbsolutePath.TrimEnd('/').EndsWith('/automation', [StringComparison]::Ordinal)) { [Uri]$baseText } else { [Uri]($baseText + 'automation/') }
  $dest = [IO.Path]::GetFullPath($Destination)
  $parent = [IO.Path]::GetDirectoryName($dest); $leaf = [IO.Path]::GetFileName($dest)
  if (-not $parent -or -not $leaf -or $dest -eq [IO.Path]::GetPathRoot($dest)) { throw 'Destination must be a package directory, not a filesystem root.' }
  [IO.Directory]::CreateDirectory($parent) | Out-Null
  Confirm-ChildPath $parent $dest | Out-Null
  if (Test-Path -LiteralPath $dest) {
    $existing = Get-Item -LiteralPath $dest -Force
    if (-not $existing.PSIsContainer -or ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Existing Destination must be a regular directory, not a file or link.' }
  }
  $lockPath = Confirm-ChildPath $parent (Join-Path $parent ('.' + $leaf + '.agent-install.lock'))
  $installLock = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $stage = Confirm-ChildPath $parent (Join-Path $parent ('.' + $leaf + '.stage-' + [Guid]::NewGuid().ToString('N')))
  [IO.Directory]::CreateDirectory($stage) | Out-Null
  Add-Type -AssemblyName System.Net.Http
  $handler = New-Object Net.Http.HttpClientHandler; $handler.AllowAutoRedirect = $false
  $http = New-Object Net.Http.HttpClient($handler); $http.Timeout = [TimeSpan]::FromSeconds(30)
  $manifestBytes = Get-KitBytes ([Uri]::new($automation, 'agent-kit.json')) 65536
  $manifest = $utf8.GetString($manifestBytes) | ConvertFrom-Json
  if ($manifest.schemaVersion -ne 1 -or $manifest.id -ne 'webcad-page-api') { throw 'Unsupported Agent package manifest.' }
  $allowed = @{'SKILL.md'='webcad-page-api/SKILL.md'; 'references/connection.md'='webcad-page-api/references/connection.md'; 'scripts/page-client.mjs'='webcad-page-api/scripts/page-client.mjs'; 'routes.json'='routes.json'}
  if (@($manifest.files).Count -ne $allowed.Count) { throw 'The manifest must contain exactly the supported finite file set.' }
  $seen = @{}
  foreach ($file in $manifest.files) {
    $rel = [string]$file.relativePath; $urlText = [string]$file.url
    if (-not $allowed.ContainsKey($rel) -or $allowed[$rel] -cne $urlText -or $seen.ContainsKey($rel)) { throw 'Unsupported, duplicate or unsafe package path.' }
    $seen[$rel] = $true
    if ([string]$file.sha256 -cnotmatch '^sha256:[a-f0-9]{64}$' -or $file.sizeBytes -isnot [long] -and $file.sizeBytes -isnot [int] -or $file.sizeBytes -lt 1 -or $file.sizeBytes -gt 1048576) { throw 'Invalid package file size or SHA-256.' }
    $fileUrl = [Uri]::new($automation, $urlText)
    if ($fileUrl.Authority -cne $automation.Authority -or $fileUrl.Scheme -cne $automation.Scheme) { throw 'Package URL must stay on the requested host.' }
    $bytes = Get-KitBytes $fileUrl ([int]$file.sizeBytes)
    if ($bytes.Length -ne $file.sizeBytes) { throw ('Package byte count differs: ' + $rel) }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $actualHash = 'sha256:' + ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
    if ($actualHash -cne $file.sha256) { throw ('Package SHA-256 differs: ' + $rel) }
    $null = $utf8.GetString($bytes)
    $filePath = Confirm-ChildPath $stage (Join-Path $stage $rel)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($filePath)) | Out-Null
    [IO.File]::WriteAllBytes($filePath, $bytes)
  }
  $manifest | Add-Member -NotePropertyName installedFrom -NotePropertyValue $automation.AbsoluteUri -Force
  $manifest | Add-Member -NotePropertyName installedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
  [IO.File]::WriteAllText((Join-Path $stage '.agent-kit.json'), ($manifest | ConvertTo-Json -Depth 30), $utf8)
  if (Test-Path -LiteralPath $dest) {
    $backupContainer = Confirm-ChildPath $parent (Join-Path $parent '.agent-backups')
    if (Test-Path -LiteralPath $backupContainer) {
      $backupItem = Get-Item -LiteralPath $backupContainer -Force
      if (-not $backupItem.PSIsContainer -or ($backupItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Backup container must be a regular directory.' }
    }
    [IO.Directory]::CreateDirectory($backupContainer) | Out-Null
    $backup = Confirm-ChildPath $backupContainer (Join-Path $backupContainer ($leaf + '-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N')))
    [IO.Directory]::Move($dest, $backup); $oldMoved = $true
  }
  [IO.Directory]::Move($stage, $dest); $newMoved = $true
  [pscustomobject]@{status='installed'; destination=$dest; backup=$backup; version=$manifest.version; files=$allowed.Count; source=$automation.AbsoluteUri} | ConvertTo-Json
} catch {
  if ($oldMoved -and -not $newMoved -and -not (Test-Path -LiteralPath $dest)) { [IO.Directory]::Move($backup, $dest); $oldMoved = $false }
  throw
} finally {
  if ($http) { $http.Dispose() }
  if ($stage -and -not $newMoved -and (Test-Path -LiteralPath $stage)) { $verifiedStage = Confirm-ChildPath $parent $stage; Remove-Item -LiteralPath $verifiedStage -Recurse -Force }
  if ($installLock) { $installLock.Dispose(); Remove-Item -LiteralPath $lockPath -Force }
}
