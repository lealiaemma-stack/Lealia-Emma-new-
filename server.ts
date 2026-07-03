import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const generateGeminiWithFallback = async (apiKey: string, contents: string, maxRetries = 2) => {
    const ai = new GoogleGenAI({ apiKey });
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-pro'];
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      for (const model of modelsToTry) {
        try {
          console.log(`Trying Gemini model: ${model}, attempt: ${attempt}`);
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              tools: [{ googleSearch: {} }]
            }
          });
          return { text: response.text };
        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.error?.status;
          const code = err?.status || err?.error?.code;
          const msg = err?.error?.message || err?.message || '';
          console.error(`Error with ${model}:`, status || code, msg);
          
          if (status === 'RESOURCE_EXHAUSTED' || code === 429) {
             // Try to wait a bit if we hit rate limits before trying next model
             await delay(2000);
             continue;
          }
          if (status === 'NOT_FOUND' || code === 404 || status === 'UNAVAILABLE' || code === 503) continue;
          continue;
        }
      }
      if (attempt < maxRetries) {
        console.log(`All Gemini models failed. Waiting 10s before retry to clear rate limits...`);
        await delay(10000);
      }
    }
    
    if (lastError && (lastError?.status === 429 || lastError?.error?.code === 429 || lastError?.error?.status === 'RESOURCE_EXHAUSTED')) {
       throw new Error("You have exceeded your Gemini API quota (Rate Limit). Please wait a minute and try again.");
    }
    throw lastError;
  };

  const generateOpenAI = async (apiKey: string, contents: string) => {
    console.log("Trying OpenAI model...");
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Always return pure JSON as requested, without markdown formatting or code blocks.' },
          { role: 'user', content: contents }
        ]
      })
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`OpenAI Error: ${err.error?.message || response.statusText}`);
    }
    const data = await response.json();
    return { text: data.choices[0].message.content };
  };

  const generateAnthropic = async (apiKey: string, contents: string) => {
    console.log("Trying Anthropic model...");
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4096,
        messages: [
          { role: 'user', content: contents + "\n\nCRITICAL: Output ONLY valid JSON. No other text, no markdown." }
        ]
      })
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Anthropic Error: ${err.error?.message || response.statusText}`);
    }
    const data = await response.json();
    return { text: data.content[0].text };
  };

  const generatePollinations = async (prompt: string) => {
    console.log("Trying Pollinations AI (Free/No-Key)...");
    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are an expert assistant. You MUST output ONLY valid JSON format. No markdown, no conversational text.' },
          { role: 'user', content: prompt + "\n\nCRITICAL: Output ONLY valid JSON." }
        ],
        model: 'openai',
        jsonMode: true
      })
    });
    
    if (!response.ok) {
      throw new Error('Pollinations AI Error. Please provide a valid API Key in Settings for reliable usage.');
    }
    const text = await response.text();
    return { text };
  };

  const generateUnified = async (req: express.Request, prompt: string) => {
    const customKey = req.headers['x-api-key'] as string || req.headers['x-gemini-api-key'] as string;
    const customCookies = req.headers['x-cookies'] as string;
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    
    if (apiKey) {
      if (apiKey.startsWith('sk-ant')) {
        return generateAnthropic(apiKey, prompt);
      } else if (apiKey.startsWith('sk-')) {
        return generateOpenAI(apiKey, prompt);
      } else {
        return generateGeminiWithFallback(apiKey, prompt);
      }
    } else if (customCookies) {
      // Bypassing logic for pure cookie auth
      return generateGeminiWithFallback('', prompt);
    } else {
      // NO API KEY PROVIDED - Fallback to Free Pollinations API!
      return generatePollinations(prompt);
    }
  };

  const parseJsonSafely = (text: string, defaultVal: any) => {
    if (!text) return defaultVal;
    try {
      return JSON.parse(text);
    } catch (e) {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (e2) {
          // ignore
        }
      }
      
      // Attempt to find the first { or [ and last } or ]
      try {
        const firstBrace = text.indexOf('{');
        const firstBracket = text.indexOf('[');
        const lastBrace = text.lastIndexOf('}');
        const lastBracket = text.lastIndexOf(']');
        
        let startIndex = -1;
        let endIndex = -1;
        
        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
          startIndex = firstBrace;
          endIndex = lastBrace;
        } else if (firstBracket !== -1) {
          startIndex = firstBracket;
          endIndex = lastBracket;
        }
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          return JSON.parse(text.substring(startIndex, endIndex + 1));
        }
      } catch (e3) {
        // ignore
      }

      console.error("Failed to parse JSON. Raw text:", text);
      throw new Error("Failed to parse AI response as JSON");
    }
  };

  async function getPexelsVideo(query: string, apiKey: string) {
    if (!apiKey) return null;
    try {
      const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=1`, {
        headers: {
          'Authorization': apiKey
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.videos && data.videos.length > 0) {
          const video = data.videos[0];
          const files = video.video_files;
          const bestFile = files.find((f: any) => f.quality === 'hd') || files[0];
          return {
            video_url: bestFile.link,
            author: video.user.name,
            author_url: video.user.url,
            original_url: video.url
          };
        }
      }
    } catch (e) {
      console.error("Pexels fetch error", e);
    }
    return null;
  }

  // Proxy to download video to bypass CORS
  app.post('/api/proxy-download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch video");
      
      const contentType = response.headers.get('Content-Type') || 'video/mp4';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
      
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy to stream video for preview
  app.get('/api/proxy-video', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL is required' });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch video");
      
      const contentType = response.headers.get('Content-Type') || 'video/mp4';
      res.setHeader('Content-Type', contentType);
      
      // stream it
      if (response.body) {
        // Since we are using standard fetch in Node 18+, response.body is a ReadableStream
        // We can just convert it or arrayBuffer it. For simplicity, just arrayBuffer for small videos:
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      } else {
        res.status(404).send('Not found');
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API 1: Analyze Script & Break down into sentences with asset queries
  app.post('/api/analyze-script', async (req, res) => {
    try {
      const { script } = req.body;
      if (!script) {
        return res.status(400).json({ error: 'Script is required' });
      }

      const prompt = `You are an expert documentary video editor and director. 
      Analyze the following script. Determine the overall context.
      
      Break the script down into MANY short, fast-paced scenes.
      CRITICAL RULES:
      - EACH SCENE MUST BE EXACTLY 10 SECONDS LONG.
      - EACH SCENE'S TEXT MUST BE EXACTLY 10 TO 15 WORDS LONG (no more, no less).
      - Generate as many scenes as needed to cover the entire script.
      
      For each scene:
      1. Provide the exact 10-15 words of text.
      2. Provide the inferred context.
      3. Create a highly detailed visual prompt for an AI Image Generator (subject, lighting, cinematic).
      4. Create a concise search query (2-4 words) that can be used on stock footage sites.
      5. Provide a Google Video Search URL to search the ENTIRE internet for this footage (e.g., https://www.google.com/search?tbm=vid&q=YOUR_QUERY_HERE).
      
      Script:
      """
      ${script}
      """
      
      You MUST return exactly a JSON array of objects. Use the following schema for each object:
      {
        "id": 1,
        "text": "The exact 10-15 word sentence from the script",
        "context": "The overall inferred context",
        "visual_prompt": "Detailed description of the visual scene",
        "search_query": "Short search query for stock footage",
        "pexels_url": "A valid Pexels search URL for this footage e.g. https://www.pexels.com/search/videos/YOUR_QUERY_HERE",
        "google_video_search_url": "A Google Video Search URL e.g. https://www.google.com/search?tbm=vid&q=YOUR_QUERY_HERE"
      }
      
      Do not include any formatting or other text, just return the JSON array.`;

      const response = await generateUnified(req, prompt);

      const result = parseJsonSafely(response.text, []);
      
      const pexelsApiKey = req.body.pexelsApiKey || process.env.PEXELS_API_KEY || 'THTpBrwPYoX4unenimXELbTmj6KiQjNqUQOfo35LiUVXWNcGInhqdM8u';
      if (pexelsApiKey && Array.isArray(result)) {
        await Promise.all(result.map(async (scene: any) => {
          const videoData = await getPexelsVideo(scene.search_query, pexelsApiKey);
          if (videoData) {
            scene.video_url = videoData.video_url;
            scene.pexels_author = videoData.author;
            scene.pexels_author_url = videoData.author_url;
            scene.pexels_original_url = videoData.original_url;
          }
        }));
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error analyzing script:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // API 2: Breakdown YouTube Video URL/Description into Ideas
  app.post('/api/breakdown-video', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'YouTube URL or description is required' });
      }

      const prompt = `Analyze the YouTube video link provided: "${url}".
      Please suggest 4 documentary video ideas that are in the EXACT SAME style, niche, and length as the real video.
      If it is a history documentary, suggest history topics. If it is a tech documentary, suggest tech topics.
      Include a strong 'hook' for each video idea.
      
      You MUST return exactly a JSON array of ideas. Use the following schema for each object in the array:
      {
        "title": "Title of the suggested video",
        "hook": "A strong hook for the beginning of the video",
        "description": "Brief description of what the video is about",
        "estimated_length_minutes": 10
      }
      
      Do not include any formatting or other text, just return the JSON array.`;

      const response = await generateUnified(req, prompt);

      const result = parseJsonSafely(response.text, []);
      res.json(result);
    } catch (error: any) {
      console.error('Error breaking down video:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // API 3: Generate Script and Assets from an Idea
  app.post('/api/generate-script', async (req, res) => {
    try {
      const { title, description, length } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const prompt = `Write a comprehensive, professional documentary script for a video titled "${title}".
      The description is: "${description}".
      The target length is approximately ${length} minutes.
      
      Create a highly detailed script. Start with a hook section, including the hook text and reaction footage.
      Then, break down the script into a roadmap/timeline of MANY short scenes.
      
      CRITICAL RULES:
      - EACH SCENE MUST BE EXACTLY 10 SECONDS LONG.
      - EACH SCENE'S VOICEOVER MUST BE EXACTLY 10 TO 15 WORDS LONG.
      - Generate as many scenes as needed to cover the requested length.
      
      For each scene in the roadmap, provide:
      1. A timestamp (e.g., 0:00 - 0:10, 0:10 - 0:20)
      2. The Voiceover text (strictly 10-15 words)
      3. Text on screen (if any)
      4. A detailed visual asset description for an AI Image Generator (subject, lighting, cinematic).
      5. A short search query for finding this asset.
      6. A Google Video Search URL to search the ENTIRE internet for this footage.
      
      You MUST return exactly a JSON object. Use the following schema:
      {
        "hook_section": {
          "hook_text": "The hook text...",
          "reaction_footage": "Description of the reaction footage"
        },
        "roadmap": [
          {
            "id": 1,
            "timestamp": "0:00 - 0:10",
            "voiceover": "The exact script/voiceover (10-15 words)...",
            "text_on_screen": "Text to display...",
            "visual_asset": "Description of required stock footage...",
            "search_query": "Short search query...",
            "pexels_url": "A valid Pexels search URL",
            "google_video_search_url": "A Google Video Search URL e.g. https://www.google.com/search?tbm=vid&q=YOUR_QUERY_HERE"
          }
        ]
      }
      
      Do not include any formatting or other text, just return the JSON object.`;

      const response = await generateUnified(req, prompt);

      const result = parseJsonSafely(response.text, {});
      
      const pexelsApiKey = req.body.pexelsApiKey || process.env.PEXELS_API_KEY || 'THTpBrwPYoX4unenimXELbTmj6KiQjNqUQOfo35LiUVXWNcGInhqdM8u';
      if (pexelsApiKey && result.roadmap && Array.isArray(result.roadmap)) {
        await Promise.all(result.roadmap.map(async (scene: any) => {
          const videoData = await getPexelsVideo(scene.search_query, pexelsApiKey);
          if (videoData) {
            scene.video_url = videoData.video_url;
            scene.pexels_author = videoData.author;
            scene.pexels_author_url = videoData.author_url;
            scene.pexels_original_url = videoData.original_url;
          }
        }));
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error generating script:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // API 4: Check API Key
  app.post('/api/check-api-key', async (req, res) => {
    try {
      const apiKey = req.body.apiKey?.trim();
      const cookies = req.body.cookies?.trim();
      let provider = 'unknown';

      if (!apiKey && !cookies) {
        // Test Pollinations
        provider = 'Free Public AI (Pollinations)';
        const r = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Say ok' }],
            model: 'openai'
          })
        });
        if (!r.ok) throw new Error('Free Public API is temporarily down');
      } else if (apiKey) {
        if (apiKey.startsWith('AIza')) provider = 'gemini';
        else if (apiKey.startsWith('sk-ant')) provider = 'anthropic';
        else if (apiKey.startsWith('sk-')) provider = 'openai';
        else provider = 'custom-api';

        if (provider === 'gemini') {
          const ai = new GoogleGenAI({ apiKey });
          await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: 'Say ok'
          });
        } else if (provider === 'openai') {
          const r = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${apiKey}` } });
          if (!r.ok) throw new Error('Invalid OpenAI Key');
        } else if (provider === 'anthropic') {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })
          });
          if (!r.ok) throw new Error('Invalid Anthropic Key');
        }
      } else if (cookies) {
        provider = 'cookies';
      }
      
      res.json({ status: 'ok', provider });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Invalid Credentials or quota exceeded' });
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
