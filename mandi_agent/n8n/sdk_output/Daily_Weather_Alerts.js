import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const cron500AMISTDaily = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1,
  config: {
  "name": "Cron — 5:00 AM IST Daily",
  "position": [
    120,
    280
  ],
  "parameters": {
    "rule": {
      "interval": [
        {
          "triggerAtHour": 5,
          "triggerAtMinute": 0,
          "timezone": "Asia/Kolkata"
        }
      ]
    }
  }
},
  output: [{}]
});

const checkWeatherAlert = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Check Weather Alert",
  "position": [
    360,
    280
  ],
  "parameters": {
    "method": "POST",
    "url": "http://backend:8000/api/weather/alerts/check",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "state",
          "value": "Karnataka"
        },
        {
          "name": "district",
          "value": "Kolar"
        },
        {
          "name": "block_id",
          "value": "KA-KOL-06"
        },
        {
          "name": "crop",
          "value": "Tomato"
        },
        {
          "name": "forecast_rain_mm",
          "value": "42"
        },
        {
          "name": "hail_probability",
          "value": "0.2"
        },
        {
          "name": "wind_kmph",
          "value": "26"
        }
      ]
    }
  }
},
  output: [{}]
});

const alertNeeded = ifElse({
  version: 2,
  config: {
  "name": "Alert Needed?",
  "position": [
    600,
    280
  ],
  "parameters": {
    "conditions": {
      "boolean": [
        {
          "value1": "={{ $json.push_sent }}",
          "value2": true
        }
      ]
    }
  }
}
});

const pushNotificationTrigger = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Push Notification Trigger",
  "position": [
    860,
    220
  ],
  "parameters": {
    "method": "POST",
    "url": "http://backend:8000/api/news/notify",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "article_id",
          "value": "={{ $json.alert_id }}"
        },
        {
          "name": "urgency",
          "value": "={{ $json.severity }}"
        }
      ]
    }
  }
},
  output: [{}]
});

export default workflow('id', 'Daily Weather Alerts')
  .add(cron500AMISTDaily)
  .to(checkWeatherAlert)
  .to(alertNeeded)
  .to(alertNeeded
    .onTrue(pushNotificationTrigger)
  )
;