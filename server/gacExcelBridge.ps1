param([Parameter(Mandatory=$true)][string]$WorkbookPath)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$excel = $null
$book = $null
$writes = @()
function Set-Input([string]$sheet, [string]$address, $value) {
  $cell = $book.Worksheets.Item($sheet).Range($address)
  if ($cell.HasFormula) { throw "Refusing to overwrite formula at ${sheet}!${address}." }
  if ($null -eq $value) { $cell.ClearContents() | Out-Null }
  elseif ($value -is [string]) { $cell.Value2 = [string]$value }
  else { $cell.Value2 = [double]$value }
  $script:writes += @{ citation = "$sheet!$address"; value = $value }
  [Runtime.InteropServices.Marshal]::ReleaseComObject($cell) | Out-Null
}
function Read-Cell([string]$sheet, [string]$address) {
  $cell = $book.Worksheets.Item($sheet).Range($address)
  $value = $cell.Value2
  $formula = [string]$cell.Formula
  $display = [string]$cell.Text
  [Runtime.InteropServices.Marshal]::ReleaseComObject($cell) | Out-Null
  if ($display -match '^#(REF!|DIV/0!|VALUE!|NAME\?|N/A|NUM!|NULL!|SPILL!|CALC!)') { throw "Excel formula error at ${sheet}!${address}: $display" }
  return @{ value = $value; formula = $formula }
}
function Recalculate {
  $excel.CalculateFullRebuild()
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  while ($excel.CalculationState -ne 0) {
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Excel recalculation timed out.' }
    Start-Sleep -Milliseconds 100
  }
}
$answer = $null
$phase = 'excel_unavailable'
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  # Dedicated automation instance. Never attach to a user's active workbook.
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.EnableEvents = $false
  $excel.AutomationSecurity = 3
  $excel.AskToUpdateLinks = $false
  $book = $excel.Workbooks.Open($WorkbookPath, 0, $false)
  $excel.Calculation = -4135
  $phase = 'excel_execution_failed'
  # Fixed mapping only. User/model strings are never interpreted as code or addresses.
  Set-Input 'Contactor Constraints' 'C13' 1
  Set-Input 'Critical Design Assumptions' 'C58' 0
  Set-Input 'Critical Design Assumptions' 'C70' $request.densityLbFt3
  # MGD is intentional: native AutoSize!C23 tests design_flow_I <= 0.1.
  Set-Input 'INPUT' 'G29' ($request.flowGpm * 1440 / 1000000)
  Set-Input 'INPUT' 'H29' 'MGD'
  Set-Input 'INPUT' 'G30' ($request.averageFlowGpm * 1440 / 1000000)
  Set-Input 'INPUT' 'H30' 'MGD'
  Set-Input 'INPUT' 'G45' 'EBCT'
  Set-Input 'INPUT' 'G46' $request.totalEbctMinutes
  Set-Input 'INPUT' 'G49' $request.series
  Set-Input 'INPUT' 'G58' 'upright'
  Set-Input 'INPUT' 'G93' $request.redundantVessels
  foreach ($cell in @('G36','G37','G38','G39','G40')) { Set-Input 'INPUT' $cell $null }
  if ($request.carbonLifeMode -eq 'months') { Set-Input 'INPUT' 'G36' 'carbon life value- months' }
  if ($request.carbonLifeMode -eq 'bv') {
    Set-Input 'INPUT' 'G36' 'carbon life value- bed volumes'
    $definition = if ($request.bvDefinition -eq 'per_vessel') { 'EBCT per vessel' } else { 'total EBCT' }
    Set-Input 'Critical Design Assumptions' 'C69' $definition
  }
  if ($request.carbonLifeMode -eq 'freundlich') {
    Set-Input 'INPUT' 'G36' 'calculation from Freundlich isotherm'
    Set-Input 'INPUT' 'G38' $request.freundlichExponent
    Set-Input 'INPUT' 'G39' $request.influentMgL
    Set-Input 'INPUT' 'G40' $request.targetMgL
  }
  if ($request.carbonLifeMode -ne 'none') { Set-Input 'INPUT' 'G37' $request.carbonLifeValue }
  if ($request.geometryMode -eq 'auto') {
    Set-Input 'AutoSize' 'C51' $request.parallel
    Recalculate
    if ((Read-Cell 'AutoSize' 'C55').value -ne 'upright') { throw 'Workbook requires horizontal geometry for this train count; upright-only tool cannot calculate it.' }
    Set-Input 'INPUT' 'G60' (Read-Cell 'AutoSize' 'E58').value
    Set-Input 'INPUT' 'G57' (Read-Cell 'AutoSize' 'E61').value
    Set-Input 'INPUT' 'G59' (Read-Cell 'AutoSize' 'E62').value
  } else {
    Set-Input 'INPUT' 'G60' $request.diameterFt
    Set-Input 'INPUT' 'G57' $request.bedDepthFt
    Set-Input 'INPUT' 'G59' $request.heightFt
  }
  Recalculate
  $phase = 'workbook_validation'
  $checks = @('C34','C53','C65','C66','C67','C68','C70')
  if ($request.carbonLifeMode -ne 'none') { $checks += 'C43' }
  foreach ($check in $checks) {
    if ((Read-Cell 'INPUT' $check).value -ne $true) {
      $reason = (Read-Cell 'INPUT' ($check -replace '^C','D')).value
      throw "Workbook input check INPUT!$check failed: $reason"
    }
  }
  $ranges = @{
    'INPUT' = @('G57','G59','G60')
    'Contactor Constraints' = @('C8','C9','C18','C27','C31','C32','C33','C34','C35','C38','C43','C44','C45','C80','C81','C82')
    'Pumps Pipe Structure' = @('C24','C27','C30')
    'Backwash and Regeneration' = @('C13','C14')
    'Critical Design Assumptions' = @('C11','C20')
  }
  if ($request.carbonLifeMode -ne 'none') { $ranges['Backwash and Regeneration'] += @('C36','C43') }
  if ($request.geometryMode -eq 'auto') { $ranges['AutoSize'] = @('E58','E61','E62') }
  $cells = @{}
  foreach ($sheet in $ranges.Keys) {
    foreach ($address in $ranges[$sheet]) {
      $cell = Read-Cell $sheet $address
      if ($null -eq $cell.value -or $cell.value -isnot [ValueType] -or $cell.value -is [bool]) { throw "Expected numeric Excel result at $sheet!$address." }
      $cells["$sheet!$address"] = $cell
    }
  }
  $answer = @{ ok = $true; excelVersion = [string]$excel.Version; cells = $cells; inputWrites = $writes }
} catch {
  $answer = @{ ok = $false; code = $phase; error = $_.Exception.Message; inputWrites = $writes }
} finally {
  if ($null -ne $book) { try { $book.Close($false) } catch {} ; [Runtime.InteropServices.Marshal]::ReleaseComObject($book) | Out-Null }
  if ($null -ne $excel) { try { $excel.Quit() } catch {} ; [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
Write-Output ('CODESIGN_RESULT:' + ($answer | ConvertTo-Json -Depth 12 -Compress))
if (-not $answer.ok) { exit 1 }
