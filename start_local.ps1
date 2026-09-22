[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 5173,

    [string]$HostName = "localhost",

    # Start Roboflow Inference even when .env.local does not select LOCAL.
    [switch]$WithInference,

    # Useful in CI or on machines where dependencies are managed separately.
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$startedProcesses = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    # Read configuration without dot-sourcing the file or exposing secrets.
    $line = Get-Content -LiteralPath $Path |
        Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
        Select-Object -Last 1

    if (-not $line) {
        return $null
    }

    return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

function Wait-ForHttpEndpoint {
    param(
        [Parameter(Mandatory)]
        [string]$Uri,

        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -Method Head -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -lt 500) {
                return
            }
        }
        catch {
            Start-Sleep -Milliseconds 300
        }
    }

    throw "Timed out waiting for $Uri"
}

function Stop-StartedProcessTree {
    param([System.Diagnostics.Process]$Process)

    if ($null -eq $Process -or $Process.HasExited) {
        return
    }

    # taskkill closes child processes too (for example Vite's esbuild worker).
    & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
}

Push-Location $projectRoot
try {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        throw "npm.cmd was not found. Install Node.js, then run this script again."
    }

    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) {
        throw "node.exe was not found. Install Node.js, then run this script again."
    }

    # A fresh checkout needs one dependency restore before Vite can start.
    if (-not $SkipInstall -and -not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
        Write-Host "Installing npm dependencies..."
        & $npm.Source install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
    }

    $configuredRuntime = Get-DotEnvValue -Path (Join-Path $projectRoot ".env.local") -Name "VITE_ROBOFLOW_RUNTIME"
    $startInference = $WithInference -or $configuredRuntime -eq "LOCAL"

    if ($startInference) {
        $inference = Get-Command inference.exe -ErrorAction SilentlyContinue
        if (-not $inference) {
            $inference = Get-Command inference -ErrorAction SilentlyContinue
        }
        if (-not $inference) {
            throw "Roboflow Inference is required but the 'inference' command was not found."
        }

        Write-Host "Starting Roboflow Inference on http://localhost:9001..."
        $inferenceProcess = Start-Process -FilePath $inference.Source -ArgumentList @("server", "start") -NoNewWindow -PassThru
        $startedProcesses.Add($inferenceProcess)
    }

    $appUrl = "http://${HostName}:$Port"
    Write-Host "Starting Virtual Vision Cell at $appUrl..."
    # Launch Vite's Node entry point directly. Tracking npm.cmd would only track
    # its short-lived wrapper and could leave the real dev server orphaned.
    $viteEntryPoint = Join-Path $projectRoot "node_modules\vite\bin\vite.js"
    if (-not (Test-Path -LiteralPath $viteEntryPoint)) {
        throw "Vite is not installed. Remove -SkipInstall or run npm install."
    }
    $viteProcess = Start-Process -FilePath $node.Source -ArgumentList @($viteEntryPoint, "--host", $HostName, "--port", $Port, "--strictPort") -WorkingDirectory $projectRoot -NoNewWindow -PassThru
    $startedProcesses.Add($viteProcess)

    Wait-ForHttpEndpoint -Uri $appUrl
    Write-Host "Local app is ready: $appUrl"
    Write-Host "Press Ctrl+C to stop the app and all services started by this script."

    # Keep this supervisor alive so Ctrl+C can clean up the complete process tree.
    while (-not $viteProcess.HasExited) {
        Wait-Process -Id $viteProcess.Id -Timeout 1 -ErrorAction SilentlyContinue
    }

    if ($viteProcess.ExitCode -ne 0) {
        throw "Vite exited with code $($viteProcess.ExitCode)."
    }
}
finally {
    foreach ($process in $startedProcesses) {
        Stop-StartedProcessTree -Process $process
    }
    Pop-Location
}