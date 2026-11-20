import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

interface AnalyzeRequestPhoto {
  role: string;
  mimeType: string;
  base64Data: string;
}

interface AnalyzeRequestBody {
  cultivar?: string;
  sampleWeightGrams?: number;
  lotWeightKg?: number;
  groveLocation?: string;
  photos?: AnalyzeRequestPhoto[];
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "25mb" }));

  // Health & capability endpoint — never exposes secrets
  app.get("/api/health", (_req, res) => {
    const geminiConfigured = Boolean(getGeminiClient());
    res.json({
      status: "ok",
      service: "olivestima-backend",
      geminiConfigured,
      timestamp: new Date().toISOString(),
    });
  });

  // Protected server-side endpoint for future/live Gemini multimodal analysis
  app.post("/api/analyze-olive-sample", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "GEMINI_NOT_CONFIGURED",
        message:
          "Integrazione Gemini multimodale non configurata sul server. L'app continua a funzionare in modalità statistica locale.",
      });
      return;
    }

    const body = req.body as AnalyzeRequestBody;
    if (!body?.photos || !Array.isArray(body.photos) || body.photos.length === 0) {
      res.status(400).json({
        error: "INVALID_PAYLOAD",
        message: "Almeno una fotografia del campione di olive è richiesta.",
      });
      return;
    }

    try {
      const imageParts = body.photos.slice(0, 6).map((photo) => ({
        inlineData: {
          mimeType: photo.mimeType || "image/jpeg",
          data: photo.base64Data,
        },
      }));

      const promptText = `Sei un agronomo esperto in olivicoltura mediterranea e valutazione morfologica delle olive da olio.
Analizza le fotografie allegate relative a un campione di olive (${body.sampleWeightGrams ?? 500} g, cultivar dichiarata: ${body.cultivar ?? "Mista / Ignota"}, località: ${body.groveLocation || "non specificata"}).
Estrai esclusivamente stime visive morfologiche senza inventare misure di laboratorio chimico (Soxhlet o NIR).
Indica inoltre se servono fotografie supplementari (es. sezione trasversale di olive tagliate a metà per valutare il rapporto polpa/nocciolo, dettaglio difetti o scatto con luce più uniforme) per ridurre l'incertezza della stima.`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [...imageParts, { text: promptText }],
        },
        config: {
          systemInstruction:
            "Rispondi esclusivamente in italiano con dati JSON aderenti allo schema richiesto. Non presentare mai stime visive come misure chimiche reali.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              veraisonIndex: {
                type: Type.NUMBER,
                description: "Indice di invaiatura Jaén stimato da 0 (verde intenso) a 5 (nero maturo).",
              },
              greenPct: {
                type: Type.NUMBER,
                description: "Percentuale stimata di drupe verdi (0-100).",
              },
              turningPct: {
                type: Type.NUMBER,
                description: "Percentuale stimata di drupe in fase di invaiatura/violacee (0-100).",
              },
              blackPct: {
                type: Type.NUMBER,
                description: "Percentuale stimata di drupe scure/nere (0-100).",
              },
              turgorScore: {
                type: Type.NUMBER,
                description: "Punteggio di turgore e idratazione visiva da 0 (molto disidratate) a 1 (molto turgide).",
              },
              pulpToPitEstimate: {
                type: Type.NUMBER,
                description: "Rapporto visivo polpa/nocciolo stimato (tipico 3.0 - 6.5).",
              },
              defectSeverity: {
                type: Type.NUMBER,
                description: "Incidenza visiva di difetti sanitari (mosca, ammaccature, muffe) da 0 a 1.",
              },
              leafDebrisPct: {
                type: Type.NUMBER,
                description: "Percentuale stimata di foglie o rametti nel campione (0-25).",
              },
              varietyHint: {
                type: Type.STRING,
                description: "Breve nota morfologica sulla forma delle drupe.",
              },
              confidence: {
                type: Type.NUMBER,
                description: "Confidenza complessiva dell'analisi visiva da 0.3 a 0.95.",
              },
              summaryNote: {
                type: Type.STRING,
                description: "Sintesi agronomica visiva in italiano (max 2 frasi).",
              },
              recommendedSupplementalRoles: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Eventuali ruoli foto mancanti consigliati tra: cross_section, supplemental_defect, supplemental_lighting.",
              },
            },
            required: [
              "veraisonIndex",
              "greenPct",
              "turningPct",
              "blackPct",
              "turgorScore",
              "pulpToPitEstimate",
              "defectSeverity",
              "leafDebrisPct",
              "varietyHint",
              "confidence",
              "summaryNote",
              "recommendedSupplementalRoles",
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json({
        provider: "gemini-4-hydrogen",
        features: parsed,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore sconosciuto durante l'analisi multimodale.";
      res.status(502).json({
        error: "GEMINI_UPSTREAM_ERROR",
        message,
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`OLIVESTIMA server attivo su http://0.0.0.0:${PORT}`);
  });
}

startServer();
