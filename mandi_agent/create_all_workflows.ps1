$mcpToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM"
$url = "https://rohanesor.app.n8n.cloud/mcp-server/http"
$h = @{
    "Authorization" = "Bearer $mcpToken"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json, text/event-stream"
}

function Invoke-MCPTool([string]$toolName, [hashtable]$toolArgs) {
    $bodyObj = @{
        jsonrpc = "2.0"
        id      = [int][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        method  = "tools/call"
        params  = @{ name = $toolName; arguments = $toolArgs }
    }
    $body = $bodyObj | ConvertTo-Json -Depth 20 -Compress
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $body
    if ($response -is [string] -and $response -match 'data:\s*(\{.+\})\s*\n') {
        $json = $Matches[1] | ConvertFrom-Json
        if ($json.result -and $json.result.content) {
            $text = $json.result.content[0].text
            if ($json.result.isError) { Write-Warning "MCP Tool Error: $text"; return $null }
            return $text
        }
    }
    return $response
}

function Create-Workflow([string]$name, [string]$code, [string]$desc) {
    Write-Host ""
    Write-Host ">>> $name" -ForegroundColor Cyan

    # Validate
    $v = Invoke-MCPTool "validate_workflow" @{ code = $code }
    if ($null -eq $v) {
        Write-Host "    [SKIP] validation returned null (MCP error)" -ForegroundColor Yellow
        return
    }
    if ($v -match '"isValid"\s*:\s*false|"valid"\s*:\s*false') {
        Write-Host "    [INVALID]" -ForegroundColor Red
        if ($v -match '"errors"\s*:\s*\[([^\]]+)\]') { Write-Host "    $($Matches[1])" }
        return
    }
    Write-Host "    Validated OK" -ForegroundColor DarkGreen

    # Create
    $r = Invoke-MCPTool "create_workflow_from_code" @{ code = $code; name = $name; description = $desc }
    if ($null -eq $r) {
        Write-Host "    [FAILED] create returned null" -ForegroundColor Red
        return
    }
    if ($r -match '"id"\s*:\s*"([^"]+)"') {
        Write-Host "    Created! id=$($Matches[1])" -ForegroundColor Green
    } else {
        Write-Host "    Response: $($r.Substring(0,[Math]::Min(200,$r.Length)))" -ForegroundColor Yellow
    }
}

# ═══════════════════════════════════════════════════════
# SDK PATTERN (correct - no 'new', uses factory functions)
# ═══════════════════════════════════════════════════════

# ── 1. WHATSAPP ADVISORY LOOP ───────────────────────────────────
$wf1 = @'
import { workflow, node, trigger, splitInBatches } from '@n8n/workflow-sdk';

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2,
  config: {
    name: 'Twilio WhatsApp Inbound',
    position: [0, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'whatsapp-inbound',
      responseMode: 'lastNode',
      options: {}
    }
  },
  output: [{ from_phone: '+919876543210', user_message: 'What is tomato price today?' }]
});

const parseMsg = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Incoming Message',
    position: [220, 300],
    parameters: {
      jsCode: "const body = $input.first().json;\nconst from = (body.From || body.from || '').replace('whatsapp:', '');\nconst text = body.Body || body.body || '';\nreturn [{ json: { from_phone: from, user_message: text, timestamp: new Date().toISOString() } }];"
    }
  },
  output: [{ from_phone: '+919876543210', user_message: 'tomato price', timestamp: '2026-04-12T00:00:00Z' }]
});

const getAdvisory = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Advisory from Backend',
    position: [440, 300],
    parameters: {
      url: 'http://localhost:8000/api/advisory',
      method: 'POST',
      sendBody: true,
      bodyParameters: {
        parameters: [
          { name: 'farmer_phone', value: "={{ $('Parse Incoming Message').item.json.from_phone }}" },
          { name: 'message', value: "={{ $('Parse Incoming Message').item.json.user_message }}" }
        ]
      },
      options: { timeout: 60000 }
    }
  },
  output: [{ advisory_text: 'Tomato price at Mysore Mandi: Rs.1200/quintal' }]
});

const sendReply = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'Send WhatsApp Reply',
    position: [660, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: "={{ $env.TWILIO_WHATSAPP_FROM }}",
      to: "=whatsapp:{{ $('Parse Incoming Message').item.json.from_phone }}",
      message: "={{ $json.advisory_text }}"
    }
  },
  output: [{ status: 'sent' }]
});

const logSheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.4,
  config: {
    name: 'Log to Google Sheets',
    position: [880, 300],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, value: "={{ $env.GSHEET_ADVISORIES_ID }}", mode: 'id' },
      sheetName: { __rl: true, value: 'Advisories', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          farmer_phone: "={{ $('Parse Incoming Message').item.json.from_phone }}",
          message: "={{ $('Parse Incoming Message').item.json.user_message }}",
          advisory: "={{ $('GET Advisory from Backend').item.json.advisory_text }}",
          timestamp: "={{ $('Parse Incoming Message').item.json.timestamp }}"
        }
      },
      options: {}
    }
  },
  output: [{}]
});

export default workflow('whatsapp-advisory-loop', 'WhatsApp Advisory Loop')
  .add(webhook)
  .to(parseMsg)
  .to(getAdvisory)
  .to(sendReply)
  .to(logSheet);
'@

# ── 2. DAILY HARVEST ALERTS ─────────────────────────────────────
$wf2 = @'
import { workflow, node, trigger, splitInBatches, nextBatch } from '@n8n/workflow-sdk';

const cron = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Daily 6AM IST',
    position: [0, 300],
    parameters: {
      rule: {
        interval: [{ triggerAtHour: 6, triggerAtMinute: 0, timezone: 'Asia/Kolkata' }]
      }
    }
  },
  output: [{}]
});

const getAlerts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Harvest Alerts Due',
    position: [220, 300],
    parameters: { url: 'http://localhost:8000/api/harvest-alerts-due', method: 'GET', options: {} }
  },
  output: [{ farmer_id: 'f001', farmer_phone: '+919876543210', crop: 'Tomato' }]
});

const loop = splitInBatches({
  version: 3,
  config: { name: 'Loop Over Farmers', position: [440, 300], parameters: { batchSize: 10, options: {} } },
  items: [{ farmer_id: 'f001' }]
});

const genAdvisory = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Generate Advisory',
    position: [660, 300],
    parameters: {
      url: 'http://localhost:8000/api/advisory',
      method: 'POST',
      sendBody: true,
      bodyParameters: {
        parameters: [{ name: 'farmer_id', value: '={{ $json.farmer_id }}' }]
      },
      options: { timeout: 60000 }
    }
  },
  output: [{ farmer_id: 'f001', farmer_phone: '+919876543210', advisory_text: 'Your tomato is ready to harvest.' }]
});

const sendWA = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'Send WhatsApp Advisory',
    position: [880, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: "={{ $env.TWILIO_WHATSAPP_FROM }}",
      to: "=whatsapp:{{ $json.farmer_phone }}",
      message: "={{ $json.advisory_text }}"
    }
  },
  output: [{ status: 'sent' }]
});

const logSheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.4,
  config: {
    name: 'Log Advisory to Sheets',
    position: [1100, 300],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, value: "={{ $env.GSHEET_ADVISORIES_ID }}", mode: 'id' },
      sheetName: { __rl: true, value: 'Advisories', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          farmer_id: '={{ $json.farmer_id }}',
          farmer_phone: '={{ $json.farmer_phone }}',
          advisory_text: '={{ $json.advisory_text }}',
          sent_via: 'proactive_whatsapp',
          sent_at: '={{ $now }}'
        }
      },
      options: {}
    }
  },
  output: [{}]
});

export default workflow('daily-harvest-alerts', 'Daily Harvest Alerts')
  .add(cron)
  .to(getAlerts)
  .to(loop)
  .to(genAdvisory)
  .to(sendWA)
  .to(logSheet)
  .to(nextBatch(loop));
'@

# ── 3. PRICE CRASH BROADCAST ────────────────────────────────────
$wf3 = @'
import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2,
  config: {
    name: 'Price Crash Webhook',
    position: [0, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'price-crash',
      responseMode: 'lastNode',
      options: {}
    }
  },
  output: [{ crop: 'Tomato', block_id: 'BLK001', drop_pct: 35, current_price: 800, forecast_price: 520, alternative_mandi: 'Mysore', alternative_price: 900, affected_farmer_count: 45 }]
});

const ifDrop = ifElse({
  version: 2.3,
  config: {
    name: 'If Drop > 25%',
    position: [220, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'drop-check',
          leftValue: '={{ $json.drop_pct }}',
          rightValue: 25,
          operator: { type: 'number', operation: 'gt' }
        }],
        combinator: 'and'
      },
      options: {}
    }
  },
  true: [{ crop: 'Tomato', drop_pct: 35 }],
  false: []
});

const telegramAlert = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Telegram Block Group Alert',
    position: [440, 200],
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: "={{ $env.TELEGRAM_BLOCK_GROUP_ID }}",
      text: "=Price Crash Alert - {{ $json.block_id }}\nCrop: {{ $json.crop }}\nDrop: {{ $json.drop_pct }}%\nForecast: Rs.{{ $json.forecast_price }}/quintal\nGo to: {{ $json.alternative_mandi }} (Rs.{{ $json.alternative_price }})",
      additionalFields: { parse_mode: 'Markdown' }
    }
  },
  output: [{ ok: true }]
});

const logSheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.4,
  config: {
    name: 'Log Crash to Google Sheets',
    position: [660, 200],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, value: "={{ $env.GSHEET_PRICE_CRASHES_ID }}", mode: 'id' },
      sheetName: { __rl: true, value: 'Price Crashes', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          block_id: '={{ $json.block_id }}',
          crop: '={{ $json.crop }}',
          drop_pct: '={{ $json.drop_pct }}',
          current_price: '={{ $json.current_price }}',
          forecast_price: '={{ $json.forecast_price }}',
          alternative_mandi: '={{ $json.alternative_mandi }}',
          affected_farmers: '={{ $json.affected_farmer_count }}',
          timestamp: '={{ $now }}'
        }
      },
      options: {}
    }
  },
  output: [{}]
});

const ifSevere = ifElse({
  version: 2.3,
  config: {
    name: 'If Severe Crash > 40%',
    position: [880, 200],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'severe-check',
          leftValue: '={{ $json.drop_pct }}',
          rightValue: 40,
          operator: { type: 'number', operation: 'gt' }
        }],
        combinator: 'and'
      },
      options: {}
    }
  },
  true: [{ drop_pct: 45 }],
  false: [{ drop_pct: 35 }]
});

const whatsappOps = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Ops Coordinator Alert',
    position: [1100, 100],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: "={{ $env.TWILIO_WHATSAPP_FROM }}",
      to: "=whatsapp:{{ $env.OPS_COORDINATOR_PHONE }}",
      message: "=SEVERE Crash (>40%)\nCrop: {{ $json.crop }} in {{ $json.block_id }}\nDrop: {{ $json.drop_pct }}%\nFarmers Affected: {{ $json.affected_farmer_count }}\nImmediate action required!"
    }
  },
  output: [{}]
});

const recalculate = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'POST Recalculate Harvest Intent',
    position: [1100, 400],
    parameters: {
      url: 'http://localhost:8000/api/harvest-intent/recalculate',
      method: 'POST',
      sendBody: true,
      bodyParameters: {
        parameters: [
          { name: 'block_id', value: '={{ $json.block_id }}' },
          { name: 'crop', value: '={{ $json.crop }}' }
        ]
      },
      options: {}
    }
  },
  output: [{}]
});

export default workflow('price-crash-broadcast', 'Price Crash Broadcast')
  .add(webhook)
  .to(ifDrop, {
    true: [telegramAlert, logSheet, ifSevere, {
      true: [whatsappOps],
      false: [recalculate]
    }]
  });
'@

# ── 4. FPO WEEKLY DIGEST ────────────────────────────────────────
$wf4 = @'
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
    position: [1100, 200],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: "={{ $env.TWILIO_WHATSAPP_FROM }}",
      to: "=whatsapp:{{ $json.coordinator_phone }}",
      message: "=Mandi-Agent Weekly Report\nFPO: {{ $json.fpo_name }}\nWeek: {{ $json.week_start }} to {{ $json.week_end }}\nAdvisories: {{ $json.advisories_sent }}\nBundles: {{ $json.bundles_formed }}\nSavings: Rs.{{ $json.total_transport_savings }}\nActive Farmers: {{ $json.active_farmers }}"
    }
  },
  output: [{}]
});

const gmail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Gmail Weekly Report Email',
    position: [1100, 450],
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: '={{ $json.coordinator_email }}',
      subject: '=Mandi-Agent Weekly Report - {{ $json.fpo_name }} ({{ $json.week_start }})',
      emailType: 'html',
      message: '=<h2>{{ $json.fpo_name }} Weekly Report</h2><p>Week: {{ $json.week_start }} to {{ $json.week_end }}</p><ul><li>Advisories Sent: {{ $json.advisories_sent }}</li><li>Bundles Formed: {{ $json.bundles_formed }}</li><li>Transport Savings: Rs.{{ $json.total_transport_savings }}</li><li>Active Farmers: {{ $json.active_farmers }}</li></ul>',
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
  .parallel(whatsappCoord, gmail)
  .to(nextBatch(loop));
'@

# ── 5. SPOILAGE EMERGENCY ───────────────────────────────────────
$wf5 = @'
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
    position: [440, 200],
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
    position: [440, 450],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: "={{ $env.TWILIO_WHATSAPP_FROM }}",
      to: "=whatsapp:{{ $json.farmer_phone }}",
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
    position: [660, 300],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, value: "={{ $env.GSHEET_EMERGENCIES_ID }}", mode: 'id' },
      sheetName: { __rl: true, value: 'Spoilage Events', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          farmer_id: '={{ $json.farmer_id }}',
          farmer_name: '={{ $json.farmer_name }}',
          crop: '={{ $json.crop }}',
          quantity_kg: '={{ $json.quantity_kg }}',
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
  .parallel(telegramAlert, whatsappFarmer)
  .to(logSheet);
'@

# ── 6. BUNDLE NOTIFICATION ──────────────────────────────────────
$wf6 = @'
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

const getFarmers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Bundle Farmers',
    position: [220, 300],
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
  config: { name: 'Loop Bundle Farmers', position: [440, 300], parameters: { batchSize: 20, options: {} } },
  items: [{ farmer_phone: '+919876543210' }]
});

const whatsappBundle = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Bundle Alert',
    position: [660, 300],
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

const telegramGroup = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Telegram Bundle Announcement',
    position: [880, 300],
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: "={{ $env.TELEGRAM_BLOCK_GROUP_ID }}",
      text: "=Bundle formed for {{ $json.crop }}!\nFarmers: {{ $json.bundle_size }}\nPickup: {{ $json.pickup_point }} on {{ $json.pickup_date }}\nTotal savings: Rs.{{ $json.total_savings }}",
      additionalFields: {}
    }
  },
  output: [{}]
});

export default workflow('bundle-notification', 'Bundle Notification')
  .add(webhook)
  .to(getFarmers)
  .to(loop)
  .parallel(whatsappBundle, telegramGroup)
  .to(nextBatch(loop));
'@

# ── 7. SCHEME ELIGIBILITY CHECK ────────────────────────────────
$wf7 = @'
import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2,
  config: {
    name: 'Scheme Check Webhook',
    position: [0, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'scheme-check',
      responseMode: 'lastNode',
      options: {}
    }
  },
  output: [{ farmer_id: 'f001', farmer_phone: '+919876543210', crop: 'Tomato', state: 'Karnataka' }]
});

const checkSchemes = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Eligible Schemes',
    position: [220, 300],
    parameters: {
      url: 'http://localhost:8000/api/schemes/eligible',
      method: 'POST',
      sendBody: true,
      bodyParameters: {
        parameters: [
          { name: 'farmer_id', value: '={{ $json.farmer_id }}' },
          { name: 'crop', value: '={{ $json.crop }}' },
          { name: 'state', value: '={{ $json.state }}' }
        ]
      },
      options: {}
    }
  },
  output: [{ farmer_id: 'f001', farmer_phone: '+919876543210', schemes_count: 2, schemes_summary: 'PM-KISAN: Rs.6000/year, PMFBY: Crop Insurance' }]
});

const ifEligible = ifElse({
  version: 2.3,
  config: {
    name: 'If Schemes Found',
    position: [440, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'has-schemes',
          leftValue: '={{ $json.schemes_count }}',
          rightValue: 0,
          operator: { type: 'number', operation: 'gt' }
        }],
        combinator: 'and'
      },
      options: {}
    }
  },
  true: [{ schemes_count: 2 }],
  false: []
});

const whatsappScheme = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Scheme Alert',
    position: [660, 200],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: "={{ $env.TWILIO_WHATSAPP_FROM }}",
      to: "=whatsapp:{{ $json.farmer_phone }}",
      message: "=Good news! You are eligible for {{ $json.schemes_count }} government scheme(s):\n{{ $json.schemes_summary }}\n\nVisit nearest CSC or call 1800-180-1551 to apply."
    }
  },
  output: [{}]
});

const logSheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.4,
  config: {
    name: 'Log Scheme Check',
    position: [880, 200],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, value: "={{ $env.GSHEET_ADVISORIES_ID }}", mode: 'id' },
      sheetName: { __rl: true, value: 'Scheme Checks', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          farmer_id: '={{ $json.farmer_id }}',
          crop: '={{ $json.crop }}',
          schemes_found: '={{ $json.schemes_count }}',
          timestamp: '={{ $now }}'
        }
      },
      options: {}
    }
  },
  output: [{}]
});

export default workflow('scheme-eligibility-check', 'Scheme Eligibility Check')
  .add(webhook)
  .to(checkSchemes)
  .to(ifEligible, {
    true: [whatsappScheme, logSheet]
  });
'@

# ── 8. DAILY WEATHER ALERTS ────────────────────────────────────
$wf8 = @'
import { workflow, node, trigger, splitInBatches, nextBatch, ifElse } from '@n8n/workflow-sdk';

const cron = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Daily 5:30AM IST',
    position: [0, 300],
    parameters: {
      rule: {
        interval: [{ triggerAtHour: 5, triggerAtMinute: 30, timezone: 'Asia/Kolkata' }]
      }
    }
  },
  output: [{}]
});

const getWeather = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Weather Alerts',
    position: [220, 300],
    parameters: { url: 'http://localhost:8000/api/weather/daily-alerts', method: 'GET', options: {} }
  },
  output: [{ block_id: 'BLK001', block_name: 'Hubli Block', has_alert: true, alert_type: 'Heavy Rain', alert_message: 'Heavy rainfall expected. Delay harvesting.', farming_recommendation: 'Cover stored produce. Delay harvest by 2 days.' }]
});

const loop = splitInBatches({
  version: 3,
  config: { name: 'Loop Over Blocks', position: [440, 300], parameters: { batchSize: 10, options: {} } },
  items: [{ block_id: 'BLK001', has_alert: true }]
});

const ifAlert = ifElse({
  version: 2.3,
  config: {
    name: 'If Weather Alert',
    position: [660, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'has-alert',
          leftValue: '={{ $json.has_alert }}',
          rightValue: true,
          operator: { type: 'boolean', operation: 'equal' }
        }],
        combinator: 'and'
      },
      options: {}
    }
  },
  true: [{ has_alert: true }],
  false: []
});

const telegramWeather = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Telegram Weather Alert',
    position: [880, 200],
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: "={{ $env.TELEGRAM_BLOCK_GROUP_ID }}",
      text: "=Weather Alert for {{ $json.block_name }}\n{{ $json.alert_type }}: {{ $json.alert_message }}\nRecommendation: {{ $json.farming_recommendation }}",
      additionalFields: {}
    }
  },
  output: [{}]
});

const notifyExtension = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Notify Extension Workers',
    position: [1100, 200],
    parameters: {
      url: 'http://localhost:8000/api/extension-workers/notify',
      method: 'POST',
      sendBody: true,
      bodyParameters: {
        parameters: [
          { name: 'block_id', value: '={{ $json.block_id }}' },
          { name: 'alert_type', value: '={{ $json.alert_type }}' },
          { name: 'message', value: '={{ $json.alert_message }}' }
        ]
      },
      options: {}
    }
  },
  output: [{}]
});

export default workflow('daily-weather-alerts', 'Daily Weather Alerts')
  .add(cron)
  .to(getWeather)
  .to(loop)
  .to(ifAlert, {
    true: [telegramWeather, notifyExtension]
  })
  .to(nextBatch(loop));
'@

# ─────────────────────────────────────────────────────────────────
# Upload all 8
# ─────────────────────────────────────────────────────────────────
$workflows = @(
    @{ name="WhatsApp Advisory Loop";   code=$wf1; desc="Handles WhatsApp messages from farmers via Twilio, generates advisory from backend, sends reply, logs to Google Sheets." },
    @{ name="Daily Harvest Alerts";     code=$wf2; desc="6AM daily: fetches farmers with upcoming harvests, generates advisory, sends WhatsApp via Twilio, logs to Google Sheets." },
    @{ name="Price Crash Broadcast";    code=$wf3; desc="Webhook-triggered price crash alert. Notifies farmers via Telegram, logs to Google Sheets, sends urgent WhatsApp to coordinator for >40% crashes." },
    @{ name="FPO Weekly Digest";        code=$wf4; desc="Monday 8AM: generates weekly FPO stats report, logs to Google Sheets, sends WhatsApp summary and Gmail report to coordinator." },
    @{ name="Spoilage Emergency";       code=$wf5; desc="Emergency webhook for spoilage. Finds nearest cold storage, alerts farmer via WhatsApp and Telegram, logs event to Google Sheets." },
    @{ name="Bundle Notification";      code=$wf6; desc="Webhook-triggered bundle formation alert. Sends individual WhatsApp messages to farmers and Telegram group announcement." },
    @{ name="Scheme Eligibility Check"; code=$wf7; desc="Webhook: checks government scheme eligibility for farmer. Sends WhatsApp notification if eligible, logs result to Google Sheets." },
    @{ name="Daily Weather Alerts";     code=$wf8; desc="5:30AM daily weather check. Sends severe weather alerts to Telegram farmer groups and notifies extension workers via backend API." }
)

Write-Host "Creating $($workflows.Count) workflows on n8n cloud..." -ForegroundColor Cyan
$created = 0
$failed = 0

foreach ($wf in $workflows) {
    Write-Host ""
    Write-Host "[$($wf.name)]" -ForegroundColor Yellow -NoNewline

    # 1. Validate
    Write-Host " validating..." -NoNewline
    $valBody = @{
        jsonrpc = "2.0"; id = 1; method = "tools/call"
        params  = @{ name = "validate_workflow"; arguments = @{ code = $wf.code } }
    } | ConvertTo-Json -Depth 20 -Compress

    $vRaw = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $valBody
    if ($vRaw -match '"isValid"\s*:\s*false|"valid"\s*:\s*false') {
        Write-Host " INVALID" -ForegroundColor Red
        if ($vRaw -match '"message"\s*:\s*"([^"]{0,200})') { Write-Host "  Error: $($Matches[1])" }
        $failed++
        continue
    }
    Write-Host " OK" -ForegroundColor DarkGreen -NoNewline

    # 2. Create
    Write-Host " creating..." -NoNewline
    $createBody = @{
        jsonrpc = "2.0"; id = 2; method = "tools/call"
        params  = @{
            name      = "create_workflow_from_code"
            arguments = @{ code = $wf.code; name = $wf.name; description = $wf.desc }
        }
    } | ConvertTo-Json -Depth 20 -Compress

    $cRaw = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $createBody

    if ($cRaw -match '"id"\s*:\s*"([^"]+)"') {
        Write-Host " CREATED (id=$($Matches[1]))" -ForegroundColor Green
        $created++
    } elseif ($cRaw -match 'isError.*true|error') {
        Write-Host " FAILED" -ForegroundColor Red
        if ($cRaw -match '"text"\s*:\s*"([^"]{0,300})') { Write-Host "  $($Matches[1])" }
        $failed++
    } else {
        Write-Host " UNKNOWN RESPONSE" -ForegroundColor Yellow
        Write-Host "  $($cRaw.Substring(0,[Math]::Min(300,$cRaw.Length)))"
        $failed++
    }
}

Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "Created: $created / $($workflows.Count)" -ForegroundColor Green
if ($failed -gt 0) { Write-Host "Failed:  $failed" -ForegroundColor Red }
Write-Host ""
Write-Host "Open https://rohanesor.app.n8n.cloud to see your workflows." -ForegroundColor Cyan
Write-Host ""
Write-Host "Required n8n Variables (Settings > Variables):" -ForegroundColor Yellow
@(
    "TWILIO_WHATSAPP_FROM     - e.g. +14155238886",
    "OPS_COORDINATOR_PHONE    - e.g. +919876543210",
    "TELEGRAM_BLOCK_GROUP_ID  - Telegram group/channel ID",
    "GSHEET_ADVISORIES_ID     - Google Sheets ID",
    "GSHEET_FPO_REPORTS_ID    - Google Sheets ID",
    "GSHEET_PRICE_CRASHES_ID  - Google Sheets ID",
    "GSHEET_EMERGENCIES_ID    - Google Sheets ID"
) | ForEach-Object { Write-Host "  $_" }
