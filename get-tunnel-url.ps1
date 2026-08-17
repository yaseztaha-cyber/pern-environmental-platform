# Prints the live public tunnel URL(s) from the local ngrok agent.
# Exits 0 and prints one URL per line when a tunnel is running, otherwise exits 1.
try {
  $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 5
  $urls = @($tunnels.tunnels | Where-Object { $_.public_url } | ForEach-Object { $_.public_url })
  if ($urls.Count -gt 0) {
    $urls | ForEach-Object { Write-Output $_ }
    exit 0
  }
  Write-Output "No tunnels found" | Out-Null
  exit 1
} catch {
  exit 1
}
