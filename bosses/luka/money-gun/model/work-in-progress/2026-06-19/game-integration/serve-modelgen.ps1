# serve-modelgen.ps1 — spustí lokální HTTP server pro modelgen viewer a otevře prohlížeč.
# Pouzití:
#   .\serve-modelgen.ps1            # jen nastartuje server na portu 8000
#   .\serve-modelgen.ps1 desk_soviet  # nastartuje server a otevře viewer s daným modelem
param(
    [string]$Model = "",
    [int]$Port = 8000
)

$root = $PSScriptRoot
Set-Location $root

# uvolni port, pokud na něm něco visí
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    $busy.OwningProcess | Select-Object -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Uvolnen port $Port." -ForegroundColor Yellow
}

$url = "http://127.0.0.1:$Port/tools/modelgen/viewer.html"
if ($Model -ne "") { $url += "?model=$Model" }

Write-Host "Server bezi na http://127.0.0.1:$Port  (repo root: $root)" -ForegroundColor Green
Write-Host "Viewer:  $url" -ForegroundColor Cyan
Write-Host "Ukoncit:  Ctrl+C" -ForegroundColor DarkGray

if ($Model -ne "") { Start-Process $url }

# blokujici – server bezi dokud neukoncis Ctrl+C
python -m http.server $Port --bind 127.0.0.1
