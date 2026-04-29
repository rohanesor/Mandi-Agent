$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OGIxNmNiMy02MDFlLTQxMDQtYmQ2Mi00ZTljZjUxNThkMGIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYzUxZDgyOGMtNDlkNS00Y2U3LThiMmMtMmZjNGI1YTQ5ZTc2IiwiaWF0IjoxNzc1OTQ1MTk5LCJleHAiOjE3Nzg1MjQyMDB9.ee2ZLsjb7nWeVKHpy6etg7g_VaOAnBdThsaMBg1V-t8"
$headers = @{ "X-N8N-API-KEY" = $token; "Content-Type" = "application/json" }
$content = Get-Content "d:\ktr\mandi_agent\workflows.json" -Raw | ConvertFrom-Json
$wf = $content.data | Where-Object { $_.name -eq "Daily Harvest Alerts" }

for ($i = 1; $i -le $wf.nodes.Count; $i++) {
    $testNodes = ($wf.nodes | Select-Object -First $i) | ForEach-Object {
        $n = $_ | ConvertTo-Json -Depth 20 | ConvertFrom-Json
        if ($n.PSObject.Properties["credentials"]) { $n.PSObject.Properties.Remove("credentials") }
        $n
    }
    $payload = @{ name="test-bisect-$i"; nodes=$testNodes; connections=@{}; settings=@{ executionOrder="v1" } }
    $body = $payload | ConvertTo-Json -Depth 20 -Compress
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:5678/api/v1/workflows" -Headers $headers -Method Post -Body $body
        $nodeType = $wf.nodes[$i-1].type
        $nodeVer = $wf.nodes[$i-1].typeVersion
        Write-Host ("Nodes 1-{0} OK - last: {1} v{2}" -f $i, $nodeType, $nodeVer) -ForegroundColor Green
        Invoke-RestMethod -Uri ("http://localhost:5678/api/v1/workflows/{0}" -f $r.id) -Headers $headers -Method Delete | Out-Null
    } catch {
        $nodeType = $wf.nodes[$i-1].type
        $nodeVer = $wf.nodes[$i-1].typeVersion
        Write-Host ("Nodes 1-{0} FAILED at node {0}: {1} v{2}" -f $i, $nodeType, $nodeVer) -ForegroundColor Red
        break
    }
}
