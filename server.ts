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
  oliveCount?: number;
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

  app.use(express.json({ limit: "30mb" }));

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

  // Protected server-side endpoint for Gemini Vision multimodal analysis
  app.post("/api/analyze-olive-sample", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "GEMINI_NOT_CONFIGURED",
        message:
          "Chiave API Gemini non configurata lato server. Configura GEMINI_API_KEY nei segreti di ambiente.",
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
      const photosSlice = body.photos.slice(0, 8);
      const roleSummary = photosSlice.map((p, idx) => `Foto ${idx + 1}: ruolo=${p.role}`).join("; ");
      const hasCutPhoto = photosSlice.some((p) => p.role === "cross_section");

      const imageParts = photosSlice.map((photo) => ({
        inlineData: {
          mimeType: photo.mimeType || "image/jpeg",
          data: photo.base64Data,
        },
      }));

      const promptText = `Sei un agronomo esperto in olivicoltura mediterranea, patologia dell'olivo e valutazione visiva pre-frantoio.
Analizza attentamente TUTTE le fotografie allegate (${roleSummary}).
Dati campione forniti dall'utente:
- Peso campione: ${body.sampleWeightGrams ?? 1000} g
- Numero di olive dichiarato: ${body.oliveCount ? `${body.oliveCount} drupe` : "non dichiarato"}
- Varietà dichiarata: ${body.cultivar ?? "Mista / Ignota"}
- Località: ${body.groveLocation || "non specificata"}
- Foto di olive tagliate a metà presente: ${hasCutPhoto ? "SÌ" : "NO"}

REGOLE RIGOROSE DI INTEGRITÀ SCIENTIFICA:
1. Riporta esclusivamente ciò che è realmente osservabile nelle immagini caricate. Non inventare numeri o misure non ricavabili dalla fotografia.
2. Tutte le percentuali cromatiche (verdi, invaiate, nere) devono sommare a 100 e riflettere le olive effettivamente presenti nelle foto.
3. Valuta se sono presenti segni visibili di raggrinzimento, disidratazione, ammaccature/lesioni, muffe o fori/punture compatibili con attacchi della mosca olearia (Bactrocera oleae).
4. Per il rapporto polpa/nocciolo: imposta pulpToPitObservable=true e stima pulpToPitEstimate SOLO se è visibile una sezione di olive tagliate a metà; se NON ci sono olive tagliate, imposta pulpToPitObservable=false e pulpToPitEstimate=0.
5. Se le foto sono sfocate, troppo buie, con riflessi eccessivi, troppo distanti, o non mostrano olive chiaramente (es. immagine non pertinente), imposta imageQualitySufficient=false, spiega i motivi in qualityIssues e richiedi le foto mancanti in recommendedSupplementalRoles.
6. Non presentare mai una stima visiva come misurazione di laboratorio chimico.`;

      const callGemini = () =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: {
            parts: [...imageParts, { text: promptText }],
          },
          config: {
            systemInstruction:
              "Rispondi esclusivamente in italiano con un oggetto JSON valido aderente allo schema richiesto. Sii prudente, realistico e segnala sempre quando un parametro non è osservabile dalle immagini.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                veraisonIndex: {
                  type: Type.NUMBER,
                  description: "Indice di invaiatura Jaén visivo da 0.0 (tutte verdi) a 5.0 (tutte nere).",
                },
                greenPct: {
                  type: Type.NUMBER,
                  description: "Percentuale visiva di olive verdi (0-100).",
                },
                turningPct: {
                  type: Type.NUMBER,
                  description: "Percentuale visiva di olive invaiate/parzialmente violacee (0-100).",
                },
                blackPct: {
                  type: Type.NUMBER,
                  description: "Percentuale visiva di olive nere/completamente scure (0-100).",
                },
                maturationUniformity: {
                  type: Type.STRING,
                  description: "Uniformità della maturazione tra: alta, media, bassa.",
                },
                apparentAverageSize: {
                  type: Type.STRING,
                  description: "Dimensione media apparente delle drupe tra: piccola, media, grande.",
                },
                estimatedVisibleCount: {
                  type: Type.INTEGER,
                  description:
                    "Numero approssimativo di olive distinguibili nella foto panoramica, oppure 0 se troppo ammassate o non contabili.",
                },
                consistency: {
                  type: Type.STRING,
                  description:
                    "Stima visiva della consistenza (da turgore e superficie) tra: soda, media, molle.",
                },
                shrivelingDetected: {
                  type: Type.BOOLEAN,
                  description: "True se si notano raggrinzimenti evidenti sulla buccia.",
                },
                dehydrationLevel: {
                  type: Type.STRING,
                  description:
                    "Livello apparente di disidratazione tra: assente, lieve, moderata, marcata.",
                },
                turgorScore: {
                  type: Type.NUMBER,
                  description: "Punteggio visivo di turgore da 0.2 (molto disidratate) a 0.95 (turgide).",
                },
                pulpToPitObservable: {
                  type: Type.BOOLEAN,
                  description:
                    "True SOLO se nelle immagini sono presenti olive tagliate a metà che mostrano polpa e nocciolo.",
                },
                pulpToPitEstimate: {
                  type: Type.NUMBER,
                  description:
                    "Rapporto visivo polpa/nocciolo (es. 3.5-6.0) se pulpToPitObservable è true, altrimenti 0.",
                },
                visibleDefectsPct: {
                  type: Type.NUMBER,
                  description:
                    "Percentuale visiva stimata di olive con difetti, ammaccature o alterazioni (0-100).",
                },
                oliveFlySignsPct: {
                  type: Type.NUMBER,
                  description:
                    "Percentuale visiva stimata di olive con segni compatibili con attacchi della mosca olearia (0-100).",
                },
                defectSeverity: {
                  type: Type.NUMBER,
                  description: "Indice sintetico di severità difetti da 0.0 a 1.0.",
                },
                leafDebrisPct: {
                  type: Type.NUMBER,
                  description: "Percentuale visiva stimata di foglie e rametti nel campione (0-25).",
                },
                varietyHint: {
                  type: Type.STRING,
                  description:
                    "Nota morfologica breve sulle caratteristiche visibili delle drupe (forma, apice, lenticelle).",
                },
                confidence: {
                  type: Type.NUMBER,
                  description: "Confidenza visiva complessiva tra 0.30 e 0.95.",
                },
                imageQualitySufficient: {
                  type: Type.BOOLEAN,
                  description:
                    "True se la qualità fotografica è sufficiente per la valutazione visiva, false se servono scatti migliori.",
                },
                qualityIssues: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "Elenco di eventuali limiti o problemi riscontrati nelle foto (es. riflessi, sfocatura, assenza taglio).",
                },
                summaryNote: {
                  type: Type.STRING,
                  description:
                    "Sintesi agronomica visiva chiara in italiano (max 2-3 frasi) che distingue ciò che si vede da ciò che non è misurabile da foto.",
                },
                recommendedSupplementalRoles: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "Ruoli fotografici consigliati per migliorare la stima tra: cross_section, supplemental_defect, supplemental_lighting, closeup.",
                },
              },
              required: [
                "veraisonIndex",
                "greenPct",
                "turningPct",
                "blackPct",
                "maturationUniformity",
                "apparentAverageSize",
                "estimatedVisibleCount",
                "consistency",
                "shrivelingDetected",
                "dehydrationLevel",
                "turgorScore",
                "pulpToPitObservable",
                "pulpToPitEstimate",
                "visibleDefectsPct",
                "oliveFlySignsPct",
                "defectSeverity",
                "leafDebrisPct",
                "varietyHint",
                "confidence",
                "imageQualitySufficient",
                "qualityIssues",
                "summaryNote",
                "recommendedSupplementalRoles",
              ],
            },
          },
        });

      let response;
      try {
        response = await callGemini();
      } catch {
        await new Promise((r) => setTimeout(r, 600));
        response = await callGemini();
      }

      const parsed = JSON.parse((response.text ?? "{}").trim()) as Record<string, unknown>;
      if (!hasCutPhoto && !parsed.pulpToPitObservable) {
        parsed.pulpToPitObservable = false;
        parsed.pulpToPitEstimate = 0;
      }

      res.json({
        provider: "gemini-4-hydrogen",
        features: parsed,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Errore sconosciuto durante l'analisi multimodale.";
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
