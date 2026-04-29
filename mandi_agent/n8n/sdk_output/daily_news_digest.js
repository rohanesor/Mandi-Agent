import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const cron600AMIST = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1,
  config: {
  "name": "Cron 6:00 AM IST",
  "position": [
    100,
    740
  ],
  "parameters": {
    "rule": {
      "cronExpression": "0 30 0 * * *"
    }
  }
},
  output: [{}]
});

const googleSheetsReadNewsDigestQueue = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4,
  config: {
  "name": "Google Sheets — read News Digest Queue",
  "position": [
    360,
    740
  ],
  "parameters": {
    "operation": "read",
    "sheetName": "News Digest Queue"
  }
},
  output: [{}]
});

const codeGroupByFarmerLanguage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
  "name": "Code — group by farmer language",
  "position": [
    640,
    740
  ],
  "parameters": {
    "mode": "runOnceForAllItems",
    "jsCode": "const rows = $input.all().map(i => i.json);\nconst grouped = rows.reduce((acc, r) => {\n  const lang = r.farmer_language || 'en';\n  if (!acc[lang]) acc[lang] = [];\n  acc[lang].push(r);\n  return acc;\n}, {});\nreturn Object.entries(grouped).map(([language, items]) => ({ json: { language, items } }));"
  }
},
  output: [{}]
});

const httpRequestTranslateViaBhashiniReverie = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "HTTP Request — translate via Bhashini/Reverie",
  "position": [
    930,
    740
  ],
  "parameters": {
    "method": "POST",
    "url": "http://backend:8000/api/translate",
    "sendBody": true,
    "jsonParameters": true,
    "options": {},
    "bodyParametersJson": "={\"target_language\": $json.language, \"items\": $json.items}"
  }
},
  output: [{}]
});

const twilioWhatsAppSendDigest = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio WhatsApp — send digest",
  "position": [
    1200,
    740
  ],
  "parameters": {
    "resource": "message",
    "from": "whatsapp:+14155238886",
    "to": "=whatsapp:{{ $json.farmer_phone || '' }}",
    "message": "={{ $json.translated_digest || 'Daily agri digest' }}"
  }
},
  output: [{}]
});

const googleSheetsClearDigestQueue = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4,
  config: {
  "name": "Google Sheets — clear digest queue",
  "position": [
    1460,
    740
  ],
  "parameters": {
    "operation": "clear",
    "sheetName": "News Digest Queue"
  }
},
  output: [{}]
});

export default workflow('id', 'daily_news_digest')
  .add(cron600AMIST)
  .to(googleSheetsReadNewsDigestQueue)
  .to(codeGroupByFarmerLanguage)
  .to(httpRequestTranslateViaBhashiniReverie)
  .to(twilioWhatsAppSendDigest)
  .to(googleSheetsClearDigestQueue)
;