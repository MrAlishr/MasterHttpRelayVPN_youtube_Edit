/**
 * DomainFront Relay — Google Apps Script (Quota-Optimized)
 *
 * TWO modes:
 *   1. Single:  POST { k, m, u, h, b, ct, r }       → { s, h, b }
 *   2. Batch:   POST { k, q: [{m,u,h,b,ct,r}, ...] } → { q: [{s,h,b}, ...] }
 *      Uses UrlFetchApp.fetchAll() — all URLs fetched IN PARALLEL.
 *
 * QUOTA MANAGEMENT:
 *   - Consumer accounts: 20,000 URL Fetch calls/day
 *   - Workspace accounts: 100,000 URL Fetch calls/day
 *   - Script runtime: 6 min/execution max
 *   - URL Fetch response size: 50 MB/call max
 *   - Properties storage: 500 KB total, 9 KB/value max
 *
 * DEPLOYMENT:
 *   1. Go to https://script.google.com → New project
 *   2. Delete the default code, paste THIS entire file
 *   3. Click Deploy → New deployment
 *   4. Type: Web app  |  Execute as: Me  |  Who has access: Anyone
 *   5. Copy the Deployment ID into config.json as "script_id"
 *
 * CHANGE THE AUTH KEY BELOW TO YOUR OWN SECRET!
 */

const AUTH_KEY = "CHANGE_ME_TO_A_STRONG_SECRET";

// ═══════════════════════════════════════════════════════════════════════════
// QUOTA CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Set your account type: "consumer" (gmail.com) or "workspace" (Google Workspace)
const ACCOUNT_TYPE = "consumer"; // Change to "workspace" if using Google Workspace

// Official Google Apps Script quotas (per documentation)
const QUOTA_LIMITS = {
  consumer: {
    url_fetch_daily: 20000,
    script_runtime_seconds: 360,  // 6 minutes
    url_fetch_response_mb: 50,
  },
  workspace: {
    url_fetch_daily: 100000,
    script_runtime_seconds: 360,  // 6 minutes
    url_fetch_response_mb: 50,
  }
};

// Soft limit configuration (percentage of hard limit to trigger warnings/blocks)
const SOFT_QUOTA_ENABLED = true;
const SOFT_LIMIT_PERCENTAGE = 0.90; // Block at 90% of daily quota
const WARNING_PERCENTAGE = 0.75;    // Warn at 75% of daily quota

// Calculate soft limits based on account type
const DAILY_HARD_LIMIT = QUOTA_LIMITS[ACCOUNT_TYPE].url_fetch_daily;
const DAILY_SOFT_LIMIT = Math.floor(DAILY_HARD_LIMIT * SOFT_LIMIT_PERCENTAGE);
const WARNING_THRESHOLD = Math.floor(DAILY_HARD_LIMIT * WARNING_PERCENTAGE);

// Quota tracking keys (stored in PropertiesService)
const QUOTA_WINDOW_START_KEY = "quota_window_start";
const QUOTA_USED_KEY = "quota_used";
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Execution time tracking (to avoid 6-minute timeout)
const MAX_EXECUTION_TIME_MS = 5 * 60 * 1000; // 5 minutes (leave 1 min buffer)
const EXECUTION_START_KEY = "execution_start";

// Headers to skip (never forward to target)
const SKIP_HEADERS = {
  host: 1,
  connection: 1,
  "content-length": 1,
  "transfer-encoding": 1,
  "proxy-connection": 1,
  "proxy-authorization": 1,
  "keep-alive": 1,
  "te": 1,
  "trailer": 1,
  "upgrade": 1,
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

function doPost(e) {
  var executionStart = Date.now();
  
  try {
    var req = JSON.parse(e.postData.contents);
    
    // Authentication check
    if (req.k !== AUTH_KEY) {
      return _json({ e: "unauthorized" });
    }

    // Calculate requested quota units
    var requestedUnits = _requestedFetchUnits(req);
    
    // Check quota availability
    var quota = _reserveQuotaUnits(requestedUnits);
    if (!quota.ok) {
      return _json({
        e: "quota_soft_limit",
        message: "Daily quota limit reached. Resets at: " + quota.resets_at,
        quota: quota,
      });
    }

    // Check execution time (prevent timeout)
    if (_isExecutionTimeLimitApproaching(executionStart)) {
      return _json({
        e: "execution_timeout_approaching",
        message: "Script execution time limit approaching",
      });
    }

    // Process request (batch or single)
    var result;
    if (Array.isArray(req.q)) {
      result = _doBatch(req.q, executionStart);
    } else {
      result = _doSingle(req);
    }

    // Add quota info to response if warning threshold reached
    if (quota.warning) {
      var resultObj = JSON.parse(result.getContent());
      resultObj._quota_warning = {
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining,
        percentage: Math.round((quota.used / quota.limit) * 100),
        resets_at: quota.resets_at,
      };
      return _json(resultObj);
    }

    return result;
    
  } catch (err) {
    var msg = String(err);
    
    // Detect hard quota limit errors from Google
    if (msg.toLowerCase().indexOf("service invoked too many times") >= 0) {
      return _json({
        e: "quota_hard_limit",
        message: "Google Apps Script hard quota limit reached",
        detail: msg,
        quota: _quotaSnapshot(),
      });
    }
    
    // Detect execution timeout errors
    if (msg.toLowerCase().indexOf("exceeded maximum execution time") >= 0) {
      return _json({
        e: "execution_timeout",
        message: "Script execution exceeded 6-minute limit",
        detail: msg,
      });
    }
    
    return _json({ 
      e: "internal_error",
      message: msg 
    });
  }
}

function doGet(e) {
  // Health check endpoint with quota status
  if (e && e.parameter && e.parameter.k === AUTH_KEY) {
    var quota = _quotaSnapshot();
    var health = {
      ok: true,
      account_type: ACCOUNT_TYPE,
      quota: quota,
      limits: {
        daily_hard_limit: DAILY_HARD_LIMIT,
        daily_soft_limit: DAILY_SOFT_LIMIT,
        warning_threshold: WARNING_THRESHOLD,
      },
      timestamp: new Date().toISOString(),
    };
    return _json(health);
  }
  
  // Default landing page
  return HtmlService.createHtmlOutput(
    "<!DOCTYPE html><html><head><title>Relay Service</title></head>" +
      '<body style="font-family:sans-serif;max-width:600px;margin:40px auto">' +
      "<h1>Relay Service Active</h1>" +
      "<p>This Google Apps Script relay is running normally.</p>" +
      "<p>Add <code>?k=YOUR_AUTH_KEY</code> to this URL to view quota status.</p>" +
      "<hr>" +
      "<p><small>Account Type: " + ACCOUNT_TYPE + " | " +
      "Daily Limit: " + DAILY_HARD_LIMIT.toLocaleString() + " requests</small></p>" +
      "</body></html>"
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

function _doSingle(req) {
  // Validate URL
  if (!req.u || typeof req.u !== "string" || !req.u.match(/^https?:\/\//i)) {
    return _json({ e: "bad_url", message: "Invalid or missing URL" });
  }
  
  try {
    var opts = _buildOpts(req);
    var resp = UrlFetchApp.fetch(req.u, opts);
    
    return _json({
      s: resp.getResponseCode(),
      h: resp.getHeaders(),
      b: Utilities.base64Encode(resp.getContent()),
    });
  } catch (err) {
    return _json({
      e: "fetch_failed",
      message: String(err),
      url: req.u,
    });
  }
}

function _doBatch(items, executionStart) {
  var fetchArgs = [];
  var errorMap = {};
  var validCount = 0;

  // Validate all items first
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    
    if (!item.u || typeof item.u !== "string" || !item.u.match(/^https?:\/\//i)) {
      errorMap[i] = "bad_url";
      continue;
    }
    
    var opts = _buildOpts(item);
    opts.url = item.u;
    fetchArgs.push({ _i: i, _o: opts });
    validCount++;
  }

  // Fetch all valid URLs in parallel using fetchAll()
  var responses = [];
  if (fetchArgs.length > 0) {
    try {
      // Check execution time before expensive operation
      if (_isExecutionTimeLimitApproaching(executionStart)) {
        return _json({
          e: "execution_timeout_approaching",
          message: "Batch processing aborted to prevent timeout",
          processed: 0,
          total: items.length,
        });
      }
      
      responses = UrlFetchApp.fetchAll(fetchArgs.map(function(x) { return x._o; }));
    } catch (err) {
      return _json({
        e: "batch_fetch_failed",
        message: String(err),
        attempted: fetchArgs.length,
      });
    }
  }

  // Build results array
  var results = [];
  var rIdx = 0;
  
  for (var i = 0; i < items.length; i++) {
    if (errorMap.hasOwnProperty(i)) {
      results.push({ e: errorMap[i] });
    } else {
      var resp = responses[rIdx++];
      results.push({
        s: resp.getResponseCode(),
        h: resp.getHeaders(),
        b: Utilities.base64Encode(resp.getContent()),
      });
    }
  }
  
  return _json({ q: results });
}

function _buildOpts(req) {
  var opts = {
    method: (req.m || "GET").toLowerCase(),
    muteHttpExceptions: true,
    followRedirects: req.r !== false,
    validateHttpsCertificates: true,
  };
  
  // Forward headers (skip proxy-specific ones)
  if (req.h && typeof req.h === "object") {
    var headers = {};
    for (var k in req.h) {
      if (req.h.hasOwnProperty(k) && !SKIP_HEADERS[k.toLowerCase()]) {
        headers[k] = req.h[k];
      }
    }
    opts.headers = headers;
  }
  
  // Handle request body
  if (req.b) {
    opts.payload = Utilities.base64Decode(req.b);
    if (req.ct) {
      opts.contentType = req.ct;
    }
  }
  
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUOTA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function _requestedFetchUnits(req) {
  // Batch request: count valid URLs
  if (Array.isArray(req.q)) {
    var valid = 0;
    for (var i = 0; i < req.q.length; i++) {
      var item = req.q[i];
      if (item && item.u && typeof item.u === "string" && item.u.match(/^https?:\/\//i)) {
        valid++;
      }
    }
    return Math.max(valid, 0);
  }
  // Single request
  return 1;
}

function _reserveQuotaUnits(units) {
  if (!SOFT_QUOTA_ENABLED) {
    var snapDisabled = _quotaSnapshot();
    snapDisabled.ok = true;
    snapDisabled.warning = false;
    return snapDisabled;
  }

  units = Math.max(Number(units) || 0, 0);
  
  // Use script lock to prevent race conditions
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000); // Wait up to 5 seconds for lock
  } catch (err) {
    return {
      ok: false,
      error: "lock_timeout",
      message: "Could not acquire quota lock",
    };
  }
  
  try {
    var props = PropertiesService.getScriptProperties();
    var now = Date.now();
    var windowStart = Number(props.getProperty(QUOTA_WINDOW_START_KEY) || "0");
    var used = Number(props.getProperty(QUOTA_USED_KEY) || "0");

    // Rolling 24-hour window (resets 24h after first request)
    if (!windowStart || (now - windowStart) >= QUOTA_WINDOW_MS) {
      windowStart = now;
      used = 0;
      props.setProperty(QUOTA_WINDOW_START_KEY, String(windowStart));
      props.setProperty(QUOTA_USED_KEY, "0");
    }

    var nextUsed = used + units;
    
    // Check against soft limit
    if (nextUsed > DAILY_SOFT_LIMIT) {
      return {
        ok: false,
        window_start: _formatIso(windowStart),
        resets_at: _formatIso(windowStart + QUOTA_WINDOW_MS),
        used: used,
        requested: units,
        limit: DAILY_SOFT_LIMIT,
        hard_limit: DAILY_HARD_LIMIT,
        remaining: Math.max(DAILY_SOFT_LIMIT - used, 0),
        warning: true,
        account_type: ACCOUNT_TYPE,
      };
    }

    // Reserve the quota
    props.setProperty(QUOTA_USED_KEY, String(nextUsed));
    
    return {
      ok: true,
      window_start: _formatIso(windowStart),
      resets_at: _formatIso(windowStart + QUOTA_WINDOW_MS),
      used: nextUsed,
      requested: units,
      limit: DAILY_SOFT_LIMIT,
      hard_limit: DAILY_HARD_LIMIT,
      remaining: Math.max(DAILY_SOFT_LIMIT - nextUsed, 0),
      warning: nextUsed >= WARNING_THRESHOLD,
      percentage: Math.round((nextUsed / DAILY_HARD_LIMIT) * 100),
      account_type: ACCOUNT_TYPE,
    };
  } finally {
    lock.releaseLock();
  }
}

function _quotaSnapshot() {
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var windowStart = Number(props.getProperty(QUOTA_WINDOW_START_KEY) || "0");
  var used = Number(props.getProperty(QUOTA_USED_KEY) || "0");
  
  // Check if window expired
  if (!windowStart || (now - windowStart) >= QUOTA_WINDOW_MS) {
    windowStart = 0;
    used = 0;
  }
  
  return {
    ok: true,
    enabled: SOFT_QUOTA_ENABLED,
    account_type: ACCOUNT_TYPE,
    window_start: windowStart ? _formatIso(windowStart) : null,
    resets_at: windowStart ? _formatIso(windowStart + QUOTA_WINDOW_MS) : null,
    used: used,
    limit: DAILY_SOFT_LIMIT,
    hard_limit: DAILY_HARD_LIMIT,
    remaining: Math.max(DAILY_SOFT_LIMIT - used, 0),
    warning: used >= WARNING_THRESHOLD,
    percentage: windowStart ? Math.round((used / DAILY_HARD_LIMIT) * 100) : 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION TIME MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function _isExecutionTimeLimitApproaching(startTime) {
  var elapsed = Date.now() - startTime;
  return elapsed >= MAX_EXECUTION_TIME_MS;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _formatIso(timestampMs) {
  return new Date(timestampMs).toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN FUNCTIONS (for manual quota management)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reset quota counters manually (run from Script Editor)
 * Useful for testing or emergency reset
 */
function resetQuota() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(QUOTA_WINDOW_START_KEY);
  props.deleteProperty(QUOTA_USED_KEY);
  Logger.log("Quota counters reset successfully");
}

/**
 * View current quota status (run from Script Editor)
 */
function viewQuotaStatus() {
  var quota = _quotaSnapshot();
  Logger.log("=== QUOTA STATUS ===");
  Logger.log("Account Type: " + quota.account_type);
  Logger.log("Used: " + quota.used + " / " + quota.hard_limit);
  Logger.log("Percentage: " + quota.percentage + "%");
  Logger.log("Remaining: " + quota.remaining);
  Logger.log("Warning: " + quota.warning);
  Logger.log("Resets At: " + quota.resets_at);
  return quota;
}
