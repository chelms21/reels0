// server.js
import express from "express";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import ffmpeg from "fluent-ffmpeg";
import { fileURLToPath } from "url";

// --------------------
// ES module __dirname fix
// --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------
// App setup
// --------------------
const app = express();
const PORT = process.env.PORT || 3000;

// --------------------
// Config
// --------------------
const BACKGROUNDS = [
  path.join(__dirname, "backgrounds/bg1.jpg"),
  path.join(__dirname, "backgrounds/bg2.jpg"),
  path.join(__dirname, "backgrounds/bg3.jpg"),
  path.join(__dirname, "backgrounds/bg4.jpg"),
  path.join(__dirname, "backgrounds/bg5.jpg")
];

const VERSES_URL = "https://raw.githubusercontent.com/chelms21/test-picture-thing/main/verses.js";

// --------------------
// Utility: wrap text
// --------------------
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word + " ";
    } else {
      line = test;
    }
  }
  lines.push(line);
  return lines;
}

// --------------------
// Fetch verses dynamically
// --------------------
async function loadVerses() {
  const res = await fetch(VERSES_URL);
  const jsText = await res.text();

  // Wrap as ES module
  const wrappedText = `
    ${jsText}
    export { VERSES };
  `;

  const tempPath = path.join(__dirname, "verses-temp.mjs");
  fs.writeFileSync(tempPath, wrappedText);

  const module = await import(`file://${tempPath}`);
  fs.unlinkSync(tempPath);

  return module.VERSES;
}

// --------------------
// Ping endpoint
// --------------------
app.get("/ping", (req, res) => res.send("pong"));

// --------------------
// Main video generator
// --------------------
app.get("/generate-video", async (req, res) => {
  try {
    const VERSES = await loadVerses();
    const verse = VERSES[Math.floor(Math.random() * VERSES.length)];
    const bgPath = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];

    const canvasWidth = 720;
    const canvasHeight = 1280;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");

    const bg = await loadImage(bgPath);

    // Frame settings
    const FPS = 15;
    const DURATION = 10; // seconds
    const totalFrames = FPS * DURATION;
    const frameDir = path.join(__dirname, "frames");
    if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir);

    // Generate frames
    for (let i = 0; i < totalFrames; i++) {
      ctx.drawImage(bg, 0, 0, canvasWidth, canvasHeight);

      ctx.font = `bold 50px sans-serif`;
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 8;

      const lines = wrapText(ctx, `${verse.ref} — ${verse.text}`, canvasWidth - 60);
      let y = 450;
      for (const line of lines) {
        ctx.fillText(line, canvasWidth / 2, y);
        y += 70;
      }

      const framePath = path.join(frameDir, `frame${String(i).padStart(4, "0")}.png`);
      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(framePath, buffer);
    }

    // Output video
    const outputDir = path.join(__dirname, "output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    const outputPath = path.join(outputDir, `bible-video-${Date.now()}.mp4`);

    ffmpeg()
      .input(path.join(frameDir, "frame%04d.png"))
      .inputFPS(FPS)
      .outputOptions(["-c:v libx264", "-pix_fmt yuv420p"])
      .output(outputPath)
      .on("end", () => {
        // Clean frames
        fs.readdirSync(frameDir).forEach(f => fs.unlinkSync(path.join(frameDir, f)));

        // Send video
        res.download(outputPath, "bible-verse-video.mp4", err => {
          if (err) console.error(err);
          fs.unlinkSync(outputPath);
        });
      })
      .on("error", err => {
        console.error(err);
        res.status(500).send("Video generation failed");
      })
      .run();

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
