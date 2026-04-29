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

$WF_IDS = @{
    "WhatsApp Advisory Loop"   = "xFBc6JGAEJBlBQAM"
    "Daily Harvest Alerts"     = "VI8R4hQ9mJITxsyF"
    "Price Crash Broadcast"    = "TIvHRUCHZolq6XiV"
    "Scheme Eligibility Check" = "AS2n1XlbzOs7Jz3a"
    "Daily Weather Alerts"     = "ttzUUSY42wyDQgEl"
    "FPO Weekly Digest"        = "1IcoKljLeR7LeqFL"
    "Spoilage Emergency"       = "RfGPHsjtjzHMrEQE"
    "Bundle Notification"      = "qirB9pYtjEPn6Ubn"
}

# Instead of re-reading the whole script, I'll just load the codes from there by referencing the variables
# actually since I can't easily source it without running it, I'll just redefine a subset of them to test
# OR I'll just run the original script and pipe it to a file, then read the file.

Write-Host "Starting update of all 8 workflows..."

# I'll re-include the codes here but simplified if needed.
# Actually, I'll just copy the code from the previous tool call's output.

$code1 = @"
import { workflow, node, trigger } from '@n8n/workflow-sdk';
const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Twilio Inbound', path: 'whatsapp-inbound' } });
const parseMsg = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Parse Msg', jsCode: "return [{ json: { from_phone: (\$input.first().json.From || '').replace('whatsapp:',''), user_message: \$input.first().json.Body } }];" } });
const getAdvisory = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: 'http://localhost:8000/api/advisory', method: 'POST' } });
const sendReply = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:$TWILIO_FROM', to: "=whatsapp:{{ \$json.from_phone }}", message: "={{ \$json.advisory_text }}" } });
const logSheet = node({ type: 'n8n-nodes-base.googleSheets', version: 4.4, config: { documentId: '$SHEET_ID', sheetName: 'Advisories' } });

export default workflow('whatsapp-advisory-loop', 'WhatsApp Advisory Loop')
  .add(webhook).to(parseMsg).to(getAdvisory).to(sendReply).to(logSheet);
"@

# I'll just do one for now to see if it works.
$wfName = "WhatsApp Advisory Loop"
$wfId = $WF_IDS[$wfName]

Write-Host "Updating $wfName ($wfId)..."

$body = @{
    jsonrpc = "2.0"
    id      = 1
    method  = "tools/call"
    params  = @{
        name = "update_workflow"
        arguments = @{
            workflowId = $wfId
            code = $code1
            description = "Updated with real details"
        }
    }
} | ConvertTo-Json -Depth 20 -Compress

try {
    $r = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $body -TimeoutSec 60
    Write-Host "Response received!"
    $r | ConvertTo-Json -Depth 10
} catch {
    Write-Error "Failed: $_"
}
