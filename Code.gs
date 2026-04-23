/**
 * DomainFront Relay — Google Apps Script
 *
 * TWO modes:
 *   1. Single:  POST { k, m, u, h, b, ct, r }       → { s, h, b }
 *   2. Batch:   POST { k, q: [{m,u,h,b,ct,r}, ...] } → { q: [{s,h,b}, ...] }
 *      Uses UrlFetchApp.fetchAll() — all URLs fetched IN PARALLEL.
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

// Soft quota guard for Apps Script UrlFetchApp usage.
// Official daily URL Fetch quotas are commonly 20,000/day for consumer
// accounts and 100,000/day for Google Workspace accounts, but Google can
// change quotas at any time. Keep this below your real account limit so the
// relay fails gracefully before Apps Script hard-stops execution.
const SOFT_QUOTA_ENABLED = true;
const DAILY_SOFT_LIMIT_FETCH_CALLS = 18000;
const SOFT_QUOTA_WARN_PCT = 0.85;
const QUOTA_WINDOW_START_KEY = "quota_window_start";
const QUOTA_USED_KEY = "quota_used";
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

const SKIP_HEADERS = {
  host: 1, connection: 1, "content-length": 1,
  "transfer-encoding": 1, "proxy-connection": 1, "proxy-authorization": 1,
};

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.k !== AUTH_KEY) return _json({ e: "unauthorized" });

    var requestedUnits = _requestedFetchUnits(req);
    var quota = _reserveQuotaUnits(requestedUnits);
    if (!quota.ok) {
      return _json({
        e: "quota_soft_limit",
        quota: quota,
      });
    }

    // Batch mode: { k, q: [...] }
    if (Array.isArray(req.q)) return _doBatch(req.q);

    // Single mode
    return _doSingle(req);
  } catch (err) {
    var msg = String(err);
    if (msg.toLowerCase().indexOf("service invoked too many times") >= 0) {
      return _json({
        e: "quota_hard_limit",
        detail: msg,
        quota: _quotaSnapshot(),
      });
    }
    return _json({ e: msg });
  }
}

function _doSingle(req) {
  if (!req.u || typeof req.u !== "string" || !req.u.match(/^https?:\/\//i)) {
    return _json({ e: "bad url" });
  }
  var opts = _buildOpts(req);
  var resp = UrlFetchApp.fetch(req.u, opts);
  return _json({
    s: resp.getResponseCode(),
    h: resp.getHeaders(),
    b: Utilities.base64Encode(resp.getContent()),
  });
}

function _doBatch(items) {
  var fetchArgs = [];
  var errorMap = {};

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item.u || typeof item.u !== "string" || !item.u.match(/^https?:\/\//i)) {
      errorMap[i] = "bad url";
      continue;
    }
    var opts = _buildOpts(item);
    opts.url = item.u;
    fetchArgs.push({ _i: i, _o: opts });
  }

  // fetchAll() processes all requests in parallel inside Google
  var responses = [];
  if (fetchArgs.length > 0) {
    responses = UrlFetchApp.fetchAll(fetchArgs.map(function(x) { return x._o; }));
  }

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
  if (req.h && typeof req.h === "object") {
    var headers = {};
    for (var k in req.h) {
      if (req.h.hasOwnProperty(k) && !SKIP_HEADERS[k.toLowerCase()]) {
        headers[k] = req.h[k];
      }
    }
    opts.headers = headers;
  }
  if (req.b) {
    opts.payload = Utilities.base64Decode(req.b);
    if (req.ct) opts.contentType = req.ct;
  }
  return opts;
}

function doGet(e) {
  if (e && e.parameter && e.parameter.k === AUTH_KEY) {
    return _json({
      ok: true,
      quota: _quotaSnapshot(),
    });
  }
  return HtmlService.createHtmlOutput(
    "<!DOCTYPE html><html><head><title>My App</title></head>" +
      '<body style="font-family:sans-serif;max-width:600px;margin:40px auto">' +
      "<h1>Welcome</h1><p>This application is running normally.</p>" +
      "<p>Add <code>?k=YOUR_AUTH_KEY</code> to this URL to view soft quota status.</p>" +
      "</body></html>"
  );
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function _requestedFetchUnits(req) {
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
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var props = PropertiesService.getScriptProperties();
    var now = Date.now();
    var windowStart = Number(props.getProperty(QUOTA_WINDOW_START_KEY) || "0");
    var used = Number(props.getProperty(QUOTA_USED_KEY) || "0");

    // Use a rolling 24-hour window anchored to the first counted request.
    if (!windowStart || (now - windowStart) >= QUOTA_WINDOW_MS) {
      windowStart = now;
      used = 0;
      props.setProperty(QUOTA_WINDOW_START_KEY, String(windowStart));
      props.setProperty(QUOTA_USED_KEY, "0");
    }

    var nextUsed = used + units;
    var limit = DAILY_SOFT_LIMIT_FETCH_CALLS;
    if (nextUsed > limit) {
      return {
        ok: false,
        window_start: _formatIso(windowStart),
        resets_at: _formatIso(windowStart + QUOTA_WINDOW_MS),
        used: used,
        requested: units,
        limit: limit,
        remaining: Math.max(limit - used, 0),
        warning: (used / Math.max(limit, 1)) >= SOFT_QUOTA_WARN_PCT,
      };
    }

    props.setProperty(QUOTA_USED_KEY, String(nextUsed));
    return {
      ok: true,
      window_start: _formatIso(windowStart),
      resets_at: _formatIso(windowStart + QUOTA_WINDOW_MS),
      used: nextUsed,
      requested: units,
      limit: limit,
      remaining: Math.max(limit - nextUsed, 0),
      warning: (nextUsed / Math.max(limit, 1)) >= SOFT_QUOTA_WARN_PCT,
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
  if (!windowStart || (now - windowStart) >= QUOTA_WINDOW_MS) {
    windowStart = 0;
    used = 0;
  }
  var limit = DAILY_SOFT_LIMIT_FETCH_CALLS;
  return {
    ok: true,
    window_start: windowStart ? _formatIso(windowStart) : null,
    resets_at: windowStart ? _formatIso(windowStart + QUOTA_WINDOW_MS) : null,
    used: used,
    limit: limit,
    remaining: Math.max(limit - used, 0),
    warning: (used / Math.max(limit, 1)) >= SOFT_QUOTA_WARN_PCT,
    enabled: SOFT_QUOTA_ENABLED,
  };
}

function _formatIso(timestampMs) {
  return new Date(timestampMs).toISOString();
}
