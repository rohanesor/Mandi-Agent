Add-Type -AssemblyName System.Web

$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OGIxNmNiMy02MDFlLTQxMDQtYmQ2Mi00ZTljZjUxNThkMGIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYzUxZDgyOGMtNDlkNS00Y2U3LThiMmMtMmZjNGI1YTQ5ZTc2IiwiaWF0IjoxNzc1OTQ1MTk5LCJleHAiOjE3Nzg1MjQyMDB9.ee2ZLsjb7nWeVKHpy6etg7g_VaOAnBdThsaMBg1V-t8"
$headers = @{ "X-N8N-API-KEY" = $token; "Content-Type" = "application/json" }
$baseUrl = "http://localhost:5678/api/v1"

function New-NodeId { return [guid]::NewGuid().ToString() }

function New-Node($name, $type, $typeVersion, $params, $x, $y) {
    return [ordered]@{
        id          = New-NodeId
        name        = $name
        type        = $type
        typeVersion = $typeVersion
        position    = @($x, $y)
        parameters  = $params
    }
}

function New-Conn($fromNode, $toNode) {
    return @{ node = $toNode; type = "main"; index = 0 }
}

# ══════════════════════════════════════════════════
# 1. DAILY HARVEST ALERTS
#    Notion  → Google Sheets (log advisory sent)
#    Supabase removed (Sheets handles logging)
# ══════════════════════════════════════════════════
$n1 = New-Node "Cron 6AM Daily" "n8n-nodes-base.scheduleTrigger" 1 @{
    rule = @{ interval = @(@{ triggerAtHour=6; triggerAtMinute=0; timezone="Asia/Kolkata" }) }
} 0 0
$n2 = New-Node "GET Harvest Alerts Due" "n8n-nodes-base.httpRequest" 3 @{
    url="http://localhost:8000/api/harvest-alerts-due"; method="GET"; options=@{}
} 220 0
$n3 = New-Node "Loop over Farmers" "n8n-nodes-base.splitInBatches" 2 @{
    batchSize=10; options=@{}
} 440 0
$n4 = New-Node "Generate Advisory" "n8n-nodes-base.httpRequest" 3 @{
    url="http://localhost:8000/api/advisory"; method="POST"; sendBody=$true
    bodyParameters=@{ parameters=@(@{ name="farmer_id"; value='={{ $json.farmer_id }}' }) }
    options=@{ timeout=60000 }
} 660 0
$n5 = New-Node "Send WhatsApp Voice Note" "n8n-nodes-base.twilio" 1 @{
    resource="media"; channel="whatsapp"
    from='={{ $env.TWILIO_WHATSAPP_FROM }}'
    to='=whatsapp:{{ $json.farmer_phone }}'
    messageType="audio"
    mediaUrl='={{ $json.response_audio_url }}'
    options=@{}
} 880 0
$n6 = New-Node "Log in Google Sheets" "n8n-nodes-base.googleSheets" 4 @{
    operation="append"
    documentId=@{ __rl=$true; value='={{ $env.GSHEET_ADVISORIES_ID }}'; mode="id" }
    sheetName=@{ __rl=$true; value="Advisories"; mode="name" }
    columns=@{
        mappingMode="defineBelow"
        value=@{
            farmer_id='={{ $json.farmer_id }}'
            farmer_phone='={{ $json.farmer_phone }}'
            advisory_id='={{ $json.advisory_id }}'
            sent_via="proactive_whatsapp"
            sent_at='={{ $now }}'
        }
    }
    options=@{}
} 1100 0

$harvestNodes = @($n1,$n2,$n3,$n4,$n5,$n6)
$harvestConn = @{
    $n1.name = @{ main=@(@(@{node=$n2.name; type="main"; index=0})) }
    $n2.name = @{ main=@(@(@{node=$n3.name; type="main"; index=0})) }
    $n3.name = @{ main=@(@(@{node=$n4.name; type="main"; index=0})) }
    $n4.name = @{ main=@(@(@{node=$n5.name; type="main"; index=0})) }
    $n5.name = @{ main=@(@(@{node=$n6.name; type="main"; index=0})) }
}

# ══════════════════════════════════════════════════
# 2. FPO WEEKLY DIGEST
#    Notion  → Google Sheets (log FPO report)
#    Slack   → WhatsApp via Twilio (coordinator summary)
# ══════════════════════════════════════════════════
$f1 = New-Node "Cron Monday 8AM" "n8n-nodes-base.scheduleTrigger" 1 @{
    rule=@{interval=@(@{triggerAtHour=8;triggerAtMinute=0;dayOfWeek="monday";timezone="Asia/Kolkata"})}
} 0 0
$f2 = New-Node "GET FPO List" "n8n-nodes-base.httpRequest" 3 @{
    url="http://localhost:8000/api/fpo/list"; method="GET"; options=@{}
} 220 0
$f3 = New-Node "Loop Per FPO" "n8n-nodes-base.splitInBatches" 2 @{
    batchSize=5; options=@{}
} 440 0
$f4 = New-Node "GET FPO Weekly Stats" "n8n-nodes-base.httpRequest" 3 @{
    url='=http://localhost:8000/api/fpo/{{ $json.fpo_id }}/weekly-stats'; method="GET"; options=@{}
} 660 0
$f5 = New-Node "Google Sheets: Log FPO Report" "n8n-nodes-base.googleSheets" 4 @{
    operation="append"
    documentId=@{ __rl=$true; value='={{ $env.GSHEET_FPO_REPORTS_ID }}'; mode="id" }
    sheetName=@{ __rl=$true; value="FPO Reports"; mode="name" }
    columns=@{
        mappingMode="defineBelow"
        value=@{
            fpo_id='={{ $json.fpo_id }}'
            fpo_name='={{ $json.fpo_name }}'
            week_start='={{ $json.week_start }}'
            week_end='={{ $json.week_end }}'
            advisories_sent='={{ $json.advisories_sent }}'
            bundles_formed='={{ $json.bundles_formed }}'
            total_savings='={{ $json.total_transport_savings }}'
            active_farmers='={{ $json.active_farmers }}'
        }
    }
    options=@{}
} 880 0
$f6 = New-Node "WhatsApp: Summary to Coordinator" "n8n-nodes-base.twilio" 1 @{
    resource="message"; channel="whatsapp"
    from='={{ $env.TWILIO_WHATSAPP_FROM }}'
    to='=whatsapp:{{ $json.coordinator_phone }}'
    messageType="text"
    body='=Mandi-Agent Weekly Report
FPO: {{ $json.fpo_name }}
Week: {{ $json.week_start }} to {{ $json.week_end }}
Advisories: {{ $json.advisories_sent }}
Bundles: {{ $json.bundles_formed }}
Savings: Rs.{{ $json.total_transport_savings }}
Active Farmers: {{ $json.active_farmers }}'
    options=@{}
} 1100 0
$f7 = New-Node "Gmail: Send Digest Email" "n8n-nodes-base.gmail" 1 @{
    to='={{ $json.coordinator_email }}'
    subject='=Mandi-Agent Weekly Report - {{ $json.fpo_name }} ({{ $json.week_start }})'
    emailFormat="html"
    html='<h2>{{ $json.fpo_name }} Weekly Report</h2><p>Week: {{ $json.week_start }} to {{ $json.week_end }}</p><ul><li>Advisories Sent: {{ $json.advisories_sent }}</li><li>Bundles Formed: {{ $json.bundles_formed }}</li><li>Savings: Rs.{{ $json.total_transport_savings }}</li><li>Active Farmers: {{ $json.active_farmers }}</li></ul>'
    options=@{}
} 1100 200

$fpoNodes   = @($f1,$f2,$f3,$f4,$f5,$f6,$f7)
$fpoConn    = @{
    $f1.name = @{ main=@(@(@{node=$f2.name;type="main";index=0})) }
    $f2.name = @{ main=@(@(@{node=$f3.name;type="main";index=0})) }
    $f3.name = @{ main=@(@(@{node=$f4.name;type="main";index=0})) }
    $f4.name = @{ main=@(@(@{node=$f5.name;type="main";index=0})) }
    $f5.name = @{ main=@(@(@{node=$f6.name;type="main";index=0},@{node=$f7.name;type="main";index=0})) }
}

# ══════════════════════════════════════════════════
# 3. PRICE CRASH BROADCAST
#    Notion  → Google Sheets (log crash event)
#    Slack   → WhatsApp via Twilio (ops alert)
# ══════════════════════════════════════════════════
$c1 = New-Node "Webhook: Price Crash" "n8n-nodes-base.webhook" 1 @{
    httpMethod="POST"; path="price-crash"; responseMode="lastNode"; options=@{}
} 0 0
$c2 = New-Node "If Drop > 25%" "n8n-nodes-base.if" 2 @{
    conditions=@{
        options=@{caseSensitive=$true;leftValue="";typeValidation="strict"}
        conditions=@(@{id="drop-check";leftValue='={{ $json.drop_pct }}';rightValue=25;operator=@{type="number";operation="gt"}})
        combinator="and"
    }
    options=@{}
} 220 0
$c3 = New-Node "Telegram: Block Group Alert" "n8n-nodes-base.telegram" 1 @{
    message='=Price Crash Alert - {{ $json.block_id }}
Crop: {{ $json.crop }}
Drop: {{ $json.drop_pct }}%
Forecast: Rs.{{ $json.forecast_price }}/quintal
Go to: {{ $json.alternative_mandi }} (Rs.{{ $json.alternative_price }})'
    chatId='={{ $env.TELEGRAM_BLOCK_GROUP_ID }}'
    additionalFields=@{parse_mode="Markdown"}
    options=@{}
} 440 0
$c4 = New-Node "Google Sheets: Log Crash Event" "n8n-nodes-base.googleSheets" 4 @{
    operation="append"
    documentId=@{ __rl=$true; value='={{ $env.GSHEET_PRICE_CRASHES_ID }}'; mode="id" }
    sheetName=@{ __rl=$true; value="Price Crashes"; mode="name" }
    columns=@{
        mappingMode="defineBelow"
        value=@{
            block_id='={{ $json.block_id }}'
            crop='={{ $json.crop }}'
            drop_pct='={{ $json.drop_pct }}'
            current_price='={{ $json.current_price }}'
            forecast_price='={{ $json.forecast_price }}'
            alternative_mandi='={{ $json.alternative_mandi }}'
            alternative_price='={{ $json.alternative_price }}'
            affected_farmers='={{ $json.affected_farmer_count }}'
        }
    }
    options=@{}
} 660 0
$c5 = New-Node "If Severe Crash > 40%" "n8n-nodes-base.if" 2 @{
    conditions=@{
        options=@{caseSensitive=$true;leftValue="";typeValidation="strict"}
        conditions=@(@{id="severe";leftValue='={{ $json.drop_pct }}';rightValue=40;operator=@{type="number";operation="gt"}})
        combinator="and"
    }
    options=@{}
} 880 0
$c6 = New-Node "WhatsApp: Ops Coordinator Alert" "n8n-nodes-base.twilio" 1 @{
    resource="message"; channel="whatsapp"
    from='={{ $env.TWILIO_WHATSAPP_FROM }}'
    to='=whatsapp:{{ $env.OPS_COORDINATOR_PHONE }}'
    messageType="text"
    body='=SEVERE Crash Alert (>40%)
Crop: {{ $json.crop }} in {{ $json.block_id }}
Drop: {{ $json.drop_pct }}%
Farmers Affected: {{ $json.affected_farmer_count }}
Take immediate action!'
    options=@{}
} 1100 0
$c7 = New-Node "Telegram: Severe Crash Follow-up" "n8n-nodes-base.telegram" 1 @{
    message='=SEVERE: {{ $json.crop }} crashed {{ $json.drop_pct }}% in {{ $json.block_id }}. Go to {{ $json.alternative_mandi }}.'
    chatId='={{ $env.TELEGRAM_BLOCK_GROUP_ID }}'
    options=@{}
} 1100 200
$c8 = New-Node "POST Recalculate Harvest Intent" "n8n-nodes-base.httpRequest" 3 @{
    url="http://localhost:8000/api/harvest-intent/recalculate"; method="POST"; sendBody=$true
    bodyParameters=@{parameters=@(@{name="block_id";value='={{ $json.block_id }}'},@{name="crop";value='={{ $json.crop }}'})}
    options=@{}
} 1320 0

$crashNodes=@($c1,$c2,$c3,$c4,$c5,$c6,$c7,$c8)
$crashConn=@{
    $c1.name=@{main=@(@(@{node=$c2.name;type="main";index=0}))}
    $c2.name=@{main=@(@(@{node=$c3.name;type="main";index=0}),@())}
    $c3.name=@{main=@(@(@{node=$c4.name;type="main";index=0}))}
    $c4.name=@{main=@(@(@{node=$c5.name;type="main";index=0}))}
    $c5.name=@{main=@(
        @(@{node=$c6.name;type="main";index=0},@{node=$c7.name;type="main";index=0}),
        @(@{node=$c8.name;type="main";index=0})
    )}
}

# ══════════════════════════════════════════════════
# Upload all
# ══════════════════════════════════════════════════
$workflows = @(
    @{ name="Daily Harvest Alerts";    nodes=$harvestNodes; connections=$harvestConn },
    @{ name="FPO Weekly Digest";       nodes=$fpoNodes;     connections=$fpoConn },
    @{ name="Price Crash Broadcast";   nodes=$crashNodes;   connections=$crashConn }
)

foreach ($wf in $workflows) {
    Write-Host "Uploading: $($wf.name) ..." -NoNewline
    $payload = @{ name=$wf.name; nodes=$wf.nodes; connections=$wf.connections; settings=@{executionOrder="v1"} }
    $body = $payload | ConvertTo-Json -Depth 30 -Compress
    try {
        $r = Invoke-RestMethod -Uri "$baseUrl/workflows" -Headers $headers -Method Post -Body $body
        Write-Host " OK  id=$($r.id)" -ForegroundColor Green
    } catch {
        $sc = $_.Exception.Response.StatusCode.value__
        try {
            $s = $_.Exception.Response.GetResponseStream()
            $rd = New-Object System.IO.StreamReader($s)
            $e = $rd.ReadToEnd()
        } catch { $e="n/a" }
        Write-Host " FAILED [$sc] $e" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Set these env vars in n8n (Settings > Variables):" -ForegroundColor Cyan
@(
    "TWILIO_WHATSAPP_FROM      = Your Twilio WhatsApp number (e.g. +14155238886)",
    "OPS_COORDINATOR_PHONE     = Ops coordinator WhatsApp (e.g. +919876543210)",
    "TELEGRAM_BLOCK_GROUP_ID   = Telegram group ID for farmer alerts",
    "GSHEET_ADVISORIES_ID      = Google Sheets ID for advisory log",
    "GSHEET_FPO_REPORTS_ID     = Google Sheets ID for FPO reports",
    "GSHEET_PRICE_CRASHES_ID   = Google Sheets ID for price crash log"
) | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
