$mcpToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM"
$url = "https://rohanesor.app.n8n.cloud/mcp-server/http"
$baseHeaders = @{
    "Authorization" = "Bearer $mcpToken"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json, text/event-stream"
}

function Invoke-MCPTool($toolName, $toolArgs) {
    $payload = [ordered]@{
        jsonrpc = "2.0"
        id      = 1
        method  = "tools/call"
        params  = [ordered]@{ name = $toolName; arguments = $toolArgs }
    } | ConvertTo-Json -Depth 20 -Compress

    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $baseHeaders -Body $payload
    if ($response -is [string] -and $response -match 'data:\s*(\{.+\})') {
        $json = $Matches[1] | ConvertFrom-Json
        if ($json.result -and $json.result.content) {
            $text = $json.result.content[0].text
            try { return $text | ConvertFrom-Json } catch { return $text }
        }
        return $json
    }
    return $response
}

# ── Discover all nodes we need ────────────────────────────────────
Write-Host "Discovering node types..." -ForegroundColor Cyan
$r = Invoke-MCPTool "search_nodes" @{
    queries = @("schedule trigger","gmail","telegram","google sheets","http request","split in batches","webhook","if","twilio")
}
Write-Host ($r | ConvertTo-Json -Depth 4)
$r | ConvertTo-Json -Depth 10 | Out-File "d:\ktr\mandi_agent\nodes_discovered.json" -Encoding utf8
Write-Host "`nSaved to nodes_discovered.json"
