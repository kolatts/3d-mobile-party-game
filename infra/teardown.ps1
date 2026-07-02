<#
.SYNOPSIS
    Deletes ALL TeleSculpt Azure resources (the rg-telesculpt resource group).

.DESCRIPTION
    Lists everything inside rg-telesculpt, then deletes the whole resource
    group. Requires a typed confirmation to run.

.PARAMETER Confirm
    Must be the exact string "DELETE" or the script exits with an error.

.EXAMPLE
    ./teardown.ps1 -Confirm DELETE
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Confirm
)

$ErrorActionPreference = 'Stop'

$ResourceGroup = 'rg-telesculpt'

if ($Confirm -cne 'DELETE') {
    Write-Error "Refusing to run: -Confirm must be exactly 'DELETE' (got '$Confirm')."
    exit 1
}

# Does the resource group exist at all?
$exists = az group exists --name $ResourceGroup --output tsv
if ($LASTEXITCODE -ne 0) {
    Write-Error 'az group exists failed — are you logged in (az login)?'
    exit 1
}
if ($exists -ne 'true') {
    Write-Host "Resource group '$ResourceGroup' does not exist. Nothing to delete." -ForegroundColor Yellow
    exit 0
}

Write-Host "==> The following resources in '$ResourceGroup' will be DELETED:" -ForegroundColor Yellow
az resource list --resource-group $ResourceGroup --output table
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Failed to list resources.'
    exit 1
}

Write-Host ""
Write-Host "==> Deleting resource group '$ResourceGroup'..." -ForegroundColor Yellow
az group delete --name $ResourceGroup --yes
if ($LASTEXITCODE -ne 0) {
    Write-Error 'az group delete failed.'
    exit 1
}

Write-Host "==> Resource group '$ResourceGroup' deleted." -ForegroundColor Green
