# NESTS PDF Scanner Telegram Bot - Setup Guide

## Step 1: Get Your Telegram Bot Token

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Copy the **HTTP API token** provided (format: `123456789:ABCDefGHIjklMNOpqrSTUvwxyz...`)

## Step 2: Deploy to Cloudflare Workers

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click on "Workers" in the left sidebar
3. Click "Create Service"
4. Name it: `nests-pdf-scanner`
5. Click "Create Service"
6. In the editor, replace all code with the content from `index.js`

## Step 3: Set Your Bot Token

In the `index.js` file (around line 8):
```javascript
const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
```

Replace `YOUR_BOT_TOKEN_HERE` with your actual bot token from BotFather.

Example:
```javascript
const TELEGRAM_BOT_TOKEN = '123456789:ABCDefGHIjklMNOpqrSTUvwxyz1234567890';
```

## Step 4: Bind KV Namespace

1. In Cloudflare Workers dashboard, go to your worker
2. Click "Settings" → "Variables"
3. Under "KV Namespace Bindings", click "Add binding"
4. Set:
   - **Variable name**: `TG`
   - **KV namespace**: Create new or select existing (name it: `TG`)
5. Click "Save"

## Step 5: Setup Scheduled Trigger (Optional - for auto-scan)

1. Go to "Triggers" tab in your worker
2. Click "Add Cron Trigger"
3. Set cron to: `*/5 * * * *` (runs every 5 minutes)
4. Click "Add"

## Step 6: Initialize Telegram Webhook (RUN ONCE)

Once deployed, initialize the webhook by visiting:
```
https://your-worker-name.your-subdomain.workers.dev/setup
```

You should see response:
```json
{
  "success": true,
  "webhook_url": "https://your-worker-name.your-subdomain.workers.dev/webhook",
  "message": "Webhook set successfully!"
}
```

## Step 7: Start Using Your Bot

Open Telegram and find your bot (use the bot name from BotFather).

Send `/start` to begin!

---

## Available Commands

```
/start          - Show welcome menu
/help           - Detailed help
/scan           - Scan last 5 minutes NOW
/scan5          - Scan last 5 minutes
/scan1h         - Scan last 1 hour
/scan24h        - Scan last 24 hours
/check <id>     - Check specific PDF ID
/known          - List all known PDFs
/status         - Bot status
/stats          - Statistics
/settings       - Configure notifications
```

---

## How It Works

### ✅ Manual Scans
- Use `/scan`, `/scan1h`, `/scan24h` commands to scan on demand
- Shows live progress bar updating every 2 seconds
- Results displayed inline without spamming multiple messages

### 🔔 Auto Notifications
- Scheduled scan runs every 5 minutes automatically
- Only subscribed users get notifications
- Only NEW PDFs trigger alerts (known PDFs verified silently)

### 💾 Persistence
- KV Namespace stores:
  - Last scan results (to avoid duplicate notifications)
  - User settings (notify on/off, auto-scan on/off)
  - Subscribed chat IDs
  - Statistics

### 🎛️ User Settings
- `/settings` → Toggle notifications
- `/settings` → Toggle auto-scan
- Settings persist per user via KV

---

## Troubleshooting

### Bot not responding
- Check bot token is correct in `index.js`
- Run `/setup` endpoint again

### Webhook not initializing
- Visit: `https://your-worker.workers.dev/setup`
- Check response for errors

### KV not working
- Verify "TG" namespace binding in Worker Settings
- Check variable name is exactly `TG`

### No notifications
- User must send `/start` first to be subscribed
- Check `/settings` → Notifications are enabled
- Run `/scan` to test manually

---

## Manual Testing

Test the worker without Telegram:

```bash
# Health check
curl https://your-worker.workers.dev/health

# Manual scan
curl -X POST https://your-worker.workers.dev/scan

# Setup webhook again
curl -X POST https://your-worker.workers.dev/setup
```

---

## File Structure

```
crispy-spork/
├── index.js              ← Main worker (all in one)
├── telegram-bot-worker.js     ← (Optional - not used if using index.js alone)
├── telegram-bot-commands.js   ← (Optional - not used if using index.js alone)
└── SETUP.md              ← This file
```

---

## Notes

- The single `index.js` file contains everything needed
- No external imports or dependencies
- Pure Cloudflare Workers compatible
- Works with free Cloudflare Workers plan
- Auto-scan feature optional (requires cron trigger setup)

---

## Get Help

If bot token invalid: Check with BotFather again
If KV not working: Ensure namespace binding is set
If commands not working: Send `/help` to bot

Good luck! 🚀
