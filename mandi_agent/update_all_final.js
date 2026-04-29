const https = require('https');

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM";
const endpoint = "rohanesor.app.n8n.cloud";
const path = "/mcp-server/http";

const TWILIO_FROM = "+12602613264";
const COORD_PHONE = "+916380221196";
const SHEET_ID = "1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U";

const workflows = [
    { id: "xFBc6JGAEJBlBQAM", name: "WhatsApp Advisory Loop" },
    { id: "VI8R4hQ9mJITxsyF", name: "Daily Harvest Alerts" },
    { id: "TIvHRUCHZolq6XiV", name: "Price Crash Broadcast" },
    { id: "AS2n1XlbzOs7Jz3a", name: "Scheme Eligibility Check" },
    { id: "ttzUUSY42wyDQgEl", name: "Daily Weather Alerts" },
    { id: "1IcoKljLeR7LeqFL", name: "FPO Weekly Digest" },
    { id: "RfGPHsjtjzHMrEQE", name: "Spoilage Emergency" },
    { id: "qirB9pYtjEPn6Ubn", name: "Bundle Notification" }
];

function getCode(name) {
    if (name === "WhatsApp Advisory Loop") return `
import { workflow, node, trigger } from '@n8n/workflow-sdk';
const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Twilio Inbound', path: 'whatsapp-inbound' } });
const parseMsg = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Parse Msg', jsCode: 'return [{ json: { from_phone: ($input.first().json.From || "").replace("whatsapp:",""), user_message: $input.first().json.Body } }];' } });
const getAdvisory = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'GET Advisory', url: 'http://localhost:8000/api/advisory', method: 'POST', sendBody: true, bodyParameters: { parameters: [{ name: 'farmer_phone', value: "={{ $('Parse Msg').item.json.from_phone }}" }, { name: 'message', value: "={{ $('Parse Msg').item.json.user_message }}" }] } } });
const sendReply = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { name: 'Send WA Reply', from: 'whatsapp:${TWILIO_FROM}', to: "=whatsapp:{{ $('Parse Msg').item.json.from_phone }}", message: "{{ $json.advisory_text }}" } });
const logSheet = node({ type: 'n8n-nodes-base.googleSheets', version: 4.4, config: { name: 'Log', documentId: '${SHEET_ID}', sheetName: 'Advisories', operation: 'append' } });
export default workflow('whatsapp-advisory-loop', 'WhatsApp Advisory Loop').add(webhook).to(parseMsg).to(getAdvisory).to(sendReply).to(logSheet);`;

    if (name === "Daily Harvest Alerts") return `
import { workflow, node, trigger, splitInBatches, nextBatch } from '@n8n/workflow-sdk';
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Daily 6AM', parameters: { rule: { interval: [{ timezone: 'Asia/Kolkata', triggerAtHour: 6 }] } } } });
const getAlerts = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'GET Due', url: 'http://localhost:8000/api/harvest-alerts-due' } });
const loop = splitInBatches({ version: 3, config: { name: 'Loop', parameters: { batchSize: 10 } } });
const genAdvisory = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Gen Advisory', url: 'http://localhost:8000/api/advisory', method: 'POST' } });
const sendWA = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: "=whatsapp:{{ $json.farmer_phone }}", message: "{{ $json.advisory_text }}" } });
const log = node({ type: 'n8n-nodes-base.googleSheets', version: 4.4, config: { documentId: '${SHEET_ID}', sheetName: 'Advisories' } });
export default workflow('daily-harvest-alerts', 'Daily Harvest Alerts').add(cron).to(getAlerts).to(loop).to(genAdvisory).to(sendWA).to(log).to(nextBatch(loop));`;

    if (name === "Price Crash Broadcast") return `
import { workflow, node, trigger, ifElse, splitInBatches, nextBatch } from '@n8n/workflow-sdk';
const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { path: 'price-crash' } });
const ifDrop = ifElse({ version: 2.3, config: { parameters: { conditions: { conditions: [{ leftValue: '={{ $json.drop_pct }}', rightValue: 25, operator: { type: 'number', operation: 'gt' } }] } } } });
const getFarmers = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: '=http://localhost:8000/api/blocks/{{ $json.block_id }}/farmers' } });
const loop = splitInBatches({ version: 3, config: { parameters: { batchSize: 20 } } });
const waFarmer = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: "=whatsapp:{{ $json.farmer_phone }}", message: "Price crash alert! {{ $json.drop_pct }}% drop." } });
const ifSevere = ifElse({ version: 2.3, config: { parameters: { conditions: { conditions: [{ leftValue: '={{ $json.drop_pct }}', rightValue: 40, operator: { type: 'number', operation: 'gt' } }] } } } });
const waCoord = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: 'whatsapp:${COORD_PHONE}', message: "SEVERE crash in {{ $json.block_id }}!" } });
export default workflow('price-crash-broadcast', 'Price Crash Broadcast').add(webhook).to(ifDrop, { true: [getFarmers, loop, waFarmer, nextBatch(loop), ifSevere, { true: [waCoord] }] });`;

    if (name === "Scheme Eligibility Check") return `
import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';
const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { path: 'scheme-check' } });
const check = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: 'http://localhost:8000/api/schemes/eligible', method: 'POST' } });
const ifFound = ifElse({ version: 2.3, config: { parameters: { conditions: { conditions: [{ leftValue: '={{ $json.schemes_count }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }] } } } });
const waFarmer = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: "=whatsapp:{{ $json.farmer_phone }}", message: "You qualify for schemes: {{ $json.schemes_summary }}" } });
export default workflow('scheme-eligibility-check', 'Scheme Eligibility Check').add(webhook).to(check).to(ifFound, { true: [waFarmer] });`;

    if (name === "Daily Weather Alerts") return `
import { workflow, node, trigger, splitInBatches, nextBatch, ifElse } from '@n8n/workflow-sdk';
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { parameters: { rule: { interval: [{ triggerAtHour: 5, triggerAtMinute: 30 }] } } } });
const getAlerts = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: 'http://localhost:8000/api/weather/daily-alerts' } });
const loopBlocks = splitInBatches({ version: 3 });
const ifAlert = ifElse({ version: 2.3, config: { parameters: { conditions: { conditions: [{ leftValue: '={{ $json.has_alert }}', rightValue: true, operator: { type: 'boolean', operation: 'equal' } }] } } } });
const getFarmers = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: '=http://localhost:8000/api/blocks/{{ $json.block_id }}/farmers' } });
const loopFarmers = splitInBatches({ version: 3 });
const waWeather = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: "=whatsapp:{{ $json.farmer_phone }}", message: "Weather alert: {{ $json.alert_message }}" } });
export default workflow('daily-weather-alerts', 'Daily Weather Alerts').add(cron).to(loopBlocks).to(ifAlert, { true: [getFarmers, loopFarmers, waWeather, nextBatch(loopFarmers)] }).to(nextBatch(loopBlocks));`;

    if (name === "FPO Weekly Digest") return `
import { workflow, node, trigger, splitInBatches, nextBatch } from '@n8n/workflow-sdk';
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { parameters: { rule: { interval: [{ dayOfWeek: 'monday', triggerAtHour: 8 }] } } } });
const getFPOs = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: 'http://localhost:8000/api/fpo/list' } });
const loop = splitInBatches({ version: 3 });
const getStats = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: '=http://localhost:8000/api/fpo/{{ $json.fpo_id }}/weekly-stats' } });
const log = node({ type: 'n8n-nodes-base.googleSheets', version: 4.4, config: { documentId: '${SHEET_ID}', sheetName: 'FPO Reports' } });
const waCoord = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: 'whatsapp:${COORD_PHONE}', message: "Weekly summary for {{ $json.fpo_name }}." } });
export default workflow('fpo-weekly-digest', 'FPO Weekly Digest').add(cron).to(getFPOs).to(loop).to(getStats).to(log).to(waCoord).to(nextBatch(loop));`;

    if (name === "Spoilage Emergency") return `
import { workflow, node, trigger } from '@n8n/workflow-sdk';
const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { path: 'spoilage-emergency' } });
const getStorage = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: 'http://localhost:8000/api/cold-storage/nearest', method: 'POST' } });
const waFarmer = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: "=whatsapp:{{ $json.farmer_phone }}", message: "Storage at {{ $json.nearest_storage_name }}." } });
const waCoord = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: 'whatsapp:${COORD_PHONE}', message: "SPOILAGE for {{ $json.farmer_name }}!" } });
export default workflow('spoilage-emergency', 'Spoilage Emergency').add(webhook).to(getStorage).to(waFarmer).to(waCoord);`;

    if (name === "Bundle Notification") return `
import { workflow, node, trigger, splitInBatches, nextBatch } from '@n8n/workflow-sdk';
const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { path: 'bundle-notification' } });
const waCoord = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: 'whatsapp:${COORD_PHONE}', message: "Bundle for {{ $json.crop }}!" } });
const getFarmers = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: '=http://localhost:8000/api/bundles/{{ $json.bundle_id }}/farmers' } });
const loop = splitInBatches({ version: 3 });
const waFarmer = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: "=whatsapp:{{ $json.farmer_phone }}", message: "Your {{ $json.crop }} is bundled." } });
export default workflow('bundle-notification', 'Bundle Notification').add(webhook).to(waCoord).to(getFarmers).to(loop).to(waFarmer).to(nextBatch(loop));`;

    return "";
}

function postToMCP(data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const options = {
            hostname: endpoint,
            path: path,
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Content-Length': Buffer.byteLength(payload)
            }
        };
        const req = https.request(options, (res) => {
            let resData = '';
            res.on('data', (chunk) => { resData += chunk; });
            res.on('end', () => { resolve(resData); });
        });
        req.on('error', (e) => { reject(e); });
        req.write(payload);
        req.end();
    });
}

async function start() {
    for (const wf of workflows) {
        console.log("Updating: " + wf.name);
        const code = getCode(wf.name);
        try {
            const resp = await postToMCP({
                jsonrpc: "2.0",
                id: Date.now(),
                method: "tools/call",
                params: {
                    name: "update_workflow",
                    arguments: {
                        workflowId: wf.id,
                        code: code,
                        description: "Full logic with WhatsApp broadcast"
                    }
                }
            });
            if (resp.includes('"workflowId"')) {
                console.log("-> SUCCESS");
            } else {
                console.log("-> FAILED: " + resp.substring(0, 100));
            }
        } catch (e) {
            console.error("-> ERROR: " + e.message);
        }
    }
}

start();
