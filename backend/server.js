const express = require("express");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
const { Log } = require("../logging-middleware");

const app = express();
app.use(bodyParser.json());

// In-memory storage
const urls = {}; // { shortcode: { originalUrl, expiry, clicks: [] } }

const HOST = "http://localhost";
const PORT = 5000;
const AUTH_TOKEN = "<your_token_here>"; // after auth API

// Create Short URL
app.post("/shorturls", async (req, res) => {
  try {
    let { url, validity = 30, shortcode } = req.body;

    if (!url || !/^https?:\/\//.test(url)) {
      await Log("backend", "error", "controller", "Invalid URL format", AUTH_TOKEN);
      return res.status(400).json({ error: "Invalid URL" });
    }

    if (!shortcode) {
      shortcode = uuidv4().slice(0, 6);
    }

    if (urls[shortcode]) {
      await Log("backend", "error", "controller", "Shortcode collision", AUTH_TOKEN);
      return res.status(400).json({ error: "Shortcode already in use" });
    }

    const expiry = new Date(Date.now() + validity * 60000);

    urls[shortcode] = { 
      originalUrl: url, 
      expiry, 
      clicks: [], 
      createdAt: new Date() 
    };

    await Log("backend", "info", "controller", `Short URL created: ${shortcode}`, AUTH_TOKEN);

    res.status(201).json({
      shortLink: `${HOST}:${PORT}/${shortcode}`,
      expiry: expiry.toISOString()
    });
  } catch (err) {
    await Log("backend", "fatal", "controller", `Error: ${err.message}`, AUTH_TOKEN);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Redirect
app.get("/:shortcode", (req, res) => {
  const { shortcode } = req.params;
  const record = urls[shortcode];

  if (!record) return res.status(404).json({ error: "Shortcode not found" });
  if (new Date() > record.expiry) return res.status(410).json({ error: "Link expired" });

  record.clicks.push({
    timestamp: new Date(),
    referrer: req.get("Referrer") || "direct",
    location: req.ip
  });

  res.redirect(record.originalUrl);
});

// Statistics
app.get("/shorturls/:shortcode", (req, res) => {
  const { shortcode } = req.params;
  const record = urls[shortcode];

  if (!record) return res.status(404).json({ error: "Shortcode not found" });

  res.json({
    originalUrl: record.originalUrl,
    createdAt: record.createdAt,
    expiry: record.expiry,
    totalClicks: record.clicks.length,
    clicks: record.clicks
  });
});

app.listen(PORT, () => console.log(`Backend running at ${HOST}:${PORT}`));
