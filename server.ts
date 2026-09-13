import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Gemini API initialized here
  // apiKey is parsed automatically from process.env.GEMINI_API_KEY
  const ai = new GoogleGenAI({
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Example chat state could be maintained per-user or session, but for now we'll 
  // do stateless /api/chat that takes conversation history or single prompt
  app.post("/api/chat", async (req, res) => {
    try {
      const { prompt, image, history, diffContext, model, activeFile } = req.body;
      
      let activeFileInstruction = "";
      if (activeFile && activeFile.path) {
        activeFileInstruction = `
Active File in View:
Path: ${activeFile.path}
Breadcrumbs: ${activeFile.breadcrumbPath || activeFile.path}
${activeFile.content !== undefined ? `File Content:\n\`\`\`\n${activeFile.content}\n\`\`\`` : '(File content is empty or not yet loaded)'}
The user is currently viewing this file. Use this active file context to answer questions, explain or summarize the code, propose refactorings, and generate relevant FileDiffs.
`;
      }

      const systemInstruction = `You are an AI Copilot for a visual repository planner. You are helping the user architect and modify their file structure.
When modifying files, you should describe what you are doing, and then you MAY generate a structured JSON FileDiff.
You help answer questions, summarize code, propose refactors, and generate ideas and diffs for changes. When asked to generate a diff, output IT AS valid JSON block surrounded by '\`\`\`json' matching the FileDiff interface:
interface FileDiff {
  action: 'add' | 'remove' | 'update';
  path: string;
  type: 'file' | 'folder';
  content?: string;
}
Do not return a list of diffs. Only 1 FileDiff per change if applicable.
${activeFileInstruction}
Current tree state context (if needed):
${diffContext}
      `;

      let contents: any[] = [];
      if (history && history.length > 0) {
          // Format history for model
          contents = history.map((msg: any) => {
             const parts: any[] = [];
             if (msg.image) {
                const mimeType = msg.image.split(';')[0].split(':')[1];
                const base64Data = msg.image.split(',')[1];
                parts.push({ inlineData: { data: base64Data, mimeType } });
             }
             if (msg.text) {
                parts.push({ text: msg.text });
             }
             return {
                role: msg.role === 'ai' ? 'model' : 'user',
                parts
             };
          });
      }
      
      const userParts: any[] = [];
      if (image) {
          const mimeType = image.split(';')[0].split(':')[1];
          const base64Data = image.split(',')[1];
          userParts.push({ inlineData: { data: base64Data, mimeType } });
      }
      if (prompt) {
          userParts.push({ text: prompt });
      }
      if (userParts.length > 0) {
          contents.push({ role: 'user', parts: userParts });
      }

      // Allow model to be selected, default to flash
      const selectedModel = model || "gemini-3.5-flash";
      const config: any = { systemInstruction };

      // Apply search grounding if gemini-3.5-flash is used
      if (selectedModel === "gemini-3.5-flash") {
         config.tools = [{ googleSearch: {} }];
      }

      const responseStream = await ai.models.generateContentStream({
        model: selectedModel,
        contents,
        config
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(chunk.text);
        }
      }
      res.end();
    } catch (error: any) {
      console.error(error);
      let errorMessage = "Failed to generate AI response.";
      if (error.message && error.message.includes("429") && error.message.includes("quota")) {
         errorMessage = "You have exceeded your API quota. Please try again later or check your API key / billing details.";
      } else if (error.message) {
         try {
             const parsed = JSON.parse(error.message);
             if (parsed.error && parsed.error.message) {
                 const innerParsed = JSON.parse(parsed.error.message);
                 if (innerParsed.error && innerParsed.error.message) {
                     errorMessage = innerParsed.error.message;
                 }
             }
         } catch(e) {
             errorMessage = error.message;
         }
      }
      
      if (!res.headersSent) {
          res.status(500).json({ error: errorMessage });
      } else {
          res.end();
      }
    }
  });

  app.post("/api/generate-image", async (req, res) => {
    try {
       const { prompt } = req.body;
       const response = await ai.models.generateImages({
         model: 'gemini-3.1-flash-image-preview',
         prompt,
         config: {
           numberOfImages: 1,
           outputMimeType: 'image/jpeg',
           aspectRatio: '1:1',
         },
       });
       if (response.generatedImages && response.generatedImages.length > 0) {
         const base64Image = response.generatedImages[0].image.imageBytes;
         res.json({ image: `data:image/jpeg;base64,${base64Image}` });
       } else {
         throw new Error("No image generated");
       }
    } catch (error: any) {
      console.error(error);
      let errorMessage = "Failed to generate image.";
      if (error.message && error.message.includes("429") && error.message.includes("quota")) {
         errorMessage = "You have exceeded your API quota. Please try again later or check your API key / billing details.";
      } else if (error.message) {
         try {
             const parsed = JSON.parse(error.message);
             if (parsed.error && parsed.error.message) {
                 const innerParsed = JSON.parse(parsed.error.message);
                 if (innerParsed.error && innerParsed.error.message) {
                     errorMessage = innerParsed.error.message;
                 }
             }
         } catch(e) {
             errorMessage = error.message;
         }
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // For Express 4
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
