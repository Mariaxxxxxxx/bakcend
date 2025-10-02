// server.js (ESM)
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import http from "http";
import { Server } from "socket.io";

dotenv.config();

// -------------------------------
// App + HTTP server + Socket.IO
// -------------------------------
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.get("/test-env", (req, res) => { //algo que usaste para una prueba del render //
  res.json({
    OPENAI: process.env.OPENAI_API_KEY ? "✅ OK" : "❌ FALTA",
    MONGO: process.env.MONGODB_URI ? "✅ OK" : "❌ FALTA",
    MODEL: process.env.IA_MODEL,
    PORT: process.env.PORT
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || "*" },
});

// -------------------------------
/* MongoDB (usa MONGODB_URI del .env) */
// -------------------------------
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ Falta MONGODB_URI en .env");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ Conectado correctamente a MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ Error al conectar con MongoDB:", err);
    process.exit(1);
  });

// -------------------------------
// OpenAI
// -------------------------------
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Falta OPENAI_API_KEY en .env");
  process.exit(1);
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const IA_MODEL = process.env.IA_MODEL || "gpt-4o-mini";

// -------------------------------
// Schema y modelo
// -------------------------------
const UsoSchema = new mongoose.Schema({
  grado: { type: String, required: true },
  tema: { type: String, required: true },
  respuesta: { type: String, required: true },
  fecha: { type: Date, default: Date.now },
});
const Uso = mongoose.model("Uso", UsoSchema);

// -------------------------------
// Salud
// -------------------------------
app.get("/", (_req, res) => res.send("OK"));

// -------------------------------
// Chat principal
// -------------------------------
app.post("/api/chat", async (req, res) => {
  try {
    let { grado, tema } = req.body || {};

    // Normalización y validación
    grado = typeof grado === "string" ? grado.trim() : "";
    tema = typeof tema === "string" ? tema.trim() : "";

    if (!grado || !tema) {
      return res.status(400).json({ error: "Faltan datos del estudiante." });
    }

    const completion = await openai.chat.completions.create({
      model: IA_MODEL,
      messages: [
        {
          role: "system",
          content: `Eres un profesor amable y paciente que enseña a niños de grado ${grado}. Explica con ejemplos simples y emojis.`,
        },
        { role: "user", content: tema },
      ],
      temperature: 0.7,
    });

    const respuesta =
      completion?.choices?.[0]?.message?.content?.trim() || "No hay respuesta.";

    // Guardar en Mongo
    const nuevoRegistro = await Uso.create({ grado, tema, respuesta });

    // Emitir en tiempo real
    io.emit("nuevo-uso", {
      grado,
      tema,
      respuesta,
      fecha: nuevoRegistro.fecha,
    });

    res.json({ respuesta });
  } catch (err) {
    console.error("❌ Error en /api/chat:", err);
    // Caso típico del error que viste: content null -> 400 de OpenAI
    res.status(500).json({ error: "Error al procesar la respuesta." });
  }
});

// -------------------------------
// Historial por grado
// -------------------------------
app.get("/api/historial/:grado", async (req, res) => {
  try {
    const { grado } = req.params;
    const historial = await Uso.find({ grado }).sort({ fecha: -1 }).lean();
    res.json(historial);
  } catch (err) {
    console.error("❌ Error al obtener historial:", err);
    res.status(500).json({ error: "No se pudo obtener el historial." });
  }
});

// -------------------------------
// Arranque
// -------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});