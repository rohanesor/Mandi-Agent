const axios = require('axios');

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjlmM2E4MDM3LWRmMmQtNGE3ZC04YTRhLTYwOWQzOTcwMmRmMiIsImlhdCI6MTc3NTk4Njk5NH0.xIvHRy-sphPU0l9CyOQ08yyrGl4JpP2lK2Tw1UZLVeM";
const url = "https://rohanesor.app.n8n.cloud/mcp-server/http";

const TWILIO_FROM = "+12602613264";
const COORD_PHONE = "+916380221196";
const SHEET_ID = "1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U";

const workflows = [
    {
        id: "xFBc6JGAEJBlBQAM",
        name: "WhatsApp Advisory Loop",
        code: `
import { workflow, node, trigger } from '@n8n/workflow-sdk';
const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Twilio Inbound', path: 'whatsapp-inbound' } });
const parseMsg = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Parse Msg', jsCode: "return [{ json: { from_phone: ($input.first().json.From || '').replace('whatsapp:',''), user_message: $input.first().json.Body } }];" } });
const getAdvisory = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: 'http://localhost:8000/api/advisory', method: 'POST' } });
const sendReply = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: "=whatsapp:{{ $json.from_phone }}", message: "{{ $json.advisory_text }}" } });
const logSheet = node({ type: 'n8n-nodes-base.googleSheets', version: 4.4, config: { documentId: '${SHEET_ID}', sheetName: 'Advisories' } });

export default workflow('whatsapp-advisory-loop', 'WhatsApp Advisory Loop')
  .add(webhook).to(parseMsg).to(getAdvisory).to(sendReply).to(logSheet);`
    },
    {
        id: "VI8R4hQ9mJITxsyF",
        name: "Daily Harvest Alerts",
        code: `
import { workflow, node, trigger, splitInBatches, nextBatch } from '@n8n/workflow-sdk';
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Daily 6AM', parameters: { rule: { interval: [{ triggerAtHour: 6 }] } } } });
const getAlerts = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: 'http://localhost:8000/api/harvest-alerts-due', method: 'GET' } });
const loop = splitInBatches({ version: 3, config: { name: 'Loop', parameters: { batchSize: 10 } } });
const genAdvisory = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { url: 'http://localhost:8000/api/advisory', method: 'POST' } });
const sendWA = node({ type: 'n8n-nodes-base.twilio', version: 1, config: { from: 'whatsapp:${TWILIO_FROM}', to: "=whatsapp:{{ $json.farmer_phone }}", message: "{{ $json.advisory_text }}" } });
const logSheet = node({ type: 'n8n-nodes-base.googleSheets', version: 4.4, config: { documentId: '${SHEET_ID}', sheetName: 'Advisories' } });

export default workflow('daily-harvest-alerts', 'Daily Harvest Alerts')
  .add(cron).to(getAlerts).to(loop).to(genAdvisory).to(sendWA).to(logSheet).to(nextBatch(loop));`
    }
];

async function updateWorkflows() {
    for (const wf of workflows) {
        console.log(\`Updating \${wf.name}...\`);
        try {
            const response = await axios.post(url, {
                jsonrpc: "2.0",
                id: Date.now(),
                method: "tools/call",
                params: {
                    name: "update_workflow",
                    arguments: {
                        workflowId: wf.id,
                        code: wf.code,
                        description: "Updated with real details via Node.js"
                    }
                }
            }, {
                headers: {
                    'Authorization': \`Bearer \${token}\`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(\`SUCCESS: \${wf.name} updated.\`);
            // console.log(JSON.stringify(response.data, null, 2));
        } catch (error) {
            console.error(\`FAILED: \${wf.name}\`);
            if (error.response) {
                console.error(JSON.stringify(error.response.data, null, 2));
            } else {
                console.error(error.message);
            }
        }
    }
}

updateWorkflows();
