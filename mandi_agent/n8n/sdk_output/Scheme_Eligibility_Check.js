import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const webhookNewFarmerRegistered = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 1,
  config: {
  "name": "Webhook: New Farmer Registered",
  "position": [
    100,
    300
  ],
  "parameters": {
    "httpMethod": "POST",
    "path": "scheme-check",
    "responseMode": "lastNode",
    "options": {}
  }
},
  output: [{}]
});

const pmKISANCheckEligibility = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "PM-KISAN: Check Eligibility",
  "position": [
    350,
    200
  ],
  "parameters": {
    "url": "https://pmkisan.gov.in/api/checkEligibility",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "farmer_id",
          "value": "={{ $json.farmer.farmer_id }}"
        },
        {
          "name": "phone",
          "value": "={{ $json.farmer.phone }}"
        },
        {
          "name": "state",
          "value": "={{ $json.farmer.location }}"
        },
        {
          "name": "landholding",
          "value": "={{ $json.farmer.landholding_acres }}"
        }
      ]
    },
    "options": {
      "timeout": 30000
    }
  }
},
  output: [{}]
});

const pmfbyCheckCropInsuranceEligibility = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "PMFBY: Check Crop Insurance Eligibility",
  "position": [
    350,
    400
  ],
  "parameters": {
    "url": "https://pmfby.gov.in/api/checkEligibility",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "farmer_id",
          "value": "={{ $json.farmer.farmer_id }}"
        },
        {
          "name": "crops",
          "value": "={{ JSON.stringify($json.farmer.crops) }}"
        },
        {
          "name": "state",
          "value": "={{ $json.farmer.location }}"
        }
      ]
    },
    "options": {
      "timeout": 30000
    }
  }
},
  output: [{}]
});

const ifAnySchemeEligible = ifElse({
  version: 1,
  config: {
  "name": "If Any Scheme Eligible",
  "position": [
    600,
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
          "id": "any-eligible",
          "leftValue": "={{ $json.pm_kisan_eligible || $json.pmfby_eligible }}",
          "rightValue": true,
          "operator": {
            "type": "boolean",
            "operation": "true"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  }
}
});

const reverieTranslateToLocalLanguage = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Reverie: Translate to Local Language",
  "position": [
    850,
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
          "value": "={{ $json.scheme_message }}"
        },
        {
          "name": "source_language",
          "value": "en"
        },
        {
          "name": "target_language",
          "value": "={{ $json.farmer.language }}"
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

const twilioSendSchemeAdvisory = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio: Send Scheme Advisory",
  "position": [
    1100,
    300
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $json.farmer.phone }}",
    "messageType": "text",
    "text": "={{ $json.translated_message }}",
    "options": {}
  }
},
  output: [{}]
});

const logInSupabase = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
  "name": "Log in Supabase",
  "position": [
    1350,
    300
  ],
  "parameters": {
    "operation": "append",
    "database": "mandi_agent",
    "table": "scheme_checks",
    "columns": "farmer_id,pm_kisan_eligible,pmfby_eligible,checked_at",
    "values": "={{ $json.farmer.farmer_id }},={{ $json.pm_kisan_eligible }},={{ $json.pmfby_eligible }},NOW()",
    "options": {}
  }
},
  output: [{}]
});

export default workflow('id', 'Scheme Eligibility Check')
  .add(webhookNewFarmerRegistered)
  .to(pmKISANCheckEligibility)
  .to(pmfbyCheckCropInsuranceEligibility)
  .to(ifAnySchemeEligible)
  .to(reverieTranslateToLocalLanguage)
  .to(twilioSendSchemeAdvisory)
  .to(logInSupabase)
  .to(ifAnySchemeEligible)
;