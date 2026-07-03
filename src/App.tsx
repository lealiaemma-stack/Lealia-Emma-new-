import React, { useState, useEffect } from 'react';
import { Button } from './components/ui/button';
import { Textarea } from './components/ui/textarea';
import { Input } from './components/ui/input';
import { Video, FileText, Youtube, Loader2, Download, Search, Film, Settings, CheckCircle2, XCircle, Bell, ChevronDown } from 'lucide-react';
import JSZip from 'jszip';
import fileSaverPkg from 'file-saver';
const { saveAs } = fileSaverPkg;
import { SceneAsset, VideoIdea, GeneratedScene } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

type Mode = 'script' | 'youtube';

export default function App() {
  const [mode, setMode] = useState<Mode>('script');
  
  // Script Breakdown State
  const [scriptInput, setScriptInput] = useState('');
  const [isAnalyzingScript, setIsAnalyzingScript] = useState(false);
  const [scriptAssets, setScriptAssets] = useState<SceneAsset[] | null>(null);

  // YouTube Breakdown State
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isAnalyzingYoutube, setIsAnalyzingYoutube] = useState(false);
  const [videoIdeas, setVideoIdeas] = useState<VideoIdea[] | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<VideoIdea | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<any>(null);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [pexelsKeyInput, setPexelsKeyInput] = useState('');
  const [savedPexelsKey, setSavedPexelsKey] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [apiProvider, setApiProvider] = useState('');
  const [apiProviderSelect, setApiProviderSelect] = useState('automatic');
  const [cookieInput, setCookieInput] = useState('');
  const [savedCookies, setSavedCookies] = useState('');
  const [logLanguage, setLogLanguage] = useState<'en'|'ur'>('ur');

  // Notifications State
  const [logs, setLogs] = useState<{id: string, time: Date, message: string, details?: string, type: 'error'|'success'|'info', urduAdvice?: string}[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem('UNIVERSAL_API_KEY') || localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) setSavedApiKey(savedKey);
    const savedPexels = localStorage.getItem('PEXELS_API_KEY');
    if (savedPexels) setSavedPexelsKey(savedPexels);
    const savedCk = localStorage.getItem('UNIVERSAL_COOKIES');
    if (savedCk) setSavedCookies(savedCk);
    const savedLang = localStorage.getItem('LOG_LANGUAGE');
    if (savedLang === 'en' || savedLang === 'ur') setLogLanguage(savedLang);
  }, []);

  const getRomanUrduAdvice = (msg: string) => {
    const m = msg.toLowerCase();
    if (m.includes('quota') || m.includes('rate limit') || m.includes('429')) {
      return "Masla: Apki API ki limit khatam ho gai hai ya free tier use kar rahay hain.\nHal: Apko yeh karna hoga ke Settings mein ja kar ek valid paid API key dalein, ya kuch der intezar karein.";
    }
    if (m.includes('invalid') || m.includes('missing') || m.includes('not found')) {
      return "Masla: API key theek nahi hai ya provide nahi ki gai.\nHal: Apko yeh karna hoga ke Settings mein ja kar sahi API key lagayein (AIza..., sk-..., ya sk-ant-...).";
    }
    if (m.includes('fetch') || m.includes('network')) {
      return "Masla: Internet ka masla hai ya API server down hai.\nHal: Apko yeh karna hoga ke apna internet connection check karein.";
    }
    return "Masla: System mein koi naya error aagya hai.\nHal: Apko yeh karna hoga ke details check karein ya page refresh kar ke dobara try karein.";
  };

  const addLog = (type: 'error'|'success'|'info', message: string, details?: string) => {
    let urduAdvice = undefined;
    if (logLanguage === 'ur' && type === 'error') {
      urduAdvice = getRomanUrduAdvice(message + " " + (details || ""));
    }
    setLogs(prev => [{ id: Date.now().toString() + Math.random(), time: new Date(), message, details, type, urduAdvice }, ...prev]);
    if (type === 'error') setShowLogs(true);
  };

  const getHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const savedKey = localStorage.getItem('UNIVERSAL_API_KEY') || localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) headers['X-Api-Key'] = savedKey;
    const savedCk = localStorage.getItem('UNIVERSAL_COOKIES');
    if (savedCk) headers['X-Cookies'] = savedCk;
    return headers;
  };

  const fetchJsonSafely = async (url: string, options: RequestInit) => {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");
    
    // Server is restarting or intercepted
    if (!contentType || contentType.indexOf("application/json") === -1) {
      const text = await response.text();
      if (text.includes("<!doctype") || text.includes("<html")) {
        throw new Error("The backend server is starting up or temporarily busy. Please wait 10 seconds and try again.");
      }
      throw new Error(`Unexpected server response format: ${text.substring(0, 100)}`);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server Error: ${response.status}`);
    }

    return await response.json();
  };

  const checkApiKey = async () => {
    if (!apiKeyInput.trim() && !cookieInput.trim()) return;
    setApiKeyStatus('checking');
    try {
      const data = await fetchJsonSafely('/api/check-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim(), cookies: cookieInput.trim() })
      });
      
      setApiKeyStatus('valid');
      setApiProvider(data.provider);
      
      if (apiKeyInput.trim()) {
        localStorage.setItem('UNIVERSAL_API_KEY', apiKeyInput.trim());
        setSavedApiKey(apiKeyInput.trim());
        setApiKeyInput(''); // clear input after save
      }
      if (cookieInput.trim()) {
        localStorage.setItem('UNIVERSAL_COOKIES', cookieInput.trim());
        setSavedCookies(cookieInput.trim());
        setCookieInput('');
      }
      addLog('success', `${data.provider} API connected successfully.`);
    } catch (e: any) {
      setApiKeyStatus('invalid');
      addLog('error', 'API Validation Failed', e.message);
    }
  };

  const analyzeScript = async () => {
    if (!scriptInput.trim()) return;
    setIsAnalyzingScript(true);
    try {
      const data = await fetchJsonSafely('/api/analyze-script', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ script: scriptInput, pexelsApiKey: savedPexelsKey })
      });
      setScriptAssets(data);
    } catch (error: any) {
      console.error(error);
      addLog('error', 'Error analyzing script', error.message);
    } finally {
      setIsAnalyzingScript(false);
    }
  };

  const analyzeYoutube = async () => {
    if (!youtubeUrl.trim()) return;
    setIsAnalyzingYoutube(true);
    setVideoIdeas(null);
    setGeneratedScript(null);
    setSelectedIdea(null);
    try {
      const data = await fetchJsonSafely('/api/breakdown-video', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ url: youtubeUrl })
      });
      setVideoIdeas(data);
    } catch (error: any) {
      console.error(error);
      addLog('error', 'Error analyzing YouTube video', error.message);
    } finally {
      setIsAnalyzingYoutube(false);
    }
  };

  const generateFromIdea = async (idea: VideoIdea) => {
    setSelectedIdea(idea);
    setIsGeneratingScript(true);
    setGeneratedScript(null);
    try {
      const data = await fetchJsonSafely('/api/generate-script', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ 
          title: idea.title, 
          description: idea.description,
          length: idea.estimated_length_minutes,
          pexelsApiKey: savedPexelsKey
        })
      });
      setGeneratedScript(data);
    } catch (error: any) {
      console.error(error);
      addLog('error', 'Error generating script', error.message);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const exportZip = async (items: any[]) => {
    addLog('info', 'Starting Bulk Download. Generating files...', 'This may take a minute.');
    const zip = new JSZip();
    
    // Create a structured folder
    const assetsFolder = zip.folder("Video_Assets");
    if (!assetsFolder) return;

    let voiceoverCombined = "";
    let currentTime = 0;

    const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const voiceoverText = item.text || item.voiceover || '';
      
      if (voiceoverText.trim()) {
        voiceoverCombined += voiceoverText + "\n\n";
      }

      // Estimate duration: 2.5 words per second
      const wordCount = voiceoverText.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
      let duration = Math.ceil(wordCount / 2.5);
      if (duration === 0) duration = 5; // Default 5 seconds if no text
      
      const startTime = currentTime;
      const endTime = currentTime + duration;
      
      const startTimeStr = formatTime(startTime);
      const endTimeStr = formatTime(endTime);
      
      // Filename format: {sceneNumber}_{startTime}-{endTime}
      // e.g., 1_0-00-0-10 (Windows filesystem doesn't like colons in filenames)
      const filenameBase = `${i + 1}_${startTimeStr.replace(':', '-')}-${endTimeStr.replace(':', '-')}`;

      const visualPrompt = item.visual_prompt || item.visual_asset;

      if (item.video_url) {
        addLog('info', `Downloading video for scene ${i + 1}...`);
        try {
          const response = await fetch('/api/proxy-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: item.video_url })
          });
          if (response.ok) {
            const blob = await response.blob();
            assetsFolder.file(`${filenameBase}.mp4`, blob);
          }
        } catch (e) {
          console.error("Failed to download video", e);
        }
      } else {
        if (visualPrompt) {
          try {
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(visualPrompt)}?width=1280&height=720&nologo=true`;
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            assetsFolder.file(`${filenameBase}.jpg`, blob);
          } catch (e) {
            console.error("Failed to download image", e);
          }
        }
      }

      currentTime = endTime;
    }

    zip.file("voiceover.txt", voiceoverCombined.trim());

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "AI_Video_Project.zip");
    addLog('success', 'Bulk Download Complete!');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-sky-500/30">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center font-bold text-slate-900">SA</div>
            <span className="text-xl font-semibold tracking-tight text-white">ScriptAsset <span className="text-sky-400">AI</span></span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex bg-slate-800 rounded-full p-1">
              <button
                onClick={() => setMode('script')}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                  mode === 'script' ? "bg-sky-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
                )}
              >
                Script to Assets
              </button>
              <button
                onClick={() => setMode('youtube')}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                  mode === 'youtube' ? "bg-sky-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
                )}
              >
                YouTube Breakdown
              </button>
            </div>
            <button 
              onClick={() => setShowSettings(true)} 
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {mode === 'script' ? (
            <motion.div
              key="script-mode"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-slate-800 text-sky-400 rounded-lg border border-slate-700">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-medium text-white">Paste Your Script</h2>
                </div>
                <p className="text-slate-400 text-sm mb-4">
                  We'll analyze your script, understand the context (like "New York"), and break it down sentence-by-sentence to find the perfect stock footage.
                </p>
                <Textarea
                  value={scriptInput}
                  onChange={(e) => setScriptInput(e.target.value)}
                  placeholder="Paste your documentary or video script here..."
                  className="min-h-[200px] mb-4 text-base resize-y"
                />
                <div className="flex justify-end">
                  <Button 
                    onClick={analyzeScript} 
                    disabled={isAnalyzingScript || !scriptInput.trim()}
                    className="gap-2"
                  >
                    {isAnalyzingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Analyze & Find Assets
                  </Button>
                </div>
              </div>

              {scriptAssets && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-lg flex items-center gap-2 text-white">
                      <Video className="w-5 h-5 text-sky-500" />
                      Found Footage & Stock Media
                    </h3>
                    <Button variant="outline" onClick={() => exportZip(scriptAssets)} className="gap-2 text-sky-400 hover:text-sky-300">
                      <Download className="w-4 h-4" />
                      Export Project ZIP
                    </Button>
                  </div>

                  <div className="bg-sky-950/30 border border-sky-500/20 rounded-lg p-3 text-sm text-sky-200/80 mb-2">
                    <strong>Note:</strong> We have generated free AI images for each scene! Click "Export Project ZIP" to bulk download all generated images. For stock videos, use the provided Pexels or Google Video search links.
                  </div>
                  
                  <div className="grid gap-4">
                    {scriptAssets.map((asset) => (
                      <div key={asset.id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col sm:flex-row gap-6">
                        <div className="sm:w-16 flex flex-col items-center justify-center bg-slate-950 rounded-lg p-2 border border-slate-800 shrink-0">
                          <span className="text-xs text-sky-500/70 font-medium uppercase tracking-wider">Scene</span>
                          <span className="text-2xl font-bold text-sky-400">{asset.id}</span>
                        </div>
                        <div className="flex-1 space-y-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Voiceover</span>
                            <p className="text-slate-300 text-lg">"{asset.text}"</p>
                          </div>
                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1 block">Visual Direction</span>
                            <p className="text-slate-400 text-sm mb-3">{asset.visual_prompt}</p>
                            {asset.video_url ? (
                              <div>
                                <video 
                                  src={`/api/proxy-video?url=${encodeURIComponent(asset.video_url)}`} 
                                  controls 
                                  autoPlay 
                                  loop 
                                  muted 
                                  className="w-full h-auto rounded-lg border border-slate-700 object-cover aspect-video"
                                />
                                {asset.pexels_author && (
                                  <div className="text-[10px] text-slate-500 mt-2">
                                    This <a href={asset.pexels_original_url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Video</a> was taken by <a href={asset.pexels_author_url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">{asset.pexels_author}</a> on Pexels.
                                  </div>
                                )}
                              </div>
                            ) : (
                              <img 
                                src={`https://image.pollinations.ai/prompt/${encodeURIComponent(asset.visual_prompt || asset.search_query)}?width=800&height=450&nologo=true`} 
                                alt={`Scene ${asset.id}`}
                                className="w-full h-auto rounded-lg border border-slate-700 object-cover aspect-video"
                                crossOrigin="anonymous"
                              />
                            )}
                          </div>
                        </div>
                        <div className="sm:w-64 bg-slate-950 rounded-lg p-4 border border-slate-800 shrink-0 flex flex-col justify-center gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Stock Search Query</span>
                            <div className="bg-slate-900 border border-slate-700 px-3 py-2 rounded flex items-center justify-between">
                              <code className="text-sm font-mono text-sky-400">{asset.search_query}</code>
                              <button 
                                onClick={() => navigator.clipboard.writeText(asset.search_query)}
                                className="text-slate-500 hover:text-sky-400 transition-colors"
                                title="Copy search query"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <a href={asset.pexels_url} target="_blank" rel="noreferrer" className="flex-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-colors">
                              Pexels
                            </a>
                            <a href={asset.google_video_search_url} target="_blank" rel="noreferrer" className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-colors">
                              Google Vid
                            </a>
                          </div>
                          
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Context: <span className="text-slate-400 capitalize">{asset.context}</span></p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="youtube-mode"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-slate-800 text-sky-400 rounded-lg border border-slate-700">
                    <Youtube className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-medium text-white">Breakdown Reference Video</h2>
                </div>
                <p className="text-slate-400 text-sm mb-4">
                  Enter a YouTube link. We'll analyze its style and length, generate 4 similar documentary ideas, and then write a full script with asset breakdowns for the one you choose.
                </p>
                <div className="flex gap-3 mb-2">
                  <Input
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="flex-1"
                  />
                  <Button 
                    onClick={analyzeYoutube}
                    disabled={isAnalyzingYoutube || !youtubeUrl.trim()}
                    className="gap-2 shrink-0"
                  >
                    {isAnalyzingYoutube ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Analyze Style
                  </Button>
                </div>
              </div>

              {videoIdeas && !selectedIdea && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <h3 className="font-medium text-lg text-white">Select a Video Concept</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {videoIdeas.map((idea, idx) => (
                      <div 
                        key={idx} 
                        className="bg-slate-900 border border-slate-800 p-5 rounded-xl hover:border-sky-500/50 hover:shadow-[0_0_15px_rgba(14,165,233,0.1)] transition-all cursor-pointer flex flex-col h-full group"
                        onClick={() => generateFromIdea(idea)}
                      >
                        <h4 className="font-bold text-white mb-2 group-hover:text-sky-400 transition-colors">{idea.title}</h4>
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700 mb-3">
                          <span className="text-[10px] text-sky-400 font-bold uppercase block mb-1">Hook</span>
                          <p className="text-xs text-slate-300">"{idea.hook}"</p>
                        </div>
                        <p className="text-sm text-slate-400 mb-4 flex-1">{idea.description}</p>
                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800">
                          <span className="text-xs font-bold bg-slate-950 text-slate-400 px-3 py-1.5 rounded-lg border border-slate-800">
                            ~{idea.estimated_length_minutes} mins
                          </span>
                          <span className="text-sm font-bold text-sky-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                            Generate Script <Film className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {isGeneratingScript && (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-sky-500" />
                  <p className="font-bold text-white">Writing full script & generating asset lists...</p>
                  <p className="text-sm mt-2">This may take a minute depending on the estimated video length.</p>
                </div>
              )}

              {generatedScript && selectedIdea && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  <div className="bg-sky-500/10 border border-sky-500/20 text-white p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <span className="text-sky-400 text-[10px] font-bold uppercase tracking-wider mb-1 block">Generated Project Roadmap</span>
                      <h3 className="text-xl font-bold">{selectedIdea.title}</h3>
                    </div>
                    <Button onClick={() => exportZip(generatedScript?.roadmap || [])} className="bg-sky-500 text-slate-950 hover:bg-sky-400 gap-2 shrink-0">
                      <Download className="w-4 h-4" />
                      Export Script & Asset Zip
                    </Button>
                  </div>

                  <div className="bg-sky-950/30 border border-sky-500/20 rounded-lg p-3 text-sm text-sky-200/80 mb-6">
                    <strong>Note:</strong> We have generated free AI images for each scene! Click "Export Script & Asset Zip" to bulk download all generated images. For stock videos, use the provided Pexels or Google Video search links.
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-sm">
                    <h4 className="text-sky-400 font-bold mb-4 flex items-center gap-2">
                      <Film className="w-5 h-5" /> Video Hook Section
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Hook Voiceover</span>
                        <p className="text-slate-200 text-lg italic">"{generatedScript.hook_section.hook_text}"</p>
                      </div>
                      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1 block">Reaction / Visual Footage</span>
                        <p className="text-slate-300 text-sm">{generatedScript.hook_section.reaction_footage}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid gap-4">
                    {generatedScript.roadmap?.map((scene: any) => (
                      <div key={scene.id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col sm:flex-row gap-6">
                        <div className="sm:w-20 flex flex-col items-center justify-center bg-slate-950 rounded-lg p-2 border border-slate-800 shrink-0">
                          <span className="text-xs text-sky-500/70 font-medium uppercase tracking-wider mb-1">Scene</span>
                          <span className="text-2xl font-bold text-sky-400 leading-none">{scene.id}</span>
                          <span className="text-[10px] font-mono text-slate-500 mt-2 bg-slate-900 px-1.5 py-0.5 rounded">{scene.timestamp}</span>
                        </div>
                        <div className="flex-1 space-y-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Voiceover</span>
                            <p className="text-slate-300 text-lg">"{scene.voiceover}"</p>
                          </div>
                          {scene.text_on_screen && scene.text_on_screen !== "None" && scene.text_on_screen !== "" && (
                            <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded">
                              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1 block">Text on Screen</span>
                              <p className="text-amber-200 text-sm font-bold">{scene.text_on_screen}</p>
                            </div>
                          )}
                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1 block">Required Visual</span>
                            <p className="text-slate-400 text-sm mb-3">{scene.visual_asset}</p>
                            {scene.video_url ? (
                              <div>
                                <video 
                                  src={`/api/proxy-video?url=${encodeURIComponent(scene.video_url)}`} 
                                  controls 
                                  autoPlay 
                                  loop 
                                  muted 
                                  className="w-full h-auto rounded-lg border border-slate-700 object-cover aspect-video"
                                />
                                {scene.pexels_author && (
                                  <div className="text-[10px] text-slate-500 mt-2">
                                    This <a href={scene.pexels_original_url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Video</a> was taken by <a href={scene.pexels_author_url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">{scene.pexels_author}</a> on Pexels.
                                  </div>
                                )}
                              </div>
                            ) : (
                              <img 
                                src={`https://image.pollinations.ai/prompt/${encodeURIComponent(scene.visual_asset || scene.search_query)}?width=800&height=450&nologo=true`} 
                                alt={`Scene ${scene.id}`}
                                className="w-full h-auto rounded-lg border border-slate-700 object-cover aspect-video"
                                crossOrigin="anonymous"
                              />
                            )}
                          </div>
                        </div>
                        <div className="sm:w-64 bg-slate-950 rounded-lg p-4 border border-slate-800 shrink-0 flex flex-col justify-center gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Search Query</span>
                            <div className="bg-slate-900 border border-slate-700 px-3 py-2 rounded flex items-center justify-between">
                              <code className="text-sm font-mono text-sky-400">{scene.search_query}</code>
                              <button 
                                onClick={() => navigator.clipboard.writeText(scene.search_query)}
                                className="text-slate-500 hover:text-sky-400 transition-colors"
                                title="Copy search query"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <a href={scene.pexels_url} target="_blank" rel="noreferrer" className="flex-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-colors">
                              Pexels
                            </a>
                            <a href={scene.google_video_search_url} target="_blank" rel="noreferrer" className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-colors">
                              Google Vid
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

    {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden my-auto">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-sky-400" /> Settings
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Log Language Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Notification Language</label>
                <div className="flex gap-2">
                  <Button 
                    variant={logLanguage === 'en' ? 'default' : 'outline'} 
                    onClick={() => { setLogLanguage('en'); localStorage.setItem('LOG_LANGUAGE', 'en'); }}
                    className={cn("flex-1", logLanguage === 'en' ? "bg-sky-500 text-slate-950" : "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800")}
                  >
                    English
                  </Button>
                  <Button 
                    variant={logLanguage === 'ur' ? 'default' : 'outline'} 
                    onClick={() => { setLogLanguage('ur'); localStorage.setItem('LOG_LANGUAGE', 'ur'); }}
                    className={cn("flex-1", logLanguage === 'ur' ? "bg-sky-500 text-slate-950" : "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800")}
                  >
                    Roman Urdu
                  </Button>
                </div>
              </div>

              {/* API Configuration */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Advanced: Custom API Key (Optional)</label>
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs p-3 rounded-lg mb-4 leading-relaxed">
                  <strong>Open Source & Free:</strong> App is 100% free and works perfectly without an API key using public AI! <br/>
                  <em>(Roman Urdu: App 100% free chal rahi hai bina kisi API key ke! Lekin agar aapko limits badhani hain to apni API key yahan laga sakte hain.)</em>
                </div>
                <p className="text-xs text-slate-500 mb-4">Support for Gemini (AIza...), OpenAI (sk-...), and Anthropic Claude (sk-ant-...). Paste any key to use its provider.</p>
                
                {savedApiKey && (
                  <div className="mb-4 p-3 bg-slate-800 rounded-lg border border-slate-700 flex justify-between items-center">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Current Key</div>
                      <div className="font-mono text-sm text-sky-400">
                        {savedApiKey.substring(0, 5)}••••••••••••••••
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        localStorage.removeItem('UNIVERSAL_API_KEY');
                        localStorage.removeItem('GEMINI_API_KEY');
                        setSavedApiKey('');
                        setApiKeyStatus('idle');
                        addLog('info', 'API Key removed');
                      }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                    >
                      Remove
                    </Button>
                  </div>
                )}

                <div className="mb-3">
                  <div className="relative">
                    <select
                      value={apiProviderSelect}
                      onChange={(e) => {
                        setApiProviderSelect(e.target.value);
                        setApiKeyStatus('idle');
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-sm text-slate-300 focus:border-sky-500 outline-none appearance-none cursor-pointer"
                    >
                      <option value="automatic">Automatic Detection (Recommended)</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI (ChatGPT)</option>
                      <option value="anthropic">Anthropic Claude</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <Input 
                    type="password" 
                    value={apiKeyInput} 
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      setApiKeyStatus('idle');
                    }}
                    placeholder="Paste new API key here..."
                    className="bg-slate-950 border-slate-800 focus:border-sky-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Pexels API Key (For Stock Video Search & Download)</label>
                  <p className="text-xs text-slate-500 mb-4">Without this, you will get free AI-generated images. With this, the app will automatically fetch and download real stock videos for your scenes.</p>
                  
                  {savedPexelsKey && (
                    <div className="mb-4 p-3 bg-slate-800 rounded-lg border border-slate-700 flex justify-between items-center">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Current Pexels Key</div>
                        <div className="font-mono text-sm text-sky-400">
                          {savedPexelsKey.substring(0, 5)}••••••••••••••••
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          localStorage.removeItem('PEXELS_API_KEY');
                          setSavedPexelsKey('');
                          addLog('info', 'Pexels Key removed');
                        }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      >
                        Remove
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-2 mb-4">
                    <Input 
                      type="password" 
                      value={pexelsKeyInput} 
                      onChange={(e) => setPexelsKeyInput(e.target.value)}
                      placeholder="Paste Pexels API key here..."
                      className="bg-slate-950 border-slate-800 focus:border-sky-500"
                    />
                    <Button 
                      onClick={() => {
                        if(pexelsKeyInput.trim()) {
                          localStorage.setItem('PEXELS_API_KEY', pexelsKeyInput.trim());
                          setSavedPexelsKey(pexelsKeyInput.trim());
                          setPexelsKeyInput('');
                          addLog('success', 'Pexels API Key saved!');
                        }
                      }}
                      className="bg-slate-800 hover:bg-slate-700 text-white whitespace-nowrap shrink-0"
                    >
                      Save Pexels Key
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Browser Cookies (Alternative)</label>
                  <p className="text-xs text-slate-500 mb-4">If you prefer using your browser cookies instead of an API key, paste them here. This will be sent as a header.</p>
                  
                  {savedCookies && (
                    <div className="mb-4 p-3 bg-slate-800 rounded-lg border border-slate-700 flex justify-between items-center">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Current Cookies</div>
                        <div className="font-mono text-sm text-sky-400 truncate w-32">
                          {savedCookies.substring(0, 15)}...
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          localStorage.removeItem('UNIVERSAL_COOKIES');
                          setSavedCookies('');
                          setApiKeyStatus('idle');
                          addLog('info', 'Cookies removed');
                        }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      >
                        Remove
                      </Button>
                    </div>
                  )}

                  <Textarea 
                    value={cookieInput}
                    onChange={(e) => {
                      setCookieInput(e.target.value);
                      setApiKeyStatus('idle');
                    }}
                    placeholder="session_id=123; auth_token=abc..."
                    className="bg-slate-950 border-slate-800 focus:border-sky-500 text-xs font-mono mb-4 h-20"
                  />
                </div>

                <Button 
                  onClick={checkApiKey} 
                  disabled={apiKeyStatus === 'checking'}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white"
                >
                  {apiKeyStatus === 'checking' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (!apiKeyInput.trim() && !cookieInput.trim() ? 'Test Free Public AI' : 'Connect & Verify Credentials')}
                </Button>
                
                {apiKeyStatus === 'valid' && (
                  <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-emerald-400 text-sm font-medium capitalize">
                    <CheckCircle2 className="w-5 h-5 shrink-0" /> Credentials verified successfully! ({apiProvider || 'Cookie auth'})
                  </div>
                )}
                {apiKeyStatus === 'invalid' && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm font-medium">
                    <XCircle className="w-5 h-5 shrink-0" /> Invalid Credentials. Please check the logs.
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end">
              <Button onClick={() => setShowSettings(false)} className="bg-sky-500 hover:bg-sky-400 text-slate-950">Done</Button>
            </div>
          </div>
        </div>
      )}

      {/* Notification / Logs Panel */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
        {showLogs && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[400px] max-h-[400px] flex flex-col overflow-hidden mb-2 animate-in slide-in-from-bottom-5">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Bell className="w-4 h-4 text-sky-400" /> Notifications & Errors
              </h4>
              <button onClick={() => setShowLogs(false)} className="text-slate-400 hover:text-white">
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {logs.length === 0 ? (
                <div className="text-center text-slate-500 text-sm py-4">No notifications</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className={cn("p-3 rounded-lg border text-sm", 
                    log.type === 'error' ? "bg-red-500/10 border-red-500/20 text-red-200" :
                    log.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-200" :
                    "bg-sky-500/10 border-sky-500/20 text-sky-200"
                  )}>
                    <div className="font-semibold mb-1 flex justify-between">
                      <span>{log.message}</span>
                      <span className="text-[10px] opacity-60 font-normal">{log.time.toLocaleTimeString()}</span>
                    </div>
                    {log.details && (
                      <div className="text-xs opacity-80 mt-1 font-mono whitespace-pre-wrap overflow-x-auto">
                        {log.details}
                      </div>
                    )}
                    {log.urduAdvice && (
                      <div className="mt-2 pt-2 border-t border-red-500/20 text-xs font-medium text-red-300 leading-relaxed whitespace-pre-wrap">
                        {log.urduAdvice}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        <button 
          onClick={() => setShowLogs(!showLogs)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-colors border",
            logs.length > 0 && logs[0].type === 'error' ? "bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30" : 
            "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          )}
        >
          <Bell className="w-4 h-4" />
          <span className="text-sm font-medium">Logs {logs.length > 0 && `(${logs.length})`}</span>
        </button>
      </div>
    </div>
  );
}

// Utility class merger helper
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

