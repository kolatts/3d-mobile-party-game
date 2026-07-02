<#
.SYNOPSIS
    Idempotent provisioning for TeleSculpt Azure resources (az CLI).

.DESCRIPTION
    Creates:
      - Resource group  rg-telesculpt
      - Storage account sttelesculpt<suffix>  (Standard_LRS, StorageV2, public blob access allowed, TLS 1.2 min)
      - Tables          rooms, turns
      - Blob container  sculptures (public blob read)
      - Blob CORS       all origins, GET/PUT/OPTIONS, all headers, max-age 3600
      - Function app    func-telesculpt-<suffix>  (Linux consumption, Node 22, Functions v4)

    Safe to re-run: every step either uses an idempotent az command or checks
    for existence first.

.PARAMETER Suffix
    Short, lowercase, globally-unique suffix appended to resource names
    (e.g. "sunny42"). Required.

.PARAMETER Location
    Azure region. Defaults to westus2.

.EXAMPLE
    ./provision.ps1 -Suffix sunny42
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]{1,14}$')]
    [string]$Suffix,

    [string]$Location = 'westus2'
)

$ErrorActionPreference = 'Stop'

$ResourceGroup  = 'rg-telesculpt'
$StorageAccount = "sttelesculpt$Suffix"
$FunctionApp    = "func-telesculpt-$Suffix"

function Assert-LastExitCode {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Step failed: $Step (exit code $LASTEXITCODE)"
        exit 1
    }
}

Write-Host "==> Provisioning TeleSculpt" -ForegroundColor Cyan
Write-Host "    Resource group : $ResourceGroup"
Write-Host "    Storage account: $StorageAccount"
Write-Host "    Function app   : $FunctionApp"
Write-Host "    Location       : $Location"
Write-Host ""

# --- Resource group (az group create is idempotent) -------------------------
Write-Host "==> Resource group" -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location --output none
Assert-LastExitCode 'az group create'

# --- Storage account (az storage account create is idempotent for same params)
Write-Host "==> Storage account" -ForegroundColor Cyan
az storage account create `
    --name $StorageAccount `
    --resource-group $ResourceGroup `
    --location $Location `
    --sku Standard_LRS `
    --kind StorageV2 `
    --allow-blob-public-access true `
    --min-tls-version TLS1_2 `
    --output none
Assert-LastExitCode 'az storage account create'

# Connection string used for data-plane operations and the Function app setting.
$ConnectionString = az storage account show-connection-string `
    --name $StorageAccount `
    --resource-group $ResourceGroup `
    --query connectionString `
    --output tsv
Assert-LastExitCode 'az storage account show-connection-string'
if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
    Write-Error 'Failed to retrieve storage connection string.'
    exit 1
}

# --- Tables (az storage table create no-ops if the table exists) ------------
Write-Host "==> Tables: rooms, turns" -ForegroundColor Cyan
foreach ($table in @('rooms', 'turns')) {
    az storage table create `
        --name $table `
        --connection-string $ConnectionString `
        --output none
    Assert-LastExitCode "az storage table create ($table)"
}

# --- Blob container with public blob read ------------------------------------
# az storage container create no-ops if it exists, but --public-access is only
# applied on creation, so set it explicitly afterwards to stay idempotent.
Write-Host "==> Blob container: sculptures (public blob read)" -ForegroundColor Cyan
az storage container create `
    --name sculptures `
    --connection-string $ConnectionString `
    --public-access blob `
    --output none
Assert-LastExitCode 'az storage container create'

az storage container set-permission `
    --name sculptures `
    --public-access blob `
    --connection-string $ConnectionString `
    --output none
Assert-LastExitCode 'az storage container set-permission'

# --- Blob CORS ----------------------------------------------------------------
# az storage cors add appends duplicate rules on re-run, so clear first.
Write-Host "==> Blob CORS (all origins, GET/PUT/OPTIONS, max-age 3600)" -ForegroundColor Cyan
az storage cors clear `
    --services b `
    --connection-string $ConnectionString `
    --output none
Assert-LastExitCode 'az storage cors clear'

az storage cors add `
    --services b `
    --methods GET PUT OPTIONS `
    --origins '*' `
    --allowed-headers '*' `
    --exposed-headers '*' `
    --max-age 3600 `
    --connection-string $ConnectionString `
    --output none
Assert-LastExitCode 'az storage cors add'

# --- Function app (Linux consumption, Node 22, Functions v4) ------------------
# az functionapp create is NOT reliably idempotent, so guard with an existence check.
Write-Host "==> Function app: $FunctionApp" -ForegroundColor Cyan
$existing = az functionapp show `
    --name $FunctionApp `
    --resource-group $ResourceGroup `
    --query name `
    --output tsv 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
    Write-Host "    Function app already exists, skipping create."
}
else {
    # Node 22 on the Consumption plan requires Linux, hence --os-type Linux.
    az functionapp create `
        --name $FunctionApp `
        --resource-group $ResourceGroup `
        --consumption-plan-location $Location `
        --storage-account $StorageAccount `
        --os-type Linux `
        --runtime node `
        --runtime-version 22 `
        --functions-version 4 `
        --output none
    Assert-LastExitCode 'az functionapp create'
}

# --- App settings (idempotent: set overwrites) --------------------------------
# SCM_DO_BUILD_DURING_DEPLOYMENT=true makes zip deploys run a remote Oryx build
# (npm install) — required for Linux consumption deploys from GitHub Actions.
Write-Host "==> App settings" -ForegroundColor Cyan
az functionapp config appsettings set `
    --name $FunctionApp `
    --resource-group $ResourceGroup `
    --settings `
        "STORAGE_CONNECTION=$ConnectionString" `
        "FUNCTIONS_WORKER_RUNTIME=node" `
        "SCM_DO_BUILD_DURING_DEPLOYMENT=true" `
    --output none
Assert-LastExitCode 'az functionapp config appsettings set'

# --- Function app CORS (guard: cors add duplicates on re-run) ------------------
Write-Host "==> Function app CORS (allow *)" -ForegroundColor Cyan
$corsOrigins = az functionapp cors show `
    --name $FunctionApp `
    --resource-group $ResourceGroup `
    --query "allowedOrigins" `
    --output tsv
Assert-LastExitCode 'az functionapp cors show'
if ($corsOrigins -notcontains '*') {
    az functionapp cors add `
        --name $FunctionApp `
        --resource-group $ResourceGroup `
        --allowed-origins '*' `
        --output none
    Assert-LastExitCode 'az functionapp cors add'
}
else {
    Write-Host "    CORS already allows *, skipping."
}

# --- Done ----------------------------------------------------------------------
$hostName = az functionapp show `
    --name $FunctionApp `
    --resource-group $ResourceGroup `
    --query defaultHostName `
    --output tsv
Assert-LastExitCode 'az functionapp show (hostname)'

Write-Host ""
Write-Host "==> Provisioning complete." -ForegroundColor Green
Write-Host "    Function app URL: https://$hostName"
Write-Host "    API base URL    : https://$hostName/api"
