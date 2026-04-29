$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OGIxNmNiMy02MDFlLTQxMDQtYmQ2Mi00ZTljZjUxNThkMGIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYzUxZDgyOGMtNDlkNS00Y2U3LThiMmMtMmZjNGI1YTQ5ZTc2IiwiaWF0IjoxNzc1OTQ1MTk5LCJleHAiOjE3Nzg1MjQyMDB9.ee2ZLsjb7nWeVKHpy6etg7g_VaOAnBdThsaMBg1V-t8"
$headers = @{ "X-N8N-API-KEY" = $token; "Content-Type" = "application/json" }
$baseUrl = "http://localhost:5678/api/v1"

$content = Get-Content "d:\ktr\mandi_agent\workflows.json" -Raw | ConvertFrom-Json
$workflows = $content.data

$results = @()

foreach ($wf in $workflows) {
    $name = $wf.name
    Write-Host "Uploading: $name ..." -NoNewline

    # Strip the id so n8n assigns a new one
    $wf.PSObject.Properties.Remove('id')

    # Build a clean payload with only what n8n needs
    $payload = @{
        name   = $wf.name
        nodes  = $wf.nodes
        connections = $wf.connections
        settings = if ($wf.settings) { $wf.settings } else { @{} }
    }
    if ($wf.staticData) { $payload.staticData = $wf.staticData }

    $body = $payload | ConvertTo-Json -Depth 20 -Compress

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/workflows" -Headers $headers -Method Post -Body $body
        Write-Host " OK (id=$($response.id))" -ForegroundColor Green
        $results += [PSCustomObject]@{ name = $name; id = $response.id; status = "uploaded" }
    } catch {
        $err = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($err)
        $errBody = $reader.ReadToEnd()
        Write-Host " FAILED: $errBody" -ForegroundColor Red
        $results += [PSCustomObject]@{ name = $name; id = ""; status = "failed: $errBody" }
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$results | ConvertTo-Json | Set-Content "d:\ktr\mandi_agent\upload_results.json"
