# Relay Modes - Explained Like You're 5 (Well, Maybe 10)

This tool helps you access blocked websites. It has **4 different ways** to do this. Think of them as 4 different disguises your internet traffic can wear.

---

## 🎭 The Big Picture

Imagine you want to send a letter to your friend, but someone is checking all the mail. Here's what each mode does:

1. **custom_domain** - You write your friend's address on the envelope (no disguise)
2. **domain_fronting** - You write a fake "safe" address on the envelope, but the mailman knows to deliver it to your friend
3. **google_fronting** - Same trick, but you use Google's address as the fake one
4. **apps_script** - You send it to Google, and Google forwards it to your friend

---

## 1️⃣ Custom Domain Mode (The Simple Way)

**What it does:**
Just connects directly to your server. No tricks, no disguises.

**Configuration:**
```json
{
  "mode": "custom_domain",
  "custom_domain": "myserver.com"
}
```

**When to use this:**
- Your website isn't blocked yet
- You just want things to work simply
- You have your own domain name

**Good stuff:**
✅ Super easy to set up
✅ Fast
✅ You control everything

**Bad stuff:**
❌ Easy to block (they just block your domain)
❌ No hiding where you're going

---

## 2️⃣ Domain Fronting Mode (The Disguise Trick)

**What it does:**
You pretend to visit a safe website (like `cloudflare.com`), but secretly you're going to your real server.

Think of it like this:
- The guard at the door sees you going to "cloudflare.com" ✅
- But once you're inside, you actually go to "myserver.com" 🤫

**Configuration:**
```json
{
  "mode": "domain_fronting",
  "front_domain": "cloudflare.com",  ← What the guard sees
  "worker_host": "myserver.com"      ← Where you really go
}
```

**When to use this:**
- Your server is blocked, but big companies like Cloudflare aren't
- You need to hide where you're really going

**Good stuff:**
✅ Hides your real destination
✅ Uses big company servers (harder to block)

**Bad stuff:**
❌ Many companies have closed this loophole
❌ Harder to set up

---

## 3️⃣ Google Fronting Mode (The Google Disguise)

**What it does:**
Same as mode 2, but you specifically pretend to visit Google. This is powerful because **blocking Google would break YouTube, Gmail, and everything else**.

**Configuration:**
```json
{
  "mode": "google_fronting",
  "google_ip": "216.239.38.120",        ← Google's actual server
  "front_domain": "www.google.com",     ← What the guard sees
  "worker_host": "myapp.run.app"        ← Your real server (on Google Cloud)
}
```

**When to use this:**
- You need strong protection
- Google isn't blocked (it rarely is)
- You can put your server on Google Cloud

**Good stuff:**
✅ Very hard to block (would break all of Google)
✅ Google's servers are fast and reliable
✅ Works with YouTube and other Google stuff automatically

**Bad stuff:**
❌ You need to use Google Cloud (costs money)
❌ Google might catch on someday

---

## 4️⃣ Apps Script Mode (The Ultimate Disguise)

**What it does:**
You send your request to Google Apps Script, and Google fetches the website for you. It's like asking Google to be your messenger.

**The flow:**
1. You → Google Apps Script: "Hey Google, can you get me this website?"
2. Google Apps Script → Real Website: "Give me that page"
3. Real Website → Google Apps Script: "Here you go"
4. Google Apps Script → You: "Here's what you asked for"

**Configuration:**
```json
{
  "mode": "apps_script",
  "google_ip": "216.239.38.120",              ← Google's server
  "front_domain": "www.google.com",           ← The disguise
  "script_id": "AKfycbz...",                  ← Your Google Script ID
  "auth_key": "super-secret-password-123"     ← Your secret password
}
```

**How to set it up:**
1. Go to https://script.google.com (you need a Google account)
2. Click "New Project"
3. Copy the code from `Code.gs` file
4. **IMPORTANT:** Change `AUTH_KEY` to your own secret password
5. Click "Deploy" → "New deployment" → "Web app"
6. Set "Execute as: Me" and "Who has access: Anyone"
7. Copy the deployment ID (looks like `AKfycbz...`)
8. Paste it into your `config.json`

**When to use this:**
- You need MAXIMUM protection
- Everything else is blocked
- You don't want to pay for servers
- You're okay with Google's free limits

**Good stuff:**
✅ Almost impossible to block (would break all Google Apps)
✅ No server costs (Google hosts it for free)
✅ Has a password so only you can use it
✅ Can handle multiple requests at once (fast!)

**Bad stuff:**
❌ Google has daily limits (usually enough for personal use)
❌ Slightly slower (extra hop through Google)
❌ Requires a Google account

---

## 📊 Quick Comparison

| What matters | custom_domain | domain_fronting | google_fronting | apps_script |
|--------------|---------------|-----------------|-----------------|-------------|
| **How hard to block?** | 😢 Easy | 😐 Medium | 😊 Hard | 🎉 Very Hard |
| **How hard to set up?** | 😊 Easy | 😐 Medium | 😐 Medium | 😓 Hard |
| **How fast?** | 🚀 Fast | 🚀 Fast | 🚀 Fast | 🐢 Medium |
| **What do you need?** | Your server | CDN server | Google Cloud | Google account |
| **Daily limits?** | ❌ No | ❌ No | ❌ No | ⚠️ Yes |

---

## 🔍 Why Does This Work? (The Technical Bit)

When you visit a website, there's a "guard" checking your traffic. Here's what they can see:

1. **IP address** - Which server you're connecting to
2. **SNI (the envelope)** - The website name you write on the outside (they CAN see this)
3. **Host header (the letter inside)** - The real destination inside the encrypted envelope (they CANNOT see this)

**The trick:**
- Guard sees: "Oh, they're going to google.com" ✅ (SNI)
- Guard cannot see: "Actually going to blocked-site.com" 🤫 (Host header is encrypted)
- Google's server reads the real destination and sends you there

It's like writing a fake return address on an envelope, but the mailman knows where it really goes.

---

## 🤔 Which One Should I Use?

**Start with `custom_domain` if:**
- Nothing is blocked yet
- You just want it to work
- You like simple things

**Try `domain_fronting` if:**
- Your site got blocked
- You have a Cloudflare account
- You need basic hiding

**Use `google_fronting` if:**
- You need serious protection
- You can use Google Cloud (costs a bit)
- Google works in your country

**Use `apps_script` if:**
- Everything else is blocked
- You don't want to pay for servers
- You have a Google account
- You're okay with daily limits

---

## 🔒 Important Safety Tips

**DO THESE THINGS:**

1. ⚠️ **Change the password** in `Code.gs` before using Apps Script mode (don't use the default!)
2. 🚫 **Never share your `config.json`** file - it has your passwords
3. 🔐 **Keep `verify_ssl: true`** in your config (prevents hackers)
4. 🏠 **Keep `listen_host` as `127.0.0.1`** (only your computer can use the proxy)
5. 🔄 **Change your passwords** if you accidentally share them

**DON'T DO THESE THINGS:**

1. ❌ Don't commit `config.json` to GitHub
2. ❌ Don't commit the `ca/` folder (has your certificates)
3. ❌ Don't use the default `AUTH_KEY` from the example
4. ❌ Don't let other people access your proxy (security risk!)

---

## 📚 Need More Help?

- **Example config:** Look at `config.example.json`
- **Google Script code:** Check `Code.gs`
- **How it works inside:** Read `domain_fronter.py` (if you're brave)

---

## 💡 Still Confused?

**Think of it like ordering pizza:**

1. **custom_domain** = You call the pizza place directly
2. **domain_fronting** = You call a restaurant, but they transfer you to the pizza place
3. **google_fronting** = You call Google, they transfer you to the pizza place
4. **apps_script** = You tell Google what pizza you want, Google orders it for you and brings it to you

The last one is slowest but hardest for anyone to stop! 🍕
