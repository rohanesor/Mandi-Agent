$mcpToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM"
$url = "https://rohanesor.app.n8n.cloud/mcp-server/http"
$h = @{
    "Authorization" = "Bearer $mcpToken"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json, text/event-stream"
}

# ── Config ────────────────────────────────────────────────────────
$TWILIO_FROM   = "+12602613264"
$COORD_PHONE   = "+916380221196"
$SHEET_ID      = "1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U"

# Existing workflow IDs (created earlier)
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

function Invoke-MCPTool([string]$toolName, [hashtable]$toolArgs) {
    $bodyObj = @{
        jsonrpc = "2.0"
        id      = [int][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        method  = "tools/call"
        params  = @{ name = $toolName; arguments = $toolArgs }
    }
    $body = $bodyObj | ConvertTo-Json -Depth 25 -Compress
    $r = Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body $body
    return $r
}

function Update-WF([string]$wfId, [string]$wfName, [string]$code, [string]$desc) {
    Write-Host ""
    Write-Host "Updating: $wfName ($wfId)" -ForegroundColor Yellow -NoNewline

    $valRaw = Invoke-MCPTool "validate_workflow" @{ code = $code }
    if ($valRaw -match '"isValid"\s*:\s*false|"valid"\s*:\s*false') {
        Write-Host " INVALID" -ForegroundColor Red
        if ($valRaw -match '"message"\s*:\s*"([^"]{0,300})') { Write-Host "  $($Matches[1])" }
        return
    }
    Write-Host " valid..." -NoNewline

    $updateRaw = Invoke-MCPTool "update_workflow" @{ workflowId = $wfId; code = $code; description = $desc }
    if ($updateRaw -match '"workflowId"\s*:\s*"([^"]+)"') {
        Write-Host " UPDATED" -ForegroundColor Green
    } else {
        Write-Host " Response: $($updateRaw.Substring(0,[Math]::Min(300,$updateRaw.Length)))"
    }
}

# ════════════════════════════════════════════════════════════════
# 1. WHATSAPP ADVISORY LOOP — broadcast reply to farmer
# ════════════════════════════════════════════════════════════════
$code1 = @"
import { workflow, node, trigger } from '@n8n/workflow-sdk';

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
      jsCode: "const body = \$input.first().json;\nconst from = (body.From || body.from || '').replace('whatsapp:', '');\nconst text = body.Body || body.body || '';\nreturn [{ json: { from_phone: from, user_message: text, timestamp: new Date().toISOString() } }];"
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
          { name: 'farmer_phone', value: "={{ \$('Parse Incoming Message').item.json.from_phone }}" },
          { name: 'message', value: "={{ \$('Parse Incoming Message').item.json.user_message }}" }
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
      from: 'whatsapp:$TWILIO_FROM',
      to: "=whatsapp:{{ \$('Parse Incoming Message').item.json.from_phone }}",
      message: "={{ \$json.advisory_text }}"
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
      documentId: { __rl: true, value: '$SHEET_ID', mode: 'id' },
      sheetName: { __rl: true, value: 'Advisories', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          farmer_phone: "={{ \$('Parse Incoming Message').item.json.from_phone }}",
          message: "={{ \$('Parse Incoming Message').item.json.user_message }}",
          advisory: "={{ \$('GET Advisory from Backend').item.json.advisory_text }}",
          timestamp: "={{ \$('Parse Incoming Message').item.json.timestamp }}"
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
"@

# ════════════════════════════════════════════════════════════════
# 2. DAILY HARVEST ALERTS — WhatsApp to each farmer individually
# ════════════════════════════════════════════════════════════════
$code2 = @"
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
        parameters: [{ name: 'farmer_id', value: '={{ \$json.farmer_id }}' }]
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
      from: 'whatsapp:$TWILIO_FROM',
      to: "=whatsapp:{{ \$json.farmer_phone }}",
      message: "={{ \$json.advisory_text }}"
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
      documentId: { __rl: true, value: '$SHEET_ID', mode: 'id' },
      sheetName: { __rl: true, value: 'Advisories', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          farmer_id: '={{ \$json.farmer_id }}',
          farmer_phone: '={{ \$json.farmer_phone }}',
          advisory_text: '={{ \$json.advisory_text }}',
          sent_via: 'proactive_whatsapp',
          sent_at: '={{ \$now }}'
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
"@

# ════════════════════════════════════════════════════════════════
# 3. PRICE CRASH BROADCAST
#    Replace Telegram → fetch block farmers → WhatsApp broadcast
# ════════════════════════════════════════════════════════════════
$code3 = @"
import { workflow, node, trigger, ifElse, splitInBatches, nextBatch } from '@n8n/workflow-sdk';

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
        conditions: [{ id: 'drop-check', leftValue: '={{ \$json.drop_pct }}', rightValue: 25, operator: { type: 'number', operation: 'gt' } }],
        combinator: 'and'
      },
      options: {}
    }
  },
  true: [{ drop_pct: 35 }],
  false: []
});

const getBlockFarmers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Block Farmers',
    position: [440, 200],
    parameters: {
      url: '=http://localhost:8000/api/blocks/{{ \$json.block_id }}/farmers',
      method: 'GET',
      options: {}
    }
  },
  output: [{ farmer_phone: '+919876543210', crop: 'Tomato', block_id: 'BLK001', drop_pct: 35, forecast_price: 520, alternative_mandi: 'Mysore', alternative_price: 900 }]
});

const loop = splitInBatches({
  version: 3,
  config: { name: 'Loop Farmers', position: [660, 200], parameters: { batchSize: 20, options: {} } },
  items: [{ farmer_phone: '+919876543210' }]
});

const whatsappFarmer = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Price Crash Alert',
    position: [880, 200],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: 'whatsapp:$TWILIO_FROM',
      to: "=whatsapp:{{ \$json.farmer_phone }}",
      message: "=Price Crash Alert for {{ \$json.crop }}!\nPrice dropped {{ \$json.drop_pct }}% to Rs.{{ \$json.forecast_price }}/quintal.\nBetter price at {{ \$json.alternative_mandi }}: Rs.{{ \$json.alternative_price }}/quintal.\nSell there instead."
    }
  },
  output: [{}]
});

const logSheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.4,
  config: {
    name: 'Log Crash to Google Sheets',
    position: [1100, 200],
    parameters: {
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, value: '$SHEET_ID', mode: 'id' },
      sheetName: { __rl: true, value: 'Price Crashes', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          block_id: "={{ \$json.block_id }}",
          crop: "={{ \$json.crop }}",
          drop_pct: "={{ \$json.drop_pct }}",
          current_price: "={{ \$json.current_price }}",
          forecast_price: "={{ \$json.forecast_price }}",
          alternative_mandi: "={{ \$json.alternative_mandi }}",
          timestamp: "={{ \$now }}"
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
    name: 'If Severe > 40%',
    position: [1100, 400],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ id: 'severe', leftValue: "={{ \$json.drop_pct }}", rightValue: 40, operator: { type: 'number', operation: 'gt' } }],
        combinator: 'and'
      },
      options: {}
    }
  },
  true: [{ drop_pct: 45 }],
  false: []
});

const whatsappCoord = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Coordinator Alert',
    position: [1320, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: 'whatsapp:$TWILIO_FROM',
      to: 'whatsapp:$COORD_PHONE',
      message: "=SEVERE Crash (>40%)\nCrop: {{ \$json.crop }} in {{ \$json.block_id }}\nDrop: {{ \$json.drop_pct }}%\nFarmers Affected: {{ \$json.affected_farmer_count }}\nImmediate action required!"
    }
  },
  output: [{}]
});

const recalculate = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'POST Recalculate',
    position: [1320, 500],
    parameters: {
      url: 'http://localhost:8000/api/harvest-intent/recalculate',
      method: 'POST',
      sendBody: true,
      bodyParameters: {
        parameters: [
          { name: 'block_id', value: "={{ \$json.block_id }}" },
          { name: 'crop', value: "={{ \$json.crop }}" }
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
    true: [getBlockFarmers, loop, whatsappFarmer, logSheet, ifSevere, {
      true: [whatsappCoord],
      false: [recalculate]
    }]
  });
"@

# ════════════════════════════════════════════════════════════════
# 4. FPO WEEKLY DIGEST
# ════════════════════════════════════════════════════════════════
$code4 = @"
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
  output: [{ fpo_id: 'fpo001', fpo_name: 'Karnataka Tomato FPO', coordinator_phone: '+916380221196', coordinator_email: 'coord@fpo.com' }]
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
      url: '=http://localhost:8000/api/fpo/{{ \$json.fpo_id }}/weekly-stats',
      method: 'GET',
      options: {}
    }
  },
  output: [{ fpo_id: 'fpo001', fpo_name: 'Karnataka Tomato FPO', week_start: '2026-04-06', week_end: '2026-04-12', advisories_sent: 120, bundles_formed: 8, total_transport_savings: 45000, active_farmers: 95, coordinator_phone: '+916380221196', coordinator_email: 'coord@fpo.com' }]
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
      documentId: { __rl: true, value: '$SHEET_ID', mode: 'id' },
      sheetName: { __rl: true, value: 'FPO Reports', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          fpo_id: '={{ \$json.fpo_id }}',
          fpo_name: '={{ \$json.fpo_name }}',
          week_start: '={{ \$json.week_start }}',
          week_end: '={{ \$json.week_end }}',
          advisories_sent: '={{ \$json.advisories_sent }}',
          bundles_formed: '={{ \$json.bundles_formed }}',
          total_savings: '={{ \$json.total_transport_savings }}',
          active_farmers: '={{ \$json.active_farmers }}'
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
      from: 'whatsapp:$TWILIO_FROM',
      to: "=whatsapp:{{ \$('GET FPO Weekly Stats').item.json.coordinator_phone }}",
      message: "=Mandi-Agent Weekly Report\nFPO: {{ \$('GET FPO Weekly Stats').item.json.fpo_name }}\nWeek: {{ \$('GET FPO Weekly Stats').item.json.week_start }} to {{ \$('GET FPO Weekly Stats').item.json.week_end }}\nAdvisories: {{ \$('GET FPO Weekly Stats').item.json.advisories_sent }}\nBundles: {{ \$('GET FPO Weekly Stats').item.json.bundles_formed }}\nSavings: Rs.{{ \$('GET FPO Weekly Stats').item.json.total_transport_savings }}\nActive Farmers: {{ \$('GET FPO Weekly Stats').item.json.active_farmers }}"
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
      sendTo: "={{ \$('GET FPO Weekly Stats').item.json.coordinator_email }}",
      subject: "=Mandi-Agent Weekly Report - {{ \$('GET FPO Weekly Stats').item.json.fpo_name }} ({{ \$('GET FPO Weekly Stats').item.json.week_start }})",
      emailType: 'html',
      message: "=<h2>{{ \$('GET FPO Weekly Stats').item.json.fpo_name }} Weekly Report</h2><p>Week: {{ \$('GET FPO Weekly Stats').item.json.week_start }} to {{ \$('GET FPO Weekly Stats').item.json.week_end }}</p><ul><li>Advisories: {{ \$('GET FPO Weekly Stats').item.json.advisories_sent }}</li><li>Bundles: {{ \$('GET FPO Weekly Stats').item.json.bundles_formed }}</li><li>Savings: Rs.{{ \$('GET FPO Weekly Stats').item.json.total_transport_savings }}</li><li>Farmers: {{ \$('GET FPO Weekly Stats').item.json.active_farmers }}</li></ul>",
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
"@

# ════════════════════════════════════════════════════════════════
# 5. SPOILAGE EMERGENCY
# ════════════════════════════════════════════════════════════════
$code5 = @"
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
          { name: 'farmer_id', value: '={{ \$json.farmer_id }}' },
          { name: 'crop', value: '={{ \$json.crop }}' },
          { name: 'quantity_kg', value: '={{ \$json.quantity_kg }}' }
        ]
      },
      options: {}
    }
  },
  output: [{ farmer_name: 'Raju', farmer_phone: '+919876543210', crop: 'Tomato', quantity_kg: 500, nearest_storage_name: 'Cool Farm Store', distance_km: 12, storage_contact: '+919000000001' }]
});

const whatsappFarmer = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Alert to Farmer',
    position: [440, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: 'whatsapp:$TWILIO_FROM',
      to: "=whatsapp:{{ \$json.farmer_phone }}",
      message: "=Emergency: Nearest cold storage for your {{ \$json.crop }} is {{ \$json.nearest_storage_name }} ({{ \$json.distance_km }} km away). Call: {{ \$json.storage_contact }}"
    }
  },
  output: [{}]
});

const whatsappCoord = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Coordinator Alert',
    position: [660, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: 'whatsapp:$TWILIO_FROM',
      to: 'whatsapp:$COORD_PHONE',
      message: "=Spoilage Emergency!\nFarmer: {{ \$json.farmer_name }}\nCrop: {{ \$json.crop }} ({{ \$json.quantity_kg }} kg)\nNearest Storage: {{ \$json.nearest_storage_name }} ({{ \$json.distance_km }} km)"
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
      documentId: { __rl: true, value: '$SHEET_ID', mode: 'id' },
      sheetName: { __rl: true, value: 'Spoilage Events', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          farmer_name: "={{ \$json.farmer_name }}",
          crop: '={{ \$json.crop }}',
          quantity_kg: "={{ \$json.quantity_kg }}",
          cold_storage: '={{ \$json.nearest_storage_name }}',
          timestamp: '={{ \$now }}'
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
  .to(whatsappFarmer)
  .to(whatsappCoord)
  .to(logSheet);
"@

# ════════════════════════════════════════════════════════════════
# 6. BUNDLE NOTIFICATION
# ════════════════════════════════════════════════════════════════
$code6 = @"
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
  output: [{ bundle_id: 'b001', crop: 'Tomato', bundle_size: 12, pickup_point: 'Hubli Yard', pickup_date: '2026-04-15', total_savings: 36000 }]
});

const whatsappCoord = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Bundle to Coordinator',
    position: [220, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: 'whatsapp:$TWILIO_FROM',
      to: 'whatsapp:$COORD_PHONE',
      message: "=Bundle formed for {{ \$json.crop }}!\nFarmers: {{ \$json.bundle_size }}\nPickup: {{ \$json.pickup_point }} on {{ \$json.pickup_date }}\nTotal savings: Rs.{{ \$json.total_savings }}"
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
      url: '=http://localhost:8000/api/bundles/{{ \$json.bundle_id }}/farmers',
      method: 'GET',
      options: {}
    }
  },
  output: [{ farmer_phone: '+919876543210', crop: 'Tomato', bundle_size: 12, pickup_point: 'Hubli Yard', pickup_date: '2026-04-15', estimated_savings: 3000 }]
});

const loop = splitInBatches({
  version: 3,
  config: { name: 'Loop Bundle Farmers', position: [660, 300], parameters: { batchSize: 20, options: {} } },
  items: [{ farmer_phone: '+919876543210' }]
});

const whatsappFarmer = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Bundle Alert to Farmer',
    position: [880, 300],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: 'whatsapp:$TWILIO_FROM',
      to: "=whatsapp:{{ \$json.farmer_phone }}",
      message: "=Good news! Your {{ \$json.crop }} has been bundled with {{ \$json.bundle_size }} other farmers.\nPickup: {{ \$json.pickup_point }}\nDate: {{ \$json.pickup_date }}\nYour savings: Rs.{{ \$json.estimated_savings }}"
    }
  },
  output: [{}]
});

export default workflow('bundle-notification', 'Bundle Notification')
  .add(webhook)
  .to(whatsappCoord)
  .to(getFarmers)
  .to(loop)
  .to(whatsappFarmer)
  .to(nextBatch(loop));
"@

# ════════════════════════════════════════════════════════════════
# 7. SCHEME ELIGIBILITY CHECK
# ════════════════════════════════════════════════════════════════
$code7 = @"
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
          { name: 'farmer_id', value: '={{ \$json.farmer_id }}' },
          { name: 'crop', value: '={{ \$json.crop }}' },
          { name: 'state', value: '={{ \$json.state }}' }
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
        conditions: [{ id: 'has-schemes', leftValue: '={{ \$json.schemes_count }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }],
        combinator: 'and'
      },
      options: {}
    }
  },
  true: [{ schemes_count: 2 }],
  false: []
});

const whatsappFarmer = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Scheme Alert',
    position: [660, 200],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: 'whatsapp:$TWILIO_FROM',
      to: "=whatsapp:{{ \$json.farmer_phone }}",
      message: "=Good news! You qualify for {{ \$json.schemes_count }} government scheme(s):\n{{ \$json.schemes_summary }}\n\nTo apply, visit your nearest CSC centre or call 1800-180-1551 (free)."
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
      documentId: { __rl: true, value: '$SHEET_ID', mode: 'id' },
      sheetName: { __rl: true, value: 'Scheme Checks', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          farmer_id: '={{ \$json.farmer_id }}',
          crop: '={{ \$json.crop }}',
          schemes_found: '={{ \$json.schemes_count }}',
          timestamp: '={{ \$now }}'
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
    true: [whatsappFarmer, logSheet]
  });
"@

# ════════════════════════════════════════════════════════════════
# 8. DAILY WEATHER ALERTS
#    Replace Telegram → fetch block farmers → WhatsApp broadcast
# ════════════════════════════════════════════════════════════════
$code8 = @"
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

const loopBlocks = splitInBatches({
  version: 3,
  config: { name: 'Loop Over Blocks', position: [440, 300], parameters: { batchSize: 5, options: {} } },
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
        conditions: [{ id: 'has-alert', leftValue: '={{ \$json.has_alert }}', rightValue: true, operator: { type: 'boolean', operation: 'equal' } }],
        combinator: 'and'
      },
      options: {}
    }
  },
  true: [{ has_alert: true }],
  false: []
});

const getBlockFarmers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Block Farmers for Alert',
    position: [880, 200],
    parameters: {
      url: '=http://localhost:8000/api/blocks/{{ \$json.block_id }}/farmers',
      method: 'GET',
      options: {}
    }
  },
  output: [{ farmer_phone: '+919876543210', block_name: 'Hubli Block', alert_type: 'Heavy Rain', alert_message: 'Heavy rainfall expected.', farming_recommendation: 'Cover stored produce.' }]
});

const loopFarmers = splitInBatches({
  version: 3,
  config: { name: 'Loop Alert Farmers', position: [1100, 200], parameters: { batchSize: 20, options: {} } },
  items: [{ farmer_phone: '+919876543210' }]
});

const whatsappWeather = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
    name: 'WhatsApp Weather Alert',
    position: [1320, 200],
    parameters: {
      resource: 'sms',
      operation: 'send',
      from: 'whatsapp:$TWILIO_FROM',
      to: "=whatsapp:{{ \$json.farmer_phone }}",
      message: "=Weather Alert for {{ \$json.block_name }}:\n{{ \$json.alert_type }}: {{ \$json.alert_message }}\nAdvice: {{ \$json.farming_recommendation }}"
    }
  },
  output: [{}]
});

export default workflow('daily-weather-alerts', 'Daily Weather Alerts')
  .add(cron)
  .to(getWeather)
  .to(loopBlocks)
  .to(ifAlert, {
    true: [getBlockFarmers, loopFarmers, whatsappWeather, nextBatch(loopFarmers)]
  })
  .to(nextBatch(loopBlocks));
"@

# ─── Update all 8 workflows ─────────────────────────────────────
$updates = @(
    @{ id=$WF_IDS["WhatsApp Advisory Loop"];   name="WhatsApp Advisory Loop";   code=$code1; desc="Handles inbound WhatsApp from farmers. Generates advisory from backend. Replies via WhatsApp (Twilio $TWILIO_FROM). Logs to Google Sheets." },
    @{ id=$WF_IDS["Daily Harvest Alerts"];     name="Daily Harvest Alerts";     code=$code2; desc="6AM daily: fetches farmers due for harvest, generates AI advisory, sends individual WhatsApp via Twilio, logs to Sheets." },
    @{ id=$WF_IDS["Price Crash Broadcast"];    name="Price Crash Broadcast";    code=$code3; desc="Webhook-triggered. If price drops >25%, broadcasts WhatsApp to all block farmers individually. Coordinator alert for >40% crashes." },
    @{ id=$WF_IDS["FPO Weekly Digest"];        name="FPO Weekly Digest";        code=$code4; desc="Monday 8AM IST: logs FPO weekly stats to Google Sheets, sends WhatsApp summary to coordinator, emails Gmail report." },
    @{ id=$WF_IDS["Spoilage Emergency"];       name="Spoilage Emergency";       code=$code5; desc="Webhook: finds nearest cold storage, sends WhatsApp to farmer and coordinator ($COORD_PHONE), logs to Sheets." },
    @{ id=$WF_IDS["Bundle Notification"];      name="Bundle Notification";      code=$code6; desc="Webhook: notifies coordinator WhatsApp, then sends individual WhatsApp messages to each bundled farmer." },
    @{ id=$WF_IDS["Scheme Eligibility Check"]; name="Scheme Eligibility Check"; code=$code7; desc="Webhook: checks govt scheme eligibility, sends WhatsApp to eligible farmers with scheme details and helpline." },
    @{ id=$WF_IDS["Daily Weather Alerts"];     name="Daily Weather Alerts";     code=$code8; desc="5:30AM daily: checks weather alerts per block, broadcasts individual WhatsApp warnings to all farmers in affected blocks." }
)

Write-Host "Updating all 8 workflows with hardcoded values..." -ForegroundColor Cyan
Write-Host "  Twilio From: $TWILIO_FROM"
Write-Host "  Coordinator: $COORD_PHONE"
Write-Host "  Sheet ID:    $SHEET_ID"
Write-Host ""

$ok = 0; $fail = 0

foreach ($u in $updates) {
    Update-WF $u.id $u.name $u.code $u.desc
}

Write-Host ""
Write-Host "Done! Open https://rohanesor.app.n8n.cloud" -ForegroundColor Green
