// File: parelvr_file_server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");

const app = express();
app.use(cors()); // Allow cross-origin requests

// Directories
const DATA_DIR = path.join(__dirname, "data");
const WORLDS_DIR = path.join(DATA_DIR, "worlds");
const AVATARS_DIR = path.join(DATA_DIR, "avatars");

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
ensureDir(WORLDS_DIR);
ensureDir(AVATARS_DIR);

// Cloudflare domain
const CLOUD_DOMAIN = "https://files.soulsgames.com";

// --- Multer setup for file uploads ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.body.type === "avatar" ? AVATARS_DIR : WORLDS_DIR;
        cb(null, type);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 500 } }); // 500 MB max

// --- Upload endpoints ---
app.post("/upload", upload.single("file"), (req, res) => {
    try {
        const { userId, name, description, isPublic, isNSFW, type, preview } = req.body;
        if (!userId || !name || !req.file) return res.status(400).json({ success: false, message: "Missing fields or file" });

        // Save metadata
        const metadata = {
            userId,
            fileName: req.file.filename,
            description: description || "",
            isPublic: isPublic === "true",
            isNSFW: isNSFW === "true",
            uploadedAt: new Date().toISOString(),
            preview: preview || null
        };

        const dir = type === "avatar" ? AVATARS_DIR : WORLDS_DIR;
        const metaPath = path.join(dir, req.file.filename + ".json");
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

        console.log(`[UPLOAD] ${type} uploaded: ${req.file.filename} by ${userId}`);

        res.json({
            success: true,
            fileName: req.file.filename,
            url: `${CLOUD_DOMAIN}/${type === "avatar" ? "avatars" : "worlds"}/${encodeURIComponent(req.file.filename)}`,
            message: `${type} uploaded successfully`
        });
    } catch (e) {
        console.error("[UPLOAD ERROR]", e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// --- Verify endpoint ---
app.get("/verify", (req, res) => {
    const { type, name } = req.query;
    if (!type || !name) return res.status(400).json({ success: false, message: "Missing type or name" });

    const dir = type === "world" ? WORLDS_DIR : AVATARS_DIR;
    const filePath = path.join(dir, name);
    const metaPath = path.join(dir, name + ".json");

    const exists = fs.existsSync(filePath) && fs.existsSync(metaPath);
    res.json({ success: exists, fileName: name });
});

// --- List endpoint ---
app.get("/list/:type", (req, res) => {
    const type = req.params.type;
    const dir = type === "world" ? WORLDS_DIR : AVATARS_DIR;
    if (!fs.existsSync(dir)) return res.json([]);

    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

    // Ensure URLs are HTTPS
    files.forEach(f => {
        f.url = `${CLOUD_DOMAIN}/${type === "world" ? "worlds" : "avatars"}/${encodeURIComponent(f.fileName)}`;
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

    console.log(`[DELETE] ${type} deleted: ${name}`);
    res.json({ success: true, fileName: name });
});

// --- Serve static files ---
app.use("/worlds", express.static(WORLDS_DIR));
app.use("/avatars", express.static(AVATARS_DIR));

// Start server
const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`File server running on port ${PORT}. Use HTTPS via Cloudflare.`));
