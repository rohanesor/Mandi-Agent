$mcpToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM"
$url = "https://rohanesor.app.n8n.cloud/mcp-server/http"
$h = @{
    "Authorization" = "Bearer $mcpToken"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json, text/event-stream"
}

$bodyObj = @{
    jsonrpc = "2.0"
    id      = 1
    method  = "tools/call"
    params  = @{
        name      = "get_sdk_reference"
        arguments = @{ sections = @("quickstart") }
    }
}
$body = $bodyObj | ConvertTo-Json -Depth 10 -Compress
$r = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $body
$r | Out-File "d:\ktr\mandi_agent\sdk_raw.txt" -Encoding utf8
Write-Host "Saved. Length: $($r.Length)"
Write-Host $r.Substring(0, [Math]::Min(2000, $r.Length))
