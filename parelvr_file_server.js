// File: parelvr_file_server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const https = require("https");
const http = require("http");
const cors = require("cors");

const app = express();

// Middleware
app.use(bodyParser.json({ limit: "500mb" }));
app.use(cors()); // Allow cross-origin requests if Unity WebGL is used

// Directories
const DATA_DIR = path.join(__dirname, "data");
const WORLDS_DIR = path.join(DATA_DIR, "worlds");
const AVATARS_DIR = path.join(DATA_DIR, "avatars");

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
ensureDir(WORLDS_DIR);
ensureDir(AVATARS_DIR);

// Cloudflare domain (must be HTTPS)
const CLOUD_DOMAIN = "https://files.soulsgames.com";

// Helpers
function saveBase64File(base64, destPath) {
    const buffer = Buffer.from(base64, "base64");
    fs.writeFileSync(destPath, buffer);
}

function saveMetadata(type, fileName, metadata) {
    const metaPath = path.join(type === "world" ? WORLDS_DIR : AVATARS_DIR, fileName + ".json");
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
}

// --- Upload endpoints ---
app.post("/worlds", (req, res) => {
    const { userId, fileName, fileContent, description, isPublic, isNSFW, pfp } = req.body;
    if (!userId || !fileName || !fileContent) return res.status(400).json({ success: false, message: "Missing fields" });

    const destPath = path.join(WORLDS_DIR, fileName);
    saveBase64File(fileContent, destPath);

    const metadata = { userId, fileName, description, isPublic, isNSFW, pfp: pfp || null, uploadedAt: new Date().toISOString() };
    saveMetadata("world", fileName, metadata);

    return res.json({
        success: true,
        fileName,
        url: `${CLOUD_DOMAIN}/worlds/${encodeURIComponent(fileName)}`,
        message: "World uploaded successfully"
    });
});

app.post("/avatars", (req, res) => {
    const { userId, fileName, fileContent, description, isPublic, isNSFW, pfp } = req.body;
    if (!userId || !fileName || !fileContent) return res.status(400).json({ success: false, message: "Missing fields" });

    const destPath = path.join(AVATARS_DIR, fileName);
    saveBase64File(fileContent, destPath);

    const metadata = { userId, fileName, description, isPublic, isNSFW, pfp: pfp || null, uploadedAt: new Date().toISOString() };
    saveMetadata("avatar", fileName, metadata);

    return res.json({
        success: true,
        fileName,
        url: `${CLOUD_DOMAIN}/avatars/${encodeURIComponent(fileName)}`,
        message: "Avatar uploaded successfully"
    });
});

// --- Verify endpoint ---
app.get("/verify", (req, res) => {
    const { type, name } = req.query;
    if (!type || !name) return res.status(400).json({ success: false, message: "Missing type or name" });

    const dir = type === "world" ? WORLDS_DIR : AVATARS_DIR;
    const filePath = path.join(dir, name);
    const metaPath = path.join(dir, name + ".json");

    const exists = fs.existsSync(filePath) && fs.existsSync(metaPath);
    return res.json({ success: exists, fileName: name });
});

// --- List endpoint ---
app.get("/list/:type", (req, res) => {
    const type = req.params.type;
    const dir = type === "world" ? WORLDS_DIR : AVATARS_DIR;
    if (!fs.existsSync(dir)) return res.json([]);

    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

    // Ensure all URLs are HTTPS
    files.forEach(f => {
        if (type === "world") f.url = `${CLOUD_DOMAIN}/worlds/${encodeURIComponent(f.fileName)}`;
        else f.url = `${CLOUD_DOMAIN}/avatars/${encodeURIComponent(f.fileName)}`;
    });

    res.json(files);
});

// --- Delete endpoint ---
app.delete("/:type/:name", (req, res) => {
    const { type, name } = req.params;
    const dir = type === "world" ? WORLDS_DIR : AVATARS_DIR;
    const filePath = path.join(dir, name);
    const metaPath = path.join(dir, name + ".json");

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

    res.json({ success: true, fileName: name });
});

// Serve static files (always HTTPS via Cloudflare)
app.use("/worlds", express.static(WORLDS_DIR));
app.use("/avatars", express.static(AVATARS_DIR));

// Start server (HTTP only for internal use; HTTPS handled by Cloudflare)
const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`File server running on port ${PORT}. All URLs must use HTTPS via Cloudflare.`));
