import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const webhookSpoilageEmergency = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 1,
  config: {
  "name": "Webhook: Spoilage Emergency",
  "position": [
    100,
    300
  ],
  "parameters": {
    "httpMethod": "POST",
    "path": "spoilage-emergency",
    "responseMode": "lastNode",
    "options": {}
  }
},
  output: [{}]
});

const ifSpoilagePct65 = ifElse({
  version: 1,
  config: {
  "name": "If spoilage_pct > 65%",
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
          "id": "spoilage-threshold",
          "leftValue": "={{ $json.spoilage_pct }}",
          "rightValue": 65,
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

const twilioSendEmergencyWhatsApp = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio: Send Emergency WhatsApp",
  "position": [
    600,
    200
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $json.farmer_phone }}",
    "messageType": "text",
    "text": "={{ $json.recommended_action }}",
    "options": {}
  }
},
  output: [{}]
});

const nicColdStorageAPIFindNearest = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "NIC Cold Storage API: Find Nearest",
  "position": [
    850,
    200
  ],
  "parameters": {
    "url": "http://backend:8000/api/cold-storage/nearest",
    "method": "GET",
    "queryParameters": {
      "parameters": [
        {
          "name": "lat",
          "value": "={{ $json.farmer_lat }}"
        },
        {
          "name": "lng",
          "value": "={{ $json.farmer_lng }}"
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

const ifColdStorageAvailable = ifElse({
  version: 1,
  config: {
  "name": "If Cold Storage Available",
  "position": [
    1100,
    200
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
          "id": "cold-storage-available",
          "leftValue": "={{ $json.available }}",
          "rightValue": true,
          "operator": {
            "type": "boolean",
            "operation": "equals"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  }
}
});

const bookColdStorageSlot = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Book Cold Storage Slot",
  "position": [
    1350,
    150
  ],
  "parameters": {
    "url": "http://backend:8000/api/cold-storage/book",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "farmer_id",
          "value": "={{ $json.farmer_id }}"
        },
        {
          "name": "storage_id",
          "value": "={{ $json.storage_id }}"
        },
        {
          "name": "crop",
          "value": "={{ $json.crop }}"
        },
        {
          "name": "quantity",
          "value": "={{ $json.quantity_quintals }}"
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

const twilioConfirmColdStorageBooking = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio: Confirm Cold Storage Booking",
  "position": [
    1600,
    150
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $json.farmer_phone }}",
    "messageType": "text",
    "text": "={{ 'Cold storage booked! Location: ' + $json.storage_name + '. Contact: ' + $json.storage_contact }}",
    "options": {}
  }
},
  output: [{}]
});

const twilioRedirectSMS = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio: Redirect SMS",
  "position": [
    1350,
    350
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $json.farmer_phone }}",
    "messageType": "text",
    "text": "={{ 'Redirect to nearest mandi: ' + $json.alternate_mandi + '. Price there: ₹' + $json.alternate_price + '/q. Distance: ' + $json.distance_km + 'km.' }}",
    "options": {}
  }
},
  output: [{}]
});

const slackAlertMandiOps = node({
  type: 'n8n-nodes-base.slack',
  version: 1,
  config: {
  "name": "Slack: Alert #mandi-ops",
  "position": [
    1850,
    200
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
            "text": "🚨 Spoilage Emergency Alert"
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": "*Farmer:*\n{{ $json.farmer_id }}"
            },
            {
              "type": "mrkdwn",
              "text": "*Crop:*\n{{ $json.crop }}"
            },
            {
              "type": "mrkdwn",
              "text": "*Spoilage Risk:*\n{{ $json.spoilage_pct }}%"
            },
            {
              "type": "mrkdwn",
              "text": "*Recommended Action:*\n{{ $json.recommended_action }}"
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

export default workflow('id', 'Spoilage Emergency')
  .add(webhookSpoilageEmergency)
  .to(ifSpoilagePct65)
  .to(ifSpoilagePct65
    .onTrue(twilioSendEmergencyWhatsApp)
    .onFalse(slackAlertMandiOps))
;