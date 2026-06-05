/**
 * Telegram Bot Worker - NESTS PDF Scanner
 * Scans last 5 minutes every 5 minutes for new PDFs
 * Uses Cloudflare Workers + KV Storage
 */

const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID_HERE';

const BASE_URL = "https://nests.tribal.gov.in/WriteReadData/RTF1984/{}.pdf";

const KNOWN = [
  { id: "1778741996", label: "Notice #20 – OMR/Answer Key Tier-II", date: "2026-05-14" },
  { id: "1773904899", label: "Notice #19 – Admit Card Tier-II", date: "2026-03-19" },
  { id: "1772527422", label: "Notice #18 – Exam City Tier-II", date: "2026-03-03" },
  { id: "1772082408", label: "Notice #17 – Schedule Tier-II", date: "2026-02-26" },
];

const KNOWN_IDS = new Set(KNOWN.map(k => k.id));

/**
 * Convert epoch timestamp to IST
 */
function epochToIST(ts) {
  const utcDt = new Date(ts * 1000);
  const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC + 5:30
  const istDt = new Date(utcDt.getTime() + istOffset);
  
  const year = istDt.getUTCFullYear();
  const month = String(istDt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDt.getUTCDate()).padStart(2, '0');
  const hours = String(istDt.getUTCHours()).padStart(2, '0');
  const mins = String(istDt.getUTCMinutes()).padStart(2, '0');
  const secs = String(istDt.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${mins}:${secs} IST`;
}

/**
 * Generate epoch IDs for last N minutes
 */
function buildIds(minutesBack = 5) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - (minutesBack * 60);
  
  const ids = [];
  for (let ep = start; ep <= now; ep++) {
    const epStr = String(ep);
    if (!KNOWN_IDS.has(epStr)) {
      ids.push(epStr);
    }
  }
  
  return { ids, start, now };
}

/**
 * Check if PDF exists via HEAD request
 */
async function checkPdf(pdfId) {
  const url = BASE_URL.replace('{}', pdfId);
  
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*',
        'Referer': 'https://nests.tribal.gov.in/',
      },
      redirect: 'follow',
    });
    
    const size = parseInt(response.headers.get('content-length') || '0', 10);
    const hit = response.status === 200 || response.status === 206;
    const isKnown = KNOWN_IDS.has(pdfId);
    
    return {
      id: pdfId,
      url: url,
      date: epochToIST(parseInt(pdfId)),
      status: response.status,
      hit: hit,
      size: size,
      known: isKnown,
      error: null,
    };
  } catch (e) {
    return {
      id: pdfId,
      url: url,
      date: epochToIST(parseInt(pdfId)),
      status: 0,
      hit: false,
      size: 0,
      known: false,
      error: e.message.substring(0, 80),
    };
  }
}

/**
 * Send message to Telegram
 */
async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    
    return await response.json();
  } catch (e) {
    console.error('Telegram send error:', e);
    return { ok: false, error: e.message };
  }
}

/**
 * Format result for Telegram message
 */
function formatTelegramMessage(result, isNew = false) {
  const tag = isNew ? '🆕 NEW ★★★' : '✅ KNOWN';
  const sizeStr = result.size > 0 ? `${Math.floor(result.size / 1024)}KB` : '?KB';
  
  return `<b>${tag}</b>
📄 ID: <code>${result.id}</code>
📅 Date: <code>${result.date}</code>
🔗 Status: ${result.status} | Size: ${sizeStr}
🌐 <a href="${result.url}">Download PDF</a>`;
}

/**
 * Main scan function
 */
async function scanPdfs(env) {
  console.log('Starting PDF scan...');
  
  const { ids, start, now } = buildIds(5); // Scan last 5 minutes
  
  console.log(`Scan window: ${new Date(start * 1000).toISOString()} → ${new Date(now * 1000).toISOString()}`);
  console.log(`Total IDs to check: ${ids.length}`);
  
  // Get last scan results from KV to avoid duplicate notifications
  let lastScannedKey = 'LAST_SCANNED_RESULTS';
  let lastResults = [];
  
  try {
    const stored = await env.TG.get(lastScannedKey);
    if (stored) {
      lastResults = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Could not retrieve last scan results:', e);
  }
  
  const lastResultIds = new Set(lastResults.map(r => r.id));
  
  // Scan all IDs (including known for sanity check)
  const allIdsToScan = KNOWN.map(k => k.id).concat(ids);
  
  const results = [];
  const found = [];
  
  // Process in parallel with concurrency limit (10 at a time for Workers)
  const concurrency = 10;
  for (let i = 0; i < allIdsToScan.length; i += concurrency) {
    const batch = allIdsToScan.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(checkPdf));
    results.push(...batchResults);
    
    // Filter for hits
    for (const result of batchResults) {
      if (result.hit && !lastResultIds.has(result.id)) {
        // New hit not seen before
        const isNew = !result.known;
        found.push({ ...result, isNew });
        
        // Send notification immediately
        if (isNew) {
          const message = formatTelegramMessage(result, true);
          await sendTelegramMessage(message);
          console.log(`Sent notification for NEW PDF: ${result.id}`);
        }
      }
    }
  }
  
  // Save current results to KV for next run
  const hits = results.filter(r => r.hit);
  try {
    await env.TG.put(lastScannedKey, JSON.stringify(hits), { expirationTtl: 3600 }); // 1 hour TTL
  } catch (e) {
    console.error('Could not save to KV:', e);
  }
  
  // Log summary
  const knownOk = results.filter(r => r.hit && r.known);
  const newPdfs = found.filter(r => r.isNew);
  
  console.log(`Summary:`);
  console.log(`  Known confirmed: ${knownOk.length}/${KNOWN.length}`);
  console.log(`  NEW PDFs found: ${newPdfs.length}`);
  
  // Send summary to Telegram
  if (newPdfs.length > 0) {
    const summaryMsg = `📊 <b>NESTS PDF Scan Summary</b>
    
🔍 Scanned: ${allIdsToScan.length} IDs (last 5 minutes)
✅ Total hits: ${hits.length}
🆕 NEW PDFs: ${newPdfs.length}`;
    
    await sendTelegramMessage(summaryMsg);
  }
  
  return {
    success: true,
    message: `Scan complete. Found ${found.length} new PDFs.`,
    found: found,
    results: results,
  };
}

/**
 * Cloudflare Worker Handler
 */
export default {
  async fetch(request, env, ctx) {
    // Simple health check endpoint
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return new Response('OK', { status: 200 });
    }
    
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // This runs on schedule (every 5 minutes via wrangler.toml)
    ctx.waitUntil(scanPdfs(env));
  },
};

/**
 * For local testing:
 * 
 * import { createClient } from 'redis';
 * 
 * // Simulate KV with Redis or in-memory store
 * class MockKV {
 *   constructor() {
 *     this.data = {};
 *   }
 *   
 *   async get(key) {
 *     return this.data[key] || null;
 *   }
 *   
 *   async put(key, value, options) {
 *     this.data[key] = value;
 *   }
 * }
 * 
 * // Test:
 * // const env = { TG: new MockKV() };
 * // await scanPdfs(env);
 */
