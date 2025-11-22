import express from "express";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { createCanvas, loadImage, registerFont } from "canvas";
import ffmpeg from "fluent-ffmpeg";

// Optionally register a font
registerFont(path.join(__dirname, "fonts/Roboto-Regular.ttf"), { family: "Roboto" });

const app = express();
const PORT = process.env.PORT || 3000;

const BACKGROUNDS = [
  "./backgrounds/bg1.jpg",
  "./backgrounds/bg2.jpg",
  "./backgrounds/bg3.jpg",
  "./backgrounds/bg4.jpg",
  "./backgrounds/bg5.jpg",
  "./backgrounds/bg6.jpg",
  "./backgrounds/bg7.jpg",
  "./backgrounds/bg8.jpg",
  "./backgrounds/bg9.jpg"
];

const VERSES_URL = "https://raw.githubusercontent.com/chelms21/test-picture-thing/main/verses.js";

// ---------------------
// Utility: wrap text
// ---------------------
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

// ---------------------
// Fetch verses dynamically
// ---------------------
async function loadVerses() {
  const res = await fetch(VERSES_URL);
  const jsText = await res.text();

  // Wrap as ES module
  const wrappedText = `
    ${jsText}
    export { VERSES };
  `;

  const blobPath = path.join(__dirname, "verses-temp.mjs");
  fs.writeFileSync(blobPath, wrappedText);

  const module = await import(`file://${blobPath}`);
  fs.unlinkSync(blobPath);

  return module.VERSES;
}

// ---------------------
// Main endpoint
// ---------------------
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

    // Generate frames
    const FPS = 15;
    const DURATION = 10; // seconds
    const totalFrames = FPS * DURATION;
    const frameDir = path.join("./frames");
    if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir);

    for (let i = 0; i < totalFrames; i++) {
      ctx.drawImage(bg, 0, 0, canvasWidth, canvasHeight);

      ctx.font = `bold 50px "Roboto"`;
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
    const outputPath = path.join("./output", `bible-video-${Date.now()}.mp4`);
    if (!fs.existsSync("./output")) fs.mkdirSync("./output");

    ffmpeg()
      .input(path.join(frameDir, "frame%04d.png"))
      .inputFPS(FPS)
      .outputOptions(["-c:v libx264", "-pix_fmt yuv420p"])
      .output(outputPath)
      .on("end", () => {
        // Clean frames
        fs.readdirSync(frameDir).forEach(file => fs.unlinkSync(path.join(frameDir, file)));

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

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
