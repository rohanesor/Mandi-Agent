$mcpToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM"
$url = "https://rohanesor.app.n8n.cloud/mcp-server/http"
$h = @{
    "Authorization" = "Bearer $mcpToken"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json, text/event-stream"
}

# ── FPO WEEKLY DIGEST (no parallel - chain sequentially) ────────
$wf_fpo = @'
import { workflow, node, trigger, splitInBatches, nextBatch } from '@n8n/workflow-sdk';

const cron = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Monday 8AM IST',
    position: [0, 300],
    parameters: {
      rule: {
        interval: [{ triggerAtHour: 8, triggerAtMinute: 0, dayOfWeek: 'monday', timezone: 'Asia/Kolkata' }]
      }
    }
  },
  output: [{}]
});

const getFPOList = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET FPO List',
    position: [220, 300],
    parameters: { url: 'http://localhost:8000/api/fpo/list', method: 'GET', options: {} }
  },
  output: [{ fpo_id: 'fpo001', fpo_name: 'Karnataka Tomato FPO', coordinator_phone: '+919876543210', coordinator_email: 'coord@fpo.com' }]
});

const loop = splitInBatches({
  version: 3,
  config: { name: 'Loop Per FPO', position: [440, 300], parameters: { batchSize: 5, options: {} } },
  items: [{ fpo_id: 'fpo001' }]
});

const getStats = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET FPO Weekly Stats',
    position: [660, 300],
    parameters: {
      url: '=http://localhost:8000/api/fpo/{{ $json.fpo_id }}/weekly-stats',
      method: 'GET',
      options: {}
    }
  },
  output: [{ fpo_id: 'fpo001', fpo_name: 'Karnataka Tomato FPO', week_start: '2026-04-06', week_end: '2026-04-12', advisories_sent: 120, bundles_formed: 8, total_transport_savings: 45000, active_farmers: 95, coordinator_phone: '+919876543210', coordinator_email: 'coord@fpo.com' }]
});

const logSheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.4,
  config: {
    name: 'Log FPO Report to Sheets',
    position: [880, 300],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, value: "={{ $env.GSHEET_FPO_REPORTS_ID }}", mode: 'id' },
      sheetName: { __rl: true, value: 'FPO Reports', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          fpo_id: '={{ $json.fpo_id }}',
          fpo_name: '={{ $json.fpo_name }}',
          week_start: '={{ $json.week_start }}',
          week_end: '={{ $json.week_end }}',
          advisories_sent: '={{ $json.advisories_sent }}',
          bundles_formed: '={{ $json.bundles_formed }}',
          total_savings: '={{ $json.total_transport_savings }}',
          active_farmers: '={{ $json.active_farmers }}'
        }
      },
      options: {}
    }
  },
  output: [{}]
});

const whatsappCoord = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Summary to Coordinator',
    position: [1100, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: "={{ $env.TWILIO_WHATSAPP_FROM }}",
      to: "=whatsapp:{{ $('GET FPO Weekly Stats').item.json.coordinator_phone }}",
      message: "=Mandi-Agent Weekly Report\nFPO: {{ $('GET FPO Weekly Stats').item.json.fpo_name }}\nWeek: {{ $('GET FPO Weekly Stats').item.json.week_start }} to {{ $('GET FPO Weekly Stats').item.json.week_end }}\nAdvisories: {{ $('GET FPO Weekly Stats').item.json.advisories_sent }}\nBundles: {{ $('GET FPO Weekly Stats').item.json.bundles_formed }}\nSavings: Rs.{{ $('GET FPO Weekly Stats').item.json.total_transport_savings }}\nActive Farmers: {{ $('GET FPO Weekly Stats').item.json.active_farmers }}"
    }
  },
  output: [{}]
});

const gmail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Gmail Weekly Report Email',
    position: [1100, 500],
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: "={{ $('GET FPO Weekly Stats').item.json.coordinator_email }}",
      subject: "=Mandi-Agent Weekly Report - {{ $('GET FPO Weekly Stats').item.json.fpo_name }} ({{ $('GET FPO Weekly Stats').item.json.week_start }})",
      emailType: 'html',
      message: "=<h2>{{ $('GET FPO Weekly Stats').item.json.fpo_name }} Weekly Report</h2><p>Week: {{ $('GET FPO Weekly Stats').item.json.week_start }} to {{ $('GET FPO Weekly Stats').item.json.week_end }}</p><ul><li>Advisories: {{ $('GET FPO Weekly Stats').item.json.advisories_sent }}</li><li>Bundles: {{ $('GET FPO Weekly Stats').item.json.bundles_formed }}</li><li>Savings: Rs.{{ $('GET FPO Weekly Stats').item.json.total_transport_savings }}</li><li>Active Farmers: {{ $('GET FPO Weekly Stats').item.json.active_farmers }}</li></ul>",
      options: {}
    }
  },
  output: [{}]
});

export default workflow('fpo-weekly-digest', 'FPO Weekly Digest')
  .add(cron)
  .to(getFPOList)
  .to(loop)
  .to(getStats)
  .to(logSheet)
  .to(whatsappCoord)
  .to(gmail)
  .to(nextBatch(loop));
'@

# ── SPOILAGE EMERGENCY (no parallel) ────────────────────────────
$wf_spoilage = @'
import { workflow, node, trigger } from '@n8n/workflow-sdk';

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2,
  config: {
    name: 'Spoilage Alert Webhook',
    position: [0, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'spoilage-emergency',
      responseMode: 'lastNode',
      options: {}
    }
  },
  output: [{ farmer_id: 'f001', farmer_name: 'Raju', farmer_phone: '+919876543210', crop: 'Tomato', quantity_kg: 500 }]
});

const getColdStorage = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Nearest Cold Storage',
    position: [220, 300],
    parameters: {
      url: 'http://localhost:8000/api/cold-storage/nearest',
      method: 'POST',
      sendBody: true,
      bodyParameters: {
        parameters: [
          { name: 'farmer_id', value: '={{ $json.farmer_id }}' },
          { name: 'crop', value: '={{ $json.crop }}' },
          { name: 'quantity_kg', value: '={{ $json.quantity_kg }}' }
        ]
      },
      options: {}
    }
  },
  output: [{ farmer_name: 'Raju', farmer_phone: '+919876543210', crop: 'Tomato', quantity_kg: 500, nearest_storage_name: 'Cool Farm Store', distance_km: 12, storage_contact: '+919000000001' }]
});

const telegramAlert = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Telegram Farmer Group Alert',
    position: [440, 300],
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: "={{ $env.TELEGRAM_BLOCK_GROUP_ID }}",
      text: "=SPOILAGE EMERGENCY\nFarmer: {{ $json.farmer_name }}\nCrop: {{ $json.crop }} ({{ $json.quantity_kg }} kg)\nNearest Cold Storage: {{ $json.nearest_storage_name }}\nDistance: {{ $json.distance_km }} km\nContact: {{ $json.storage_contact }}",
      additionalFields: {}
    }
  },
  output: [{}]
});

const whatsappFarmer = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Direct Alert to Farmer',
    position: [660, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: "={{ $env.TWILIO_WHATSAPP_FROM }}",
      to: "=whatsapp:{{ $('GET Nearest Cold Storage').item.json.farmer_phone }}",
      message: "=Emergency: Nearest cold storage for your {{ $json.crop }} is {{ $json.nearest_storage_name }} ({{ $json.distance_km }} km). Call: {{ $json.storage_contact }}"
    }
  },
  output: [{}]
});

const logSheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.4,
  config: {
    name: 'Log Spoilage Event',
    position: [880, 300],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, value: "={{ $env.GSHEET_EMERGENCIES_ID }}", mode: 'id' },
      sheetName: { __rl: true, value: 'Spoilage Events', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          farmer_name: "={{ $('GET Nearest Cold Storage').item.json.farmer_name }}",
          crop: '={{ $json.crop }}',
          quantity_kg: "={{ $('GET Nearest Cold Storage').item.json.quantity_kg }}",
          cold_storage: '={{ $json.nearest_storage_name }}',
          timestamp: '={{ $now }}'
        }
      },
      options: {}
    }
  },
  output: [{}]
});

export default workflow('spoilage-emergency', 'Spoilage Emergency')
  .add(webhook)
  .to(getColdStorage)
  .to(telegramAlert)
  .to(whatsappFarmer)
  .to(logSheet);
'@

# ── BUNDLE NOTIFICATION (no parallel) ───────────────────────────
$wf_bundle = @'
import { workflow, node, trigger, splitInBatches, nextBatch } from '@n8n/workflow-sdk';

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2,
  config: {
    name: 'Bundle Ready Webhook',
    position: [0, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'bundle-notification',
      responseMode: 'lastNode',
      options: {}
    }
  },
  output: [{ bundle_id: 'b001', crop: 'Tomato', bundle_size: 12, pickup_point: 'Hubli Yard', pickup_date: '2026-04-15', estimated_savings: 3000, total_savings: 36000 }]
});

const telegramGroup = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Telegram Bundle Announcement',
    position: [220, 300],
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: "={{ $env.TELEGRAM_BLOCK_GROUP_ID }}",
      text: "=Bundle formed for {{ $json.crop }}!\nFarmers in bundle: {{ $json.bundle_size }}\nPickup: {{ $json.pickup_point }} on {{ $json.pickup_date }}\nTotal savings: Rs.{{ $json.total_savings }}",
      additionalFields: {}
    }
  },
  output: [{}]
});

const getFarmers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Bundle Farmers',
    position: [440, 300],
    parameters: {
      url: '=http://localhost:8000/api/bundles/{{ $json.bundle_id }}/farmers',
      method: 'GET',
      options: {}
    }
  },
  output: [{ farmer_phone: '+919876543210', farmer_name: 'Raju', crop: 'Tomato', bundle_size: 12, pickup_point: 'Hubli Yard', pickup_date: '2026-04-15', estimated_savings: 3000 }]
});

const loop = splitInBatches({
  version: 3,
  config: { name: 'Loop Bundle Farmers', position: [660, 300], parameters: { batchSize: 20, options: {} } },
  items: [{ farmer_phone: '+919876543210' }]
});

const whatsappBundle = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Bundle Alert',
    position: [880, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: "={{ $env.TWILIO_WHATSAPP_FROM }}",
      to: "=whatsapp:{{ $json.farmer_phone }}",
      message: "=Good news! Your {{ $json.crop }} has been bundled with {{ $json.bundle_size }} other farmers.\nPickup: {{ $json.pickup_point }}\nDate: {{ $json.pickup_date }}\nEstimated savings: Rs.{{ $json.estimated_savings }}"
    }
  },
  output: [{}]
});

export default workflow('bundle-notification', 'Bundle Notification')
  .add(webhook)
  .to(telegramGroup)
  .to(getFarmers)
  .to(loop)
  .to(whatsappBundle)
  .to(nextBatch(loop));
'@

# ─── Upload the 3 remaining ─────────────────────────────────────
$remaining = @(
    @{ name="FPO Weekly Digest";   code=$wf_fpo;     desc="Monday 8AM: generates weekly FPO stats, logs to Google Sheets, sends WhatsApp summary and Gmail to coordinator." },
    @{ name="Spoilage Emergency";  code=$wf_spoilage; desc="Emergency webhook: finds nearest cold storage, alerts farmer via WhatsApp and Telegram." },
    @{ name="Bundle Notification"; code=$wf_bundle;   desc="Bundle formation webhook: announces to Telegram group, sends WhatsApp messages to individual farmers." }
)

foreach ($wf in $remaining) {
    Write-Host ""
    Write-Host "[$($wf.name)]" -ForegroundColor Yellow -NoNewline

    $valBody = @{
        jsonrpc = "2.0"; id = 1; method = "tools/call"
        params  = @{ name = "validate_workflow"; arguments = @{ code = $wf.code } }
    } | ConvertTo-Json -Depth 20 -Compress

    $vRaw = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $valBody
    if ($vRaw -match '"isValid"\s*:\s*false|"valid"\s*:\s*false') {
        Write-Host " INVALID" -ForegroundColor Red
        if ($vRaw -match '"message"\s*:\s*"([^"]{0,300})') { Write-Host "  $($Matches[1])" }
        continue
    }
    Write-Host " valid, creating..." -NoNewline

    $createBody = @{
        jsonrpc = "2.0"; id = 2; method = "tools/call"
        params  = @{ name = "create_workflow_from_code"; arguments = @{ code = $wf.code; name = $wf.name; description = $wf.desc } }
    } | ConvertTo-Json -Depth 20 -Compress

    $cRaw = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $createBody

    if ($cRaw -match '"workflowId"\s*:\s*"([^"]+)"') {
        Write-Host " CREATED (id=$($Matches[1]))" -ForegroundColor Green
        if ($cRaw -match '"url"\s*:\s*"([^"]+)"') { Write-Host "  $($Matches[1])" }
    } else {
        Write-Host " Response:" -ForegroundColor Yellow
        Write-Host $cRaw.Substring(0, [Math]::Min(400, $cRaw.Length))
    }
}

Write-Host ""
Write-Host "Done! Check https://rohanesor.app.n8n.cloud" -ForegroundColor Cyan
