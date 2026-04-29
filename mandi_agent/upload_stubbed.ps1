$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OGIxNmNiMy02MDFlLTQxMDQtYmQ2Mi00ZTljZjUxNThkMGIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYzUxZDgyOGMtNDlkNS00Y2U3LThiMmMtMmZjNGI1YTQ5ZTc2IiwiaWF0IjoxNzc1OTQ1MTk5LCJleHAiOjE3Nzg1MjQyMDB9.ee2ZLsjb7nWeVKHpy6etg7g_VaOAnBdThsaMBg1V-t8"
$headers = @{ "X-N8N-API-KEY" = $token; "Content-Type" = "application/json" }
$baseUrl = "http://localhost:5678/api/v1"

# Nodes that require external credentials - replace with noOp placeholder
$externalNodes = @(
    "n8n-nodes-base.twilio",
    "n8n-nodes-base.supabase",
    "n8n-nodes-base.notion",
    "n8n-nodes-base.gmail",
    "n8n-nodes-base.slack",
    "n8n-nodes-base.telegram"
)

$content = Get-Content "d:\ktr\mandi_agent\workflows.json" -Raw | ConvertFrom-Json
$failNames = @("Daily Harvest Alerts", "FPO Weekly Digest", "Price Crash Broadcast")
$workflows = $content.data | Where-Object { $failNames -contains $_.name }

$results = @()

foreach ($wf in $workflows) {
    $name = $wf.name
    Write-Host "Uploading: $name ..." -NoNewline

    # Replace external nodes with noOp, keep all others
    $cleanNodes = $wf.nodes | ForEach-Object {
        $node = $_ | ConvertTo-Json -Depth 20 | ConvertFrom-Json
        # Remove credentials
        if ($node.PSObject.Properties["credentials"]) {
            $node.PSObject.Properties.Remove("credentials")
        }
        # Replace unsupported external nodes with a noOp placeholder
        if ($externalNodes -contains $node.type) {
            $node.type = "n8n-nodes-base.noOp"
            $node.typeVersion = 1
            $node.parameters = @{}
            # Add note so user knows what it was
            if (-not $node.PSObject.Properties["notes"]) {
                $node | Add-Member -MemberType NoteProperty -Name "notes" -Value "PLACEHOLDER: was $($node.type)" -Force
            }
        }
        $node
    }

    $payload = @{
        name        = $wf.name
        nodes       = $cleanNodes
        connections = $wf.connections
        settings    = if ($wf.settings) { $wf.settings } else { @{ executionOrder = "v1" } }
    }

    $body = $payload | ConvertTo-Json -Depth 20 -Compress

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/workflows" -Headers $headers -Method Post -Body $body
        Write-Host " OK (id=$($response.id))" -ForegroundColor Green
        $results += [PSCustomObject]@{ name = $name; id = $response.id; status = "uploaded (external nodes stubbed)" }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errBody = $reader.ReadToEnd()
        } catch { $errBody = "n/a" }
        Write-Host " FAILED [$statusCode]: $errBody" -ForegroundColor Red
        $results += [PSCustomObject]@{ name = $name; id = ""; status = "failed [$statusCode]: $errBody" }
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
