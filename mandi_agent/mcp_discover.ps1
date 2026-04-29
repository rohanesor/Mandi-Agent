$mcpToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM"
$url = "https://rohanesor.app.n8n.cloud/mcp-server/http"
$h = @{ Authorization="Bearer $mcpToken"; "Content-Type"="application/json"; "Accept"="application/json, text/event-stream" }

function Invoke-MCP($method, $params) {
    $body = @{ jsonrpc="2.0"; id=1; method=$method; params=$params } | ConvertTo-Json -Depth 20 -Compress
    $raw = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $body
    if ($raw -match 'data: ({.+})') { return ($Matches[1] | ConvertFrom-Json) }
    return $raw
}

function Call-Tool($name, $args) {
    return Invoke-MCP "tools/call" @{ name=$name; arguments=$args }
}

# ─── Get SDK reference (guidelines section) ──────────────────────────────────
Write-Host "Getting SDK reference..." -ForegroundColor Cyan
$sdk = Call-Tool "get_sdk_reference" @{ sections=@("quickstart","guidelines") }
$sdk.result.content[0].text | Out-File "d:\ktr\mandi_agent\sdk_ref.txt" -Encoding utf8
Write-Host "SDK saved to sdk_ref.txt"

# ─── Search key nodes ──────────────────────────────────────────────────────────────
Write-Host "`nSearching nodes..." -ForegroundColor Cyan
$nodeQueries = @("schedule trigger","gmail","telegram","google sheets","http request","split in batches","webhook","if condition","twilio")
$nodeMap = @{}
foreach ($q in $nodeQueries) {
    $r = Call-Tool "search_nodes" @{ query=$q }
    try {
        $results = $r.result.content[0].text | ConvertFrom-Json
        if ($results -and $results.Count -gt 0) {
            $nodeMap[$q] = $results[0].nodeType
            Write-Host "  $q => $($results[0].nodeType) ($($results[0].displayName))"
        }
    } catch { Write-Host "  $q => parse error" -ForegroundColor Red }
}

$nodeMap | ConvertTo-Json | Out-File "d:\ktr\mandi_agent\node_map.json" -Encoding utf8
Write-Host "`nNode map saved."
