import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const webhookPriceCrashWarning = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 1,
  config: {
  "name": "Webhook: Price Crash Warning",
  "position": [
    100,
    300
  ],
  "parameters": {
    "httpMethod": "POST",
    "path": "price-crash",
    "responseMode": "lastNode",
    "options": {}
  }
},
  output: [{}]
});

const ifDrop25 = ifElse({
  version: 1,
  config: {
  "name": "If drop > 25%",
  "position": [
    350,
    300
  ],
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict"
      },
      "conditions": [
        {
          "id": "drop-threshold",
          "leftValue": "={{ $json.drop_pct }}",
          "rightValue": 25,
          "operator": {
            "type": "boolean",
            "operation": "gt"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  }
}
});

const telegramBroadcastToBlockGroup = node({
  type: 'n8n-nodes-base.telegram',
  version: 1,
  config: {
  "name": "Telegram: Broadcast to Block Group",
  "position": [
    600,
    200
  ],
  "parameters": {
    "message": "🚨 *Price Crash Alert — {{ $json.block_id }}*\n\nCrop: *{{ $json.crop }}*\nCurrent Price: *₹{{ $json.current_price }}/quintal*\nForecast Price: *₹{{ $json.forecast_price }}/quintal}*\nPrice Drop: *{{ $json.drop_pct }}%*\n\nAffected Farmers: {{ $json.affected_farmer_count }}\n\nAlternative Mandi: *{{ $json.alternative_mandi }}*\nPrice There: *₹{{ $json.alternative_price }}/quintal}*",
    "chatId": "={{ $env.TELEGRAM_BLOCK_GROUP_ID }}",
    "additionalFields": {
      "parse_mode": "Markdown"
    },
    "options": {}
  }
},
  output: [{}]
});

const notionLogPriceCrashEvent = node({
  type: 'n8n-nodes-base.notion',
  version: 1,
  config: {
  "name": "Notion: Log Price Crash Event",
  "position": [
    850,
    200
  ],
  "parameters": {
    "operation": "append",
    "database": "mandi_agent",
    "table": "price_crash_events",
    "columns": "block_id,crop,current_price,forecast_price,drop_pct,alternative_mandi,alternative_price,affected_farmers,created_at",
    "values": "={{ $json.block_id }},={{ $json.crop }},={{ $json.current_price }},={{ $json.forecast_price }},={{ $json.drop_pct }},={{ $json.alternative_mandi }},={{ $json.alternative_price }},={{ $json.affected_farmer_count }},NOW()",
    "options": {}
  }
},
  output: [{}]
});

const supabaseLogPriceCrash = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
  "name": "Supabase: Log Price Crash",
  "position": [
    1100,
    200
  ],
  "parameters": {
    "operation": "append",
    "database": "mandi_agent",
    "table": "price_crash_events",
    "columns": "block_id,crop,current_price,forecast_price,drop_pct,created_at",
    "values": "={{ $json.block_id }},={{ $json.crop }},={{ $json.current_price }},={{ $json.forecast_price }},={{ $json.drop_pct }},NOW()",
    "options": {}
  }
},
  output: [{}]
});

const ifSevereCrash40 = ifElse({
  version: 1,
  config: {
  "name": "If severe crash (>40%)",
  "position": [
    600,
    400
  ],
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict"
      },
      "conditions": [
        {
          "id": "severe-crash",
          "leftValue": "={{ $json.drop_pct }}",
          "rightValue": 40,
          "operator": {
            "type": "boolean",
            "operation": "gt"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  }
}
});

const slackAlertMandiOps = node({
  type: 'n8n-nodes-base.slack',
  version: 1,
  config: {
  "name": "Slack: Alert #mandi-ops",
  "position": [
    850,
    400
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
            "text": "⚠️ Price Crash Alert"
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": "*Block:*\n{{ $json.block_id }}"
            },
            {
              "type": "mrkdwn",
              "text": "*Crop:*\n{{ $json.crop }}"
            },
            {
              "type": "mrkdwn",
              "text": "*Current Price:*\n₹{{ $json.current_price }}"
            },
            {
              "type": "mrkdwn",
              "text": "*Forecast:*\n₹{{ $json.forecast_price }}"
            },
            {
              "type": "mrkdwn",
              "text": "*Drop:*\n{{ $json.drop_pct }}%"
            },
            {
              "type": "mrkdwn",
              "text": "*Affected Farmers:*\n{{ $json.affected_farmer_count }}"
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

const telegramFollowUpAlert = node({
  type: 'n8n-nodes-base.telegram',
  version: 1,
  config: {
  "name": "Telegram: Follow-up Alert",
  "position": [
    600,
    600
  ],
  "parameters": {
    "message": "Mandi-Agent Alert: {{ $json.crop }} price in {{ $json.block_id }} has crashed {{ $json.drop_pct }}% to ₹{{ $json.forecast_price }}. Alternative mandi: {{ $json.alternative_mandi }} at ₹{{ $json.alternative_price }}.",
    "chatId": "={{ $env.TELEGRAM_BLOCK_GROUP_ID }}",
    "options": {}
  }
},
  output: [{}]
});

const postApiharvestIntentrecalculate = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "POST /api/harvest-intent/recalculate",
  "position": [
    850,
    600
  ],
  "parameters": {
    "url": "http://backend:8000/api/harvest-intent/recalculate",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "block_id",
          "value": "={{ $json.block_id }}"
        },
        {
          "name": "crop",
          "value": "={{ $json.crop }}"
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

export default workflow('id', 'Price Crash Broadcast')
  .add(webhookPriceCrashWarning)
  .to(ifDrop25)
  .to(ifDrop25
    .onTrue(telegramBroadcastToBlockGroup)
    .onFalse(ifSevereCrash40))
;