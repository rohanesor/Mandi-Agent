# ✅ Farmer-Friendly Webhooks - Deployment Checklist

**Project**: Mandi Agent with Custom Webhooks + Revery Voice  
**Date**: April 13, 2026  
**Status**: 🟢 Configuration Complete - Ready for Deployment

---

## 📦 DELIVERABLES COMPLETED

### Environment Configuration
- [x] Updated `.env` with Revery API credentials
- [x] Added Twilio WhatsApp number (+12602613264)
- [x] Configured Ops Coordinator WhatsApp (+916380221196)
- [x] Set Telegram Group ID (-1005258970621)
- [x] Configured Google Sheet ID (1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U)
- [x] Added Revery voice language preference (Hindi/हिंदी)

### Webhook Workflows (n8n)
- [x] **Webhook 1**: Voice Advisory Handler (`webhook-revery-voice-handler.json`)
  - Revery voice synthesis in Hindi
  - WhatsApp delivery via Twilio
  - Google Sheets logging
  - Supabase persistence

- [x] **Webhook 2**: Price Crash Broadcast (`webhook-price-crash-broadcast.json`)
  - Price drop detection (>20%)
  - Revery voice alert in Hindi
  - Telegram group broadcast
  - Ops coordinator alert
  - Multi-channel logging

- [x] **Webhook 3**: Emergency Spoilage Alert (`webhook-emergency-spoilage.json`)
  - Spoilage detection (>50%)
  - URGENT voice call to farmer
  - Cold storage action details
  - Emergency broadcast
  - 4-channel response system

### Documentation
- [x] `WEBHOOK_SETUP_GUIDE.md` - Complete setup instructions
- [x] `WEBHOOK_API_REFERENCE.md` - Full API documentation
- [x] `DEPLOYMENT_SUMMARY.md` - Architecture & overview
- [x] `QUICK_REFERENCE.txt` - Quick cheat sheet
- [x] `webhook-client.js` - Node.js client library
- [x] `webhook-config.json` - Configuration schema

---

## 🚀 PRE-DEPLOYMENT TASKS (DO THESE NOW)

### Priority 1 (CRITICAL - Do Today)
- [ ] **Get Telegram Bot Token**
  - Go to Telegram
  - Search for @BotFather
  - Type: /newbot
  - Name it: "Mandi Agent"
  - Copy token
  - Add to `.env`: `TELEGRAM_BOT_TOKEN=your_token_here`

- [ ] **Import 3 Workflows to n8n**
  - Login to https://rohanesor.app.n8n.cloud
  - Workflows → Import
  - Upload from `n8n/workflows/`:
    1. `webhook-revery-voice-handler.json`
    2. `webhook-price-crash-broadcast.json`
    3. `webhook-emergency-spoilage.json`

- [ ] **Configure n8n Credentials**
  - Settings → Credentials → New Credential
  - Add Twilio API credentials
  - Add Telegram Bot credentials
  - Add Google Sheets OAuth
  - Add Supabase headers

### Priority 2 (Important - Do Today)
- [ ] **Activate All 3 Webhooks**
  - For each workflow: click green toggle switch
  - Copy webhook URL
  - Save to a safe place

- [ ] **Test Voice Advisory Webhook**
  ```bash
  curl -X POST https://rohanesor.app.n8n.cloud/webhook/advisory/webhook \
    -H "Content-Type: application/json" \
    -d '{
      "farmer_id": "TEST_001",
      "phone": "+919876543210",
      "language": "hi",
      "advisory_text": "आपके गेहूं की कीमत ₹2150 है"
    }'
  ```
  - Verify: WhatsApp voice message received
  - Verify: Google Sheets entry created
  - Verify: Supabase record stored

- [ ] **Test Price Crash Webhook**
  ```bash
  curl -X POST https://rohanesor.app.n8n.cloud/webhook/price-crash/broadcast \
    -H "Content-Type: application/json" \
    -d '{
      "crop": "गेहूं",
      "block_id": "HARYANA-JHAJJAR",
      "current_price": 2150,
      "forecast_price": 1950,
      "drop_pct": 9.3,
      "affected_farmer_count": 324
    }'
  ```
  - Verify: Telegram broadcast received
  - Verify: WhatsApp alert to ops coordinator
  - Verify: Voice message generated

### Priority 3 (Recommended - Do Within 24 Hours)
- [ ] **Test Emergency Spoilage Webhook**
  ```bash
  curl -X POST https://rohanesor.app.n8n.cloud/webhook/emergency/spoilage \
    -H "Content-Type: application/json" \
    -d '{
      "farmer_id": "TEST_002",
      "farmer_phone": "+919876543210",
      "crop": "प्याज",
      "spoilage_pct": 65,
      "coordinates": {"lat": 28.7041, "lng": 77.1025},
      "recommended_action": "तुरंत कोल्ड स्टोरेज भेजें",
      "cold_storage_name": "SafeFresh"
    }'
  ```
  - Verify: Voice call to farmer
  - Verify: Text message with cold storage details
  - Verify: Telegram emergency broadcast
  - Verify: SMS to ops coordinator

- [ ] **Monitor n8n Execution Logs**
  - For each workflow, click "Executions"
  - Verify all test runs succeeded
  - Check for errors/warnings
  - Note response times

- [ ] **Check Google Sheets**
  - Verify "Advisories" tab has test entries
  - Verify "Price Crashes" tab has test entries
  - Verify "Emergencies" tab has test entries

- [ ] **Verify Supabase Tables**
  - Check `voice_sessions` table (should have test data)
  - Check `price_crash_events` table
  - Check `emergency_events` table

---

## 🔒 SECURITY SETUP (BEFORE PRODUCTION)

### Access Control
- [ ] Remove `.env` from git (already in .gitignore)
- [ ] Restrict Google Sheet access to authorized users only
- [ ] Add Telegram bot to farmer group only (not public)
- [ ] Generate secure API keys for webhook authentication
  ```
  Bearer Token: $(openssl rand -hex 32)
  API Key: $(openssl rand -hex 32)
  ```

### Webhook Security
- [ ] Add bearer token authentication to all webhooks
- [ ] Implement webhook signatures (SHA256)
- [ ] Enable rate limiting:
  - Advisory: 100 req/min
  - Price Crash: 50 req/min
  - Emergency: 200 req/min

### Error Handling
- [ ] Configure error notifications to ops coordinator
- [ ] Set up webhook retry logic (3 retries with exponential backoff)
- [ ] Log all errors to Supabase for analysis

---

## 📊 PRODUCTION DEPLOYMENT (WEEK 1)

### Day 1: Internal Testing
- [ ] Run all 3 webhooks with test data
- [ ] Monitor for 4 hours continuously
- [ ] Check all logging (Sheets, Supabase, n8n)
- [ ] Get ops coordinator feedback

### Day 2-3: Beta with Real Farmers
- [ ] Invite 10-20 trusted farmers
- [ ] Give them WhatsApp support number
- [ ] Monitor responses and feedback
- [ ] Adjust Revery voice settings if needed
- [ ] Fix any issues found

### Day 4-5: Gradual Rollout
- [ ] Increase to 100 farmers
- [ ] Monitor metrics:
  - Voice message success rate
  - Response times
  - Farmer satisfaction
  - System stability

### Day 6-7: Full Production
- [ ] Roll out to all farmers
- [ ] 24/7 monitoring
- [ ] Have on-call support
- [ ] Document any issues

---

## 📈 MONITORING & METRICS

### Daily KPIs
- [ ] Voice advisories sent: _____ 
- [ ] Average response time: _____ ms
- [ ] Price alerts sent: _____
- [ ] Emergency alerts: _____
- [ ] System uptime: _____%
- [ ] Farmer satisfaction: ___/5

### Weekly Review
- [ ] Total farmers reached: _____
- [ ] Total messages sent: _____
- [ ] Error rate: _____%
- [ ] Revery API usage: _____ characters
- [ ] Cost: ₹_____
- [ ] Feedback summary: _____

### Monthly Goals
- [ ] 1000+ farmers registered
- [ ] 5000+ advisories delivered
- [ ] <500ms average response time
- [ ] >95% success rate
- [ ] >4/5 satisfaction rating

---

## 🔧 TROUBLESHOOTING REFERENCE

| Issue | Solution |
|-------|----------|
| "Revery API Error" | Check API key, verify quota/credits |
| "Telegram bot not responding" | Verify token, check group ID format |
| "Google Sheets not logging" | Check OAuth, verify sheet ID, check tab names |
| "Twilio SMS not sending" | Verify phone numbers, check account balance |
| "WhatsApp messages delayed" | Check Twilio logs, verify phone numbers |
| "Voice synthesis failing" | Check language code, verify text encoding |

---

## 📞 SUPPORT TEAM ASSIGNMENTS

| Role | Name | WhatsApp | Task |
|------|------|----------|------|
| Ops Coordinator | [Your Name] | +916380221196 | Receive alerts, coordinate responses |
| n8n Admin | [Dev Name] | _____ | Monitor workflows, troubleshoot |
| Farmer Support | [Team Name] | +12602613264 | Answer farmer questions |
| Tech Lead | [Your Name] | _____ | Oversee deployment, make decisions |

---

## 📋 SIGN-OFF

### Technical Lead
- [ ] All webhooks configured correctly
- [ ] All integrations tested
- [ ] Security requirements met
- [ ] Documentation complete

**Name**: ________________  
**Date**: ________________  
**Signature**: ________________

### Project Manager
- [ ] Timeline confirmed
- [ ] Team assigned
- [ ] Budget approved
- [ ] Farmer communication plan ready

**Name**: ________________  
**Date**: ________________  
**Signature**: ________________

### Operations Lead
- [ ] Ready to receive alerts
- [ ] Cold storage partnerships confirmed
- [ ] Response procedures defined
- [ ] Team trained

**Name**: ________________  
**Date**: ________________  
**Signature**: ________________

---

## 🎯 SUCCESS CRITERIA

By end of Week 1, you should have:

✅ 3 active webhook endpoints  
✅ 100+ farmers using the system  
✅ 1000+ voice advisories delivered  
✅ 10+ price alerts broadcast  
✅ 2+ emergency responses coordinated  
✅ Google Sheets & Supabase fully tracking  
✅ Farmer satisfaction >4/5 stars  

---

## 📚 ADDITIONAL RESOURCES

- `WEBHOOK_SETUP_GUIDE.md` - Detailed setup steps
- `WEBHOOK_API_REFERENCE.md` - API documentation
- `QUICK_REFERENCE.txt` - Quick cheat sheet
- `webhook-client.js` - JS client code

---

## 🎉 READY TO LAUNCH!

You have everything needed to launch farmer-friendly webhook system with Revery voice advisories.

**Next Step**: Get Telegram Bot Token from @BotFather and start Day 1 of deployment.

---

**Version**: 1.0  
**Status**: ✅ Configuration Complete  
**Last Updated**: April 13, 2026
