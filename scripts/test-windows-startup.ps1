$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path 'src-tauri/target/release/sekoly.exe').Path
# Read the actual PE header: subsystem 2 is Windows GUI, 3 would open a console.
$bytes = [System.IO.File]::ReadAllBytes($exe)
$pe = [BitConverter]::ToInt32($bytes, 0x3c)
$subsystem = [BitConverter]::ToUInt16($bytes, $pe + 24 + 68)
if ($subsystem -ne 2) { throw "Console subsystem detected: $subsystem" }
$first = $null
$second = $null
try {
  $first = Start-Process -FilePath $exe -PassThru
  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Milliseconds 500
    $first.Refresh()
    if ($first.HasExited) { throw 'Sekoly exited before opening its main window.' }
  } until ($first.MainWindowHandle -ne 0 -or (Get-Date) -gt $deadline)
  if ($first.MainWindowHandle -eq 0) { throw 'Main window not found.' }
  $second = Start-Process -FilePath $exe -PassThru
  if (-not $second.WaitForExit(15000)) { throw 'Second launch created another running instance.' }
  $first.Refresh()
  if ($first.HasExited -or $first.MainWindowHandle -eq 0) { throw 'Original window did not remain open.' }
  $instances = @(Get-Process -Name sekoly -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
  if ($instances.Count -ne 1) { throw "Expected one instance, found $($instances.Count)." }
  Write-Output 'PASS: Windows GUI subsystem, main window visible, second launch reuses the first instance.'
} finally {
  if ($second -and -not $second.HasExited) { Stop-Process -Id $second.Id -Force }
  if ($first -and -not $first.HasExited) { Stop-Process -Id $first.Id -Force }
}
