# One-click setup of a Windows machine for instinct: agent CLIs, Herdr, then instinct itself.
# Installs only what is missing; re-run it to update. -DryRun prints every command and runs none.
param(
  [string]$Dir = (Join-Path $HOME 'instinct'),
  [string]$Repo = 'https://github.com/poramet-mek/instinct.git',
  [switch]$DryRun,
  [switch]$Yes,
  [string[]]$Agents = @(),          # e.g. claude,codex,agy; asked when empty
  [string[]]$AssumeMissing = @(),   # tests: treat these tools as missing (dry run only)
  [string[]]$SimulateFail = @()     # tests: report these steps as failed (dry run only)
)
# Everything runs in a child scope, so `irm | iex` leaves only this one flag in the user's shell.
$instinctSetup = @{ failed = $false }
& {
  $ErrorActionPreference = 'Continue'
  $AssumeMissing = @($AssumeMissing | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
  $SimulateFail = @($SimulateFail | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
  if (-not $DryRun -and ($AssumeMissing.Count -or $SimulateFail.Count)) { Write-Host '-AssumeMissing and -SimulateFail need -DryRun'; $instinctSetup.failed = $true; return }

  function Test-Cmd($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }
  function Get-WingetCmd($id) { "winget install -e --id $id --accept-source-agreements --accept-package-agreements" }
  $apps = Join-Path $env:LOCALAPPDATA 'Programs'

  # Order matters: node before the npm CLIs. Sources are fixed here; never a look-alike package.
  # Vendor commands hold no quotes, so they pass safely to a child powershell -Command.
  $tools = @(
    @{ name = 'node';   has = { Test-Cmd node };   cmd = (Get-WingetCmd 'OpenJS.NodeJS.LTS') }
    @{ name = 'git';    has = { Test-Cmd git };    cmd = (Get-WingetCmd 'Git.Git') }
    @{ name = 'herdr';  has = { (Test-Path "$apps\herdr-app\herdr-app.exe") -and ((Test-Cmd hc) -or (Test-Path "$apps\herdr-core\hc.exe")) }
                        cmd = 'irm https://releases.herdr.dev/app/install.ps1 | iex' }
    @{ name = 'claude'; has = { Test-Cmd claude }; cmd = 'irm https://claude.ai/install.ps1 | iex' }
    @{ name = 'codex';  has = { Test-Cmd codex };  cmd = 'npm i -g @openai/codex' }
    @{ name = 'gemini'; has = { Test-Cmd gemini }; cmd = 'npm i -g @google/gemini-cli' }
    @{ name = 'agy';    has = { Test-Cmd agy };    cmd = (Get-WingetCmd 'Google.AntigravityCLI') }
  )

  # Which agents: -Agents, else ask (skipped with -Yes). The default is the choice saved by an
  # earlier run (~/.instinct/config.yml), else all but Gemini CLI (see the note below).
  $allAgents = @('claude', 'codex', 'gemini', 'agy')
  $defaultAgents = @('claude', 'codex', 'agy')
  $instinctHome = if ($env:INSTINCT_HOME) { $env:INSTINCT_HOME } else { $HOME }
  $savedFile = Join-Path $instinctHome '.instinct\config.yml'
  if (Test-Path $savedFile) {
    $m = Select-String -Path $savedFile -Pattern '^agents:\s*\[(.*)\]' | Select-Object -First 1
    if ($m) {
      $saved = @($m.Matches[0].Groups[1].Value -split ',' | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $allAgents -contains $_ })
      if ($saved.Count) { $defaultAgents = $saved }
    }
  }
  $Agents = @($Agents | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
  if (-not $Agents.Count -and $Yes) { $Agents = $defaultAgents }
  if (-not $Agents.Count) {
    Write-Host 'Agents: claude, codex, gemini, agy.'
    Write-Host '  Note: since 2026-11 Gemini CLI no longer takes a personal Google sign-in; it needs an API key.'
    Write-Host "Which will you use? (comma list, Enter = $($defaultAgents -join ','))"
    $line = Read-Host
    $Agents = @(("$line" -split ',') | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
    if (-not $Agents.Count) { $Agents = $defaultAgents }
  }
  $bad = @($Agents | Where-Object { $allAgents -notcontains $_ })
  if ($bad.Count) { Write-Host "unknown agent `"$($bad[0])`" (valid: $($allAgents -join ', '))"; $instinctSetup.failed = $true; return }
  $Agents = @($allAgents | Where-Object { $Agents -contains $_ })
  $tools = @($tools | Where-Object { $allAgents -notcontains $_.name -or $Agents -contains $_.name })
  $agentList = $Agents -join ','

  $results = New-Object System.Collections.Generic.List[object]
  function Add-Result($state, $name, $note) { $results.Add([pscustomobject]@{ state = $state; name = $name; note = $note }) }

  # Pick up PATH changes from installers without reopening the terminal.
  # Merged with the current PATH, so session-only entries (fnm, volta) survive.
  function Update-Path {
    $all = @($env:Path, [Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User')) -join ';'
    $env:Path = (($all -split ';') | Where-Object { $_ } | Select-Object -Unique) -join ';'
  }

  # $show is printed; $run does the work (native calls with argument lists, so spaces stay intact).
  # $check (optional) must be true afterwards: vendor installers can fail yet exit 0.
  function Invoke-Step($name, [string]$show, [scriptblock]$run, [scriptblock]$check) {
    Write-Host "  run   $name : $show"
    if ($DryRun) {
      if ($SimulateFail -contains $name) { Add-Result 'failed' $name 'simulated' } else { Add-Result 'done' $name 'dry run' }
      return
    }
    try {
      $global:LASTEXITCODE = 0
      & $run | Out-Host   # stream output live instead of returning it
      if ($LASTEXITCODE) { throw "exit code $LASTEXITCODE" }
      Update-Path
      if ($check -and -not (& $check)) { throw 'not found after install (open a new terminal and re-run)' }
      Add-Result 'done' $name ''
    } catch { Update-Path; Add-Result 'failed' $name $_.Exception.Message }
  }

  Write-Host "instinct setup for Windows$(if ($DryRun) { ' -- DRY RUN: nothing will be installed' })"
  $todo = @()
  foreach ($t in $tools) {
    $present = if ($AssumeMissing.Count) { $AssumeMissing -notcontains $t.name } else { & $t.has }
    if ($present) { Write-Host "  skip  $($t.name) (already installed)"; Add-Result 'skipped' $t.name 'present' }
    else { Write-Host "  plan  $($t.name) : $($t.cmd)"; $todo += $t }
  }
  $pull = Test-Path (Join-Path $Dir '.git')
  $showRepo = if ($pull) { "git -C `"$Dir`" pull --ff-only" } else { "git clone $Repo `"$Dir`"" }
  $bin = Join-Path $Dir 'bin\instinct.js'
  Write-Host "  plan  instinct : $showRepo"
  Write-Host "  plan  instinct : node `"$bin`" setup --apply --agents $agentList, then doctor"

  if (-not $Yes -and -not $DryRun) {
    $answer = Read-Host 'Install the above? [y/N]'
    if ($answer -notmatch '^(y|yes)$') { Write-Host 'Nothing installed.'; return }
  }

  # A child shell for vendor installers: they may call exit, which must not end this script.
  foreach ($t in $todo) { $c = $t.cmd; Invoke-Step $t.name $c { & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $c }.GetNewClosure() $t.has }
  if ($pull) { Invoke-Step 'instinct-repo' $showRepo { & git -C $Dir pull --ff-only } }
  else { Invoke-Step 'instinct-repo' $showRepo { & git clone $Repo $Dir } }
  Invoke-Step 'instinct-setup' "node `"$bin`" setup --apply --agents $agentList" { & node $bin setup --apply --agents $agentList }
  Invoke-Step 'doctor' "node `"$bin`" doctor" {
    $rows = (& node $bin doctor --json | Out-String) | ConvertFrom-Json
    $rows | Format-Table agent, check, status, fix -AutoSize | Out-Host
    if (@($rows | Where-Object { $_.status -ne 'ok' }).Count) { throw 'doctor found missing items' }
  }

  Write-Host ''
  Write-Host 'Summary'
  foreach ($r in $results) { Write-Host ('  {0,-8} {1} {2}' -f $r.state, $r.name, $r.note) }
  Write-Host ''
  Write-Host 'Log in to each agent once (opens a browser):'
  $login = @{ claude = 'claude'; codex = 'codex login'; gemini = 'gemini (API key)'; agy = 'agy' }
  Write-Host ('  ' + ((@($Agents | ForEach-Object { $login[$_] }) + 'open Herdr from the Start menu') -join '  |  '))
  $instinctSetup.failed = [bool]($results | Where-Object state -eq 'failed')
}
# exit only when run as a file (setup.cmd); under `irm | iex` it would close the user's window.
if ($instinctSetup.failed -and $PSCommandPath) { exit 1 }
