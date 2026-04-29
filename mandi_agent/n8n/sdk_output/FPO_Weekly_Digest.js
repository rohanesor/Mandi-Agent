import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const cronMonday800AMIST = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1,
  config: {
  "name": "Cron — Monday 8:00 AM IST",
  "position": [
    100,
    300
  ],
  "parameters": {
    "rule": {
      "interval": [
        {
          "triggerAtHour": 8,
          "triggerAtMinute": 0,
          "dayOfWeek": "monday",
          "timezone": "Asia/Kolkata"
        }
      ]
    }
  }
},
  output: [{}]
});

const getApifpolist = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "GET /api/fpo/list",
  "position": [
    350,
    300
  ],
  "parameters": {
    "url": "http://backend:8000/api/fpo/list",
    "method": "GET",
    "options": {}
  }
},
  output: [{}]
});

const loopPerFPO = node({
  type: 'n8n-nodes-base.splitInBatches',
  version: 2,
  config: {
  "name": "Loop: Per FPO",
  "position": [
    600,
    300
  ],
  "parameters": {
    "operation": "manual",
    "batchSize": 5,
    "options": {}
  }
},
  output: [{}]
});

const getFPOWeeklyStats = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "GET FPO Weekly Stats",
  "position": [
    850,
    300
  ],
  "parameters": {
    "url": "http://backend:8000/api/fpo/weekly-stats",
    "method": "GET",
    "sendQueryParameters": true,
    "queryParameters": {
      "parameters": [
        {
          "name": "fpo_id",
          "value": "={{ $json.fpo_id }}"
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

const logReportInSupabase = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Log Report in Supabase",
  "position": [
    1100,
    300
  ],
  "parameters": {
    "url": "http://backend:8000/api/fpo/report",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "fpo_id",
          "value": "={{ $json.fpo_id }}"
        },
        {
          "name": "fpo_name",
          "value": "={{ $json.fpo_name }}"
        },
        {
          "name": "week_start",
          "value": "={{ $json.week_start }}"
        },
        {
          "name": "week_end",
          "value": "={{ $json.week_end }}"
        },
        {
          "name": "advisories_sent",
          "value": "={{ $json.advisories_sent }}"
        },
        {
          "name": "bundles_formed",
          "value": "={{ $json.bundles_formed }}"
        },
        {
          "name": "total_transport_savings",
          "value": "={{ $json.total_transport_savings }}"
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

const notionCreateWeeklyReportPage = node({
  type: 'n8n-nodes-base.notion',
  version: 1,
  config: {
  "name": "Notion: Create Weekly Report Page",
  "position": [
    1350,
    300
  ],
  "parameters": {
    "pageContent": "={{ $json.fpo_name }} Weekly Report\n\nWeek: {{ $json.week_start }} to {{ $json.week_end }}\n\nAdvisories Sent: {{ $json.advisories_sent }}\nBundles Formed: {{ $json.bundles_formed }}\nTotal Transport Savings: ₹{{ $json.total_transport_savings }}\nPrice Crashes Detected: {{ $json.price_crashes_detected }}\nSpoilage Emergencies: {{ $json.spoilage_emergencies }}\nActive Farmers: {{ $json.active_farmers }}",
    "pageTitle": "={{ 'Weekly Report - ' + $json.fpo_name + ' - ' + $json.week_start }}",
    "parentPageId": "={{ $env.NOTION_FPO_REPORTS_PAGE_ID }}",
    "options": {}
  }
},
  output: [{}]
});

const gmailSendDigestToCoordinator = node({
  type: 'n8n-nodes-base.gmail',
  version: 1,
  config: {
  "name": "Gmail: Send Digest to Coordinator",
  "position": [
    1600,
    300
  ],
  "parameters": {
    "to": "={{ $json.coordinator_email }}",
    "subject": "={{ 'Mandi-Agent Weekly Report - ' + $json.fpo_name + ' (' + $json.week_start + ')' }}",
    "emailFormat": "html",
    "html": "<h2>{{ $json.fpo_name }} — Weekly Report</h2>\n<p><b>Week:</b> {{ $json.week_start }} to {{ $json.week_end }}</p>\n<table border='1'>\n<tr><td>Advisories Sent</td><td>{{ $json.advisories_sent }}</td></tr>\n<tr><td>Bundles Formed</td><td>{{ $json.bundles_formed }}</td></tr>\n<tr><td>Total Transport Savings</td><td>₹{{ $json.total_transport_savings }}</td></tr>\n<tr><td>Price Crashes Detected</td><td>{{ $json.price_crashes_detected }}</td></tr>\n<tr><td>Spoilage Emergencies</td><td>{{ $json.spoilage_emergencies }}</td></tr>\n<tr><td>Active Farmers</td><td>{{ $json.active_farmers }}</td></tr>\n</table>",
    "options": {}
  }
},
  output: [{}]
});

const slackPostSummary = node({
  type: 'n8n-nodes-base.slack',
  version: 1,
  config: {
  "name": "Slack: Post Summary",
  "position": [
    1850,
    300
  ],
  "parameters": {
    "webhookUrl": "={{ $env.SLACK_WEBHOOK_URL }}",
    "channel": "#mandi-ops",
    "blocks": {
      "blocks": [
        {
          "type": "header",
          "text": {
            "type": "plain_text",
            "text": "📊 FPO Weekly Digest — {{ $json.fpo_name }}"
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": "*Advisories:*\n{{ $json.advisories_sent }}"
            },
            {
              "type": "mrkdwn",
              "text": "*Bundles:*\n{{ $json.bundles_formed }}"
            },
            {
              "type": "mrkdwn",
              "text": "*Savings:*\n₹{{ $json.total_transport_savings }}"
            },
            {
              "type": "mrkdwn",
              "text": "*Active Farmers:*\n{{ $json.active_farmers }}"
            }
          ]
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

export default workflow('id', 'FPO Weekly Digest')
  .add(cronMonday800AMIST)
  .to(getApifpolist)
  .to(loopPerFPO)
  .to(getFPOWeeklyStats)
  .to(logReportInSupabase)
  .to(notionCreateWeeklyReportPage)
  .to(gmailSendDigestToCoordinator)
  .to(slackPostSummary)
;