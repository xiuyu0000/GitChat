const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
const port = 8000;

// Configure CORS
app.use(cors({
  origin: 'http://localhost:3000', // Replace with your frontend URL
  credentials: true
}));
app.use(express.json());

// Detect system proxy
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;

// Configure OpenAI API (via OpenRouter)
const openaiConfig = {
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
};

if (proxyUrl) {
  openaiConfig.httpAgent = new HttpsProxyAgent(proxyUrl);
  openaiConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
  console.log(`Using proxy: ${proxyUrl}`);
}

const openai = new OpenAI(openaiConfig);

let systemPrompt;

async function loadSystemPrompt() {
  try {
    systemPrompt = await fs.readFile("llm-branched-conversation-prompt.md", "utf-8");
  } catch (error) {
    console.error("Error loading system prompt:", error);
    process.exit(1);
  }
}

app.post("/generate", async (req, res) => {
  try {
    const data = req.body;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const stream = await openai.chat.completions.create({
      model: "anthropic/claude-opus-4-6",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(data) }
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        res.write(`data: ${JSON.stringify({ content: chunk.choices[0].delta.content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ content: "[DONE]" })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Error in generate endpoint:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

async function startServer() {
  await loadSystemPrompt();
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();