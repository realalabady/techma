# Grants public (allUsers) invoke access to every Cloud Function in the project.
#
# Firebase callable/HTTPS functions are meant to be publicly invocable — auth is
# enforced INSIDE the function via context.auth. Under a GCP organization, the
# automatic grant during `firebase deploy` can be blocked by the
# "Domain restricted sharing" org policy, leaving functions private → browsers
# get a 403 on the CORS preflight ("No Access-Control-Allow-Origin header").
#
# Prereqs:
#   gcloud auth login
#   (and, if the org policy blocks allUsers, relax Domain Restricted Sharing first
#    — see the console steps in the chat/README.)
#
# Usage:
#   ./functions/scripts/grant-public-invoker.ps1 -Project estore-8f76b -Region us-central1

param(
  [string]$Project = "estore-8f76b",
  [string]$Region  = "us-central1"
)

$ErrorActionPreference = "Stop"
gcloud config set project $Project | Out-Null

# Discover all deployed function names.
$names = gcloud functions list --project $Project --regions $Region --format="value(name)"
if (-not $names) { Write-Host "No functions found."; exit 1 }

foreach ($n in $names) {
  $name = $n.Trim()
  if (-not $name) { continue }
  Write-Host "Granting allUsers invoker on $name ..."
  gcloud functions add-iam-policy-binding $name `
    --region=$Region `
    --member="allUsers" `
    --role="roles/cloudfunctions.invoker" `
    --project=$Project | Out-Null
}

Write-Host "`nDone. All functions in $Region are now publicly invocable." -ForegroundColor Green
