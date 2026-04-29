import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const webhookBundleFormed = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 1,
  config: {
  "name": "Webhook: Bundle Formed",
  "position": [
    100,
    300
  ],
  "parameters": {
    "httpMethod": "POST",
    "path": "bundle-formed",
    "responseMode": "lastNode",
    "options": {}
  }
},
  output: [{}]
});

const loopPerFarmer = node({
  type: 'n8n-nodes-base.splitInBatches',
  version: 2,
  config: {
  "name": "Loop: Per Farmer",
  "position": [
    350,
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

const reverieTranslateToLocalLanguage = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Reverie: Translate to Local Language",
  "position": [
    600,
    300
  ],
  "parameters": {
    "url": "http://backend:8000/api/translate",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "text",
          "value": "={{ $json.message }}"
        },
        {
          "name": "source_language",
          "value": "en"
        },
        {
          "name": "target_language",
          "value": "={{ $json.language }}"
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

const sendBundleConfirmationWhatsApp = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Send Bundle Confirmation WhatsApp",
  "position": [
    850,
    300
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $json.farmer_phone }}",
    "messageType": "text",
    "mediaUrl": "",
    "options": {}
  }
},
  output: [{}]
});

const createBundleInSupabase = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
  "name": "Create Bundle in Supabase",
  "position": [
    1100,
    300
  ],
  "parameters": {
    "operation": "append",
    "database": "mandi_agent",
    "table": "bundles",
    "columns": "bundle_id,block_id,crop,farmer_ids,total_quantity,status,created_at",
    "values": "={{ $json.bundle.bundle_id }},={{ $json.bundle.block_id }},={{ $json.bundle.crop }},={{ JSON.stringify($json.bundle.farmer_ids) }},={{ $json.bundle.total_quantity_quintals }},confirmed,NOW()",
    "options": {}
  }
},
  output: [{}]
});

const googleSheetsCreateTransportManifest = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 3,
  config: {
  "name": "Google Sheets: Create Transport Manifest",
  "position": [
    1350,
    300
  ],
  "parameters": {
    "spreadsheetId": "={{ $env.GOOGLE_SHEETS_BUNDLE_ID }}",
    "sheet": "Transport Manifests",
    "options": {
      "valueInputMode": "USER_ENTERED"
    },
    "values": {
      "values": [
        "={{ $json.bundle.bundle_id }}",
        "={{ $json.bundle.crop }}",
        "={{ $json.bundle.target_mandi }}",
        "={{ $json.bundle.delivery_window_start }}",
        "={{ $json.bundle.total_quantity_quintals }}",
        "={{ $json.bundle.transport_saving_per_quintal }}",
        "={{ $json.bundle.farmer_ids }}",
        "={{ $json.triggered_at }}"
      ]
    }
  }
},
  output: [{}]
});

const porterAPICreateTruckBooking = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Porter API: Create Truck Booking",
  "position": [
    1600,
    300
  ],
  "parameters": {
    "url": "={{ $env.PORTER_API_URL }}/bookings",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "from_location",
          "value": "={{ $json.bundle.block_id }}"
        },
        {
          "name": "to_location",
          "value": "={{ $json.bundle.target_mandi }}"
        },
        {
          "name": "cargo_type",
          "value": "={{ $json.bundle.crop }}"
        },
        {
          "name": "quantity_tonnes",
          "value": "={{ $json.bundle.total_quantity_quintals / 10 }}"
        },
        {
          "name": "pickup_date",
          "value": "={{ $json.bundle.delivery_window_start }}"
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

export default workflow('id', 'Bundle Notification')
  .add(webhookBundleFormed)
  .to(loopPerFarmer)
  .to(reverieTranslateToLocalLanguage)
  .to(sendBundleConfirmationWhatsApp)
  .to(createBundleInSupabase)
  .to(googleSheetsCreateTransportManifest)
  .to(porterAPICreateTruckBooking)
;