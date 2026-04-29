$mcpToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM"
$url = "https://rohanesor.app.n8n.cloud/mcp-server/http"
$h = @{
    "Authorization" = "Bearer $mcpToken"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json, text/event-stream"
}

# Variables to set
$vars = @{
    TWILIO_WHATSAPP_FROM      = "+12602613264"
    OPS_COORDINATOR_PHONE     = "+916380221196"
    GSHEET_ADVISORIES_ID      = "1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U"
    GSHEET_FPO_REPORTS_ID     = "1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U"
    GSHEET_PRICE_CRASHES_ID   = "1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U"
    GSHEET_EMERGENCIES_ID     = "1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U"
}

# Try listing MCP resources - variables might be manageable via resources
$bodyObj = @{
    jsonrpc = "2.0"; id = 1; method = "resources/list"; params = @{}
} | ConvertTo-Json -Compress
$r = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $bodyObj
Write-Host "Resources:"
Write-Host $r.Substring(0, [Math]::Min(2000, $r.Length))
