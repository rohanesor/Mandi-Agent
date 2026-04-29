$mcpToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM"
$url = "https://rohanesor.app.n8n.cloud/mcp-server/http"
$h = @{
    "Authorization" = "Bearer $mcpToken"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json, text/event-stream"
}

$TWILIO_FROM   = "+12602613264"
$COORD_PHONE   = "+916380221196"
$SHEET_ID      = "1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U"

$WF_ID = "xFBc6JGAEJBlBQAM"
$WF_NAME = "WhatsApp Advisory Loop"

Write-Output "Step 1: Preparing code..."
$code = @"
import { workflow, node, trigger } from '@n8n/workflow-sdk';
const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Twilio Inbound', path: 'whatsapp-inbound' } });
const parseMsg = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Parse Msg', jsCode: "return [{ json: { from_phone: (\$input.first().json.From || '').replace('whatsapp:',''), user_message: \$input.first().json.Body } }];" } });
const getAdvisory = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: 'http://localhost:8000/api/advisory', method: 'POST' } });
const sendReply = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:$TWILIO_FROM', to: "=whatsapp:{{ \$json.from_phone }}", message: "={{ \$json.advisory_text }}" } });
const logSheet = node({ type: 'n8n-nodes-base.googleSheets', version: 4.4, config: { documentId: '$SHEET_ID', sheetName: 'Advisories' } });

export default workflow('whatsapp-advisory-loop', 'WhatsApp Advisory Loop')
  .add(webhook).to(parseMsg).to(getAdvisory).to(sendReply).to(logSheet);
"@

Write-Output "Step 2: Sending update request for $WF_NAME ($WF_ID)..."

$body = @{
    jsonrpc = "2.0"
    id      = 1
    method  = "tools/call"
    params  = @{
        name = "update_workflow"
        arguments = @{
            workflowId = $WF_ID
            code = $code
            description = "Updated with real details"
        }
    }
} | ConvertTo-Json -Depth 20 -Compress

try {
    Write-Output "Step 3: Invoking REST API..."
    $r = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $body -TimeoutSec 30
    Write-Output "Step 4: Response received!"
    $r | ConvertTo-Json -Depth 5
} catch {
    Write-Output "Step 5: Error occurred!"
    Write-Output $_.Exception.Message
    if ($_.ErrorDetails) { Write-Output $_.ErrorDetails.Message }
}
