"use client";

import { useState, useRef, useEffect } from "react";
import { Eye, Wind, Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { textToMorse, morseToPattern } from "@/lib/morse";

export default function Home() {
  const [appState, setAppState] = useState<"setup" | "ready">("setup");
  const [operatingMode, setOperatingMode] = useState<"vision" | "audio">("vision");
  const [isRecording, setIsRecording] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailLevel, setDetailLevel] = useState("low"); // Default to low for speed
  const [isDevMode, setIsDevMode] = useState(false);
  
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [selectedMic, setSelectedMic] = useState<string>("");
  
  const [morseSpeed, setMorseSpeed] = useState(75);
  const [autoLaunchTimer, setAutoLaunchTimer] = useState<number | null>(5);
  const [isPlayingMorse, setIsPlayingMorse] = useState(false);
  // Ref to track morse state synchronously inside intervals/closures
  const isPlayingMorseRef = useRef(false);
  const flashOverlayRef = useRef<HTMLDivElement>(null);
  const [isVideoReady, setIsVideoReady] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRequestInFlight = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-launch timer logic
  useEffect(() => {
    if (appState === "setup" && autoLaunchTimer !== null) {
      if (autoLaunchTimer > 0) {
        const timer = setTimeout(() => setAutoLaunchTimer(prev => (prev !== null ? prev - 1 : null)), 1000);
        return () => clearTimeout(timer);
      } else {
        setAppState("ready");
      }
    }
  }, [appState, autoLaunchTimer]);

  // Initial Device Enumeration
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request permissions first to get labels
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === "videoinput");
        const audioDevices = devices.filter(d => d.kind === "audioinput");
        
        setCameras(videoDevices);
        setMicrophones(audioDevices);

        // Default Camera Logic: Prefer "iPhone" (Continuity Camera), else first available
        const iphoneCamera = videoDevices.find(d => d.label.toLowerCase().includes("iphone"));
        if (iphoneCamera) {
          setSelectedCamera(iphoneCamera.deviceId);
        } else if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }

        // Default Mic Logic: Prefer "iPhone", else first available
        const iphoneMic = audioDevices.find(d => d.label.toLowerCase().includes("iphone"));
        if (iphoneMic) {
          setSelectedMic(iphoneMic.deviceId);
        } else if (audioDevices.length > 0) {
          setSelectedMic(audioDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Error listing devices:", err);
      }
    };
    getDevices();
  }, []);

  // Morse Speed Control via Scroll
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      setMorseSpeed(prev => {
        const delta = e.deltaY > 0 ? 10 : -10;
        const newSpeed = Math.max(50, Math.min(prev + delta, 500));
        return newSpeed;
      });
    };
    window.addEventListener("wheel", handleWheel);
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  const triggerSelectionFlash = () => {
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 50);
  };

  const resetApp = () => {
    stopCameraStream();
    if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
    }
    setDetailLevel("low");
    setIsRecording(false);
    setIsProcessing(false);
    setAppState("setup");
    triggerSelectionFlash();
  };

  const cycleDetailLevel = (direction: "up" | "down") => {
    // Only allow detail cycling in Vision Mode
    if (operatingMode !== "vision") return;

    const levels = ["low", "medium", "high"];
    let currentIndex = levels.indexOf(detailLevel);
    if (direction === "up") {
      currentIndex = (currentIndex + 1) % levels.length;
    } else {
      currentIndex = (currentIndex - 1 + levels.length) % levels.length;
    }
    setDetailLevel(levels[currentIndex]);
    triggerSelectionFlash();
  };

  const toggleOperatingMode = () => {
    const newMode = operatingMode === "vision" ? "audio" : "vision";
    
    // If we were recording audio, stop it cleanly
    if (operatingMode === "audio" && isRecording) {
        // Just stop, don't process if switching modes unexpectedly? 
        // Or maybe process? Let's just stop and reset.
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
        }
        setIsRecording(false);
    }
    
    setOperatingMode(newMode);
    triggerSelectionFlash();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (appState !== "ready") return; // Ignore keys in setup

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case "ArrowUp":
          cycleDetailLevel("up");
          break;
        case "ArrowDown":
          cycleDetailLevel("down");
          break;
        case "ArrowLeft":
        case "ArrowRight":
          toggleOperatingMode();
          break;
        case " ": // Space
          handleSpaceAction();
          break;
        case "Shift":
          resetApp();
          break;
        case "d":
        case "D":
          setIsDevMode(!isDevMode);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailLevel, isDevMode, isRecording, isProcessing, appState, operatingMode, isVideoReady]); // Added isVideoReady dependency

  const triggerFlashPattern = async (content: string) => {
    console.log(`[Flash] Starting pattern for: "${content}"`);
    setIsPlayingMorse(true);
    isPlayingMorseRef.current = true;
    
    try {
      const morse = textToMorse(content);
      console.log(`[Flash] Morse sequence: ${morse}`);
      const pattern = morseToPattern(morse);
      console.log(`[Flash] Pattern length: ${pattern.length} bits`);
      
      // Force initial black screen before flashing starts
      // We use document.body for absolute full-screen control
      const originalBodyBg = document.body.style.backgroundColor;
      const originalBodyImage = document.body.style.backgroundImage;
      
      document.body.style.backgroundColor = "black";
      document.body.style.backgroundImage = "none"; // Remove texture for pure contrast
      
      // Hide the main app UI explicitly
      const mainApp = document.querySelector("main");
      if (mainApp) mainApp.style.opacity = "0";

      await new Promise(r => setTimeout(r, 200));

      for (const bit of pattern) {
        if (bit === 1) {
          // DIRECT DOM UPDATE: BODY WHITE
          document.body.style.backgroundColor = "white";
          
          await new Promise((resolve) => setTimeout(resolve, morseSpeed));
          
          // DIRECT DOM UPDATE: BODY BLACK
          document.body.style.backgroundColor = "black";
        } else {
          // Off (Black)
          document.body.style.backgroundColor = "black";
          await new Promise((resolve) => setTimeout(resolve, morseSpeed));
        }
        // Gap between bits
        await new Promise((resolve) => setTimeout(resolve, morseSpeed)); 
      }

      // Restore
      if (mainApp) mainApp.style.opacity = "1";
      document.body.style.backgroundColor = originalBodyBg;
      document.body.style.backgroundImage = originalBodyImage;

    } catch (error) {
      console.error("[Flash] Error generating pattern:", error);
    } finally {
      console.log("[Flash] Pattern complete");
      setIsPlayingMorse(false);
      isPlayingMorseRef.current = false;
    }
  };

  const captureFrame = (): string | null => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      if (video.readyState !== 4 || video.videoWidth === 0 || video.videoHeight === 0) {
        return null;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
        if (dataUrl === "data:,") return null; // Empty image check
        return dataUrl;
      }
    }
    return null;
  };

  const processFrame = async (manualAudioBlob?: Blob | null, manualPhotoDataUrl?: string | null) => {
    // If playing Morse, strictly pause capture to allow "Blackout" to persist without interruption
    if (isPlayingMorseRef.current) {
      return;
    }

    if (isRequestInFlight.current) {
      console.log("Skipping frame: Request already in flight");
      return;
    }
    
    // In Audio mode, we don't need images. In Vision mode, we need images.
    // However, the backend is capable of handling both.
    // We should optimize to only capture what's needed.
    
    let photoDataUrl: string | null = manualPhotoDataUrl || null;
    if (operatingMode === "vision" && !photoDataUrl) {
      if (!isVideoReady) {
        console.log("Skipping frame: Video not ready");
        return;
      }
      console.log("Capturing frame for Vision analysis...");
      photoDataUrl = captureFrame();
      if (!photoDataUrl) {
        console.log("Frame capture failed or empty");
        return; 
      }
    }

    // Grab audio chunks
    // If manualAudioBlob is provided (from Stop), use it. 
    // Otherwise, if in Vision mode (or continuous audio - deprecated), check chunks.
    let audioBlob: Blob | null = manualAudioBlob || null;

    if (!audioBlob && audioChunksRef.current.length > 0) {
       // Only process chunks automatically in Vision mode (if we were mixing) or if logic changes.
       // But for "Wait until stop", we normally won't use this block for Audio Mode anymore.
       // However, we'll keep it for robustness if we ever go back to streaming.
       if (operatingMode !== "audio") { 
          audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          audioChunksRef.current = [];
       }
    }

    // In Audio mode, if no audio, skip
    if (operatingMode === "audio" && !audioBlob) {
      // console.log("No audio data available for Audio analysis");
      return;
    }

    if (operatingMode === "audio") {
        console.log(`Processing audio chunk size: ${audioBlob?.size} bytes`);
    }

    isRequestInFlight.current = true;
    setIsProcessing(true);

    try {
      console.log(`Sending request to Azure OpenAI (${operatingMode} mode)...`);
      const formData = new FormData();
      if (photoDataUrl) {
        formData.append("image", photoDataUrl);
        formData.append("detailLevel", detailLevel);
      }
      if (audioBlob) {
        formData.append("audio", audioBlob, "audio.webm");
      }

      const startTime = Date.now();
      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      console.log(`Response received in ${Date.now() - startTime}ms:`, data);

      if (data.success) {
        // Construct flash text based on mode
        let textToFlash = "";
        if (operatingMode === "vision") {
            // In vision mode, we prioritize image description
            textToFlash = data.imageDescription || "";
        } else {
            // In audio mode, we prioritize audio text
            textToFlash = data.audioText || "";
        }
        
        if (textToFlash) {
          console.log(`Triggering flash pattern for: "${textToFlash.slice(0, 20)}..."`);
          await triggerFlashPattern(textToFlash);
        } else {
          console.log("No text content returned to flash.");
        }
      } else {
          console.error("API Error:", data.error);
      }
    } catch (err) {
      console.error("Processing error:", err);
    } finally {
      isRequestInFlight.current = false;
      setIsProcessing(false);
      console.log("Processing cycle complete.");
    }
  };

  // Auto-start Camera in Vision Mode
  useEffect(() => {
    if (appState === "ready" && operatingMode === "vision") {
      startCameraStream();
    } else {
      stopCameraStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, operatingMode, selectedCamera]);

  const startCameraStream = async () => {
    console.log("Starting camera stream...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
        audio: false,
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Play to ensure it starts (sometimes needed)
        videoRef.current.play().catch(e => console.error("Video play error:", e));
      }
      setIsVideoReady(true);
    } catch (err) {
      console.error("Error starting camera:", err);
      setIsVideoReady(false);
    }
  };

  const stopCameraStream = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsVideoReady(false);
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        video: false,
      });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log("Audio recording started.");
    } catch (err) {
      console.error("Error starting audio recording:", err);
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      const recorder = mediaRecorderRef.current;
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];
        console.log(`[Audio] Recording stopped. Blob size: ${audioBlob.size}. Processing...`);
        processFrame(audioBlob);
        
        // Stop all audio tracks
        recorder.stream.getTracks().forEach(track => track.stop());
      };
      recorder.stop();
      setIsRecording(false);
      mediaRecorderRef.current = null;
    }
  };

  const handleSpaceAction = () => {
    if (operatingMode === "vision") {
      // Vision Mode: Snapshot
      if (isVideoReady && !isRequestInFlight.current) {
        triggerSelectionFlash(); // Visual feedback
        const photoData = captureFrame();
         if (photoData) {
           processFrame(null, photoData);
         }
      }
    } else {
      // Audio Mode: Toggle Recording
      if (isRecording) {
        stopAudioRecording();
      } else {
        startAudioRecording();
      }
    }
  };


  const triggerFlash = () => {
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 500); // Flash for 500ms
  };

  if (appState === "setup") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-transparent text-ink-primary font-crimson">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-6xl font-bold tracking-widest mb-2 font-cinzel text-ink-primary drop-shadow-md">eyeAI</h1>
            <div className="divider-flourish text-gold text-2xl">❖</div>
            <p className="text-ink-secondary italic font-serif text-xl">The Oracle's Eye</p>
          </div>

          <div className="space-y-6 fantasy-box p-8">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-widest text-ink-secondary flex items-center gap-2 font-cinzel">
                <Eye size={16} className="text-gold" /> Crystal Source
              </label>
              <div className="relative">
                <select 
                  value={selectedCamera}
                  onChange={(e) => {
                    setSelectedCamera(e.target.value);
                    setAutoLaunchTimer(null); // Cancel auto-launch on interaction
                  }}
                  className="w-full bg-[#f5eee0] border-2 border-[var(--ink-secondary)] rounded-sm p-3 text-sm focus:ring-2 focus:ring-[var(--gold-accent)] outline-none appearance-none shadow-inner font-serif text-ink-primary"
                >
                  {cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Crystal ${camera.deviceId.slice(0, 5)}...`}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-secondary">▼</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-widest text-ink-secondary flex items-center gap-2 font-cinzel">
                <Wind size={16} className="text-gold" /> Echo Source
              </label>
              <div className="relative">
                <select 
                  value={selectedMic}
                  onChange={(e) => {
                    setSelectedMic(e.target.value);
                    setAutoLaunchTimer(null); // Cancel auto-launch on interaction
                  }}
                  className="w-full bg-[#f5eee0] border-2 border-[var(--ink-secondary)] rounded-sm p-3 text-sm focus:ring-2 focus:ring-[var(--gold-accent)] outline-none appearance-none shadow-inner font-serif text-ink-primary"
                >
                  {microphones.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || `Echo ${mic.deviceId.slice(0, 5)}...`}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-secondary">▼</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setAppState("ready")}
              className="w-full rune-button py-4 text-xl tracking-widest flex items-center justify-center gap-2"
            >
              Enter The Realm {autoLaunchTimer !== null && `(${autoLaunchTimer}s)`}
            </button>
            {autoLaunchTimer !== null && (
              <p className="text-center text-sm text-[#5d4037] animate-pulse italic">
                The prophecy fulfills in {autoLaunchTimer}...
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 bg-transparent text-ink-primary overflow-hidden font-crimson">
      
      {/* HEADER: Status & Mode */}
      <header className="w-full flex justify-between items-start z-10">
         <div className="flex flex-col">
            <h1 className="text-4xl font-bold tracking-widest font-cinzel text-gold drop-shadow-md">eyeAI</h1>
            <span className="text-xs uppercase tracking-[0.3em] text-ink-secondary font-bold">The Oracle's Eye</span>
         </div>
         
         <div className="flex flex-col items-end gap-2">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-sm border border-[var(--ink-secondary)] ${isRecording ? 'bg-[#3e2723] text-gold-light animate-pulse' : 'bg-[var(--parchment-dark)] text-ink-secondary'}`}>
               <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500' : 'bg-gray-400'}`} />
               <span className="text-xs font-bold font-cinzel tracking-widest">
                  {isRecording ? "COMMUNING..." : "IDLE"}
               </span>
            </div>

            {/* Processing Indicator */}
            {(isProcessing || isRequestInFlight.current) && (
               <div className="flex items-center gap-2 text-gold-light animate-pulse">
                  <Sparkles size={14} />
                  <span className="text-xs font-cinzel tracking-widest">DIVINING...</span>
               </div>
            )}
         </div>
      </header>

      {/* MAIN: Video Feed (Pushed Up) */}
      <section className="relative flex flex-col items-center justify-center w-full flex-1 min-h-0 py-4">
         <div className={`relative scrying-glass transition-all duration-300 ${operatingMode === 'vision' ? 'w-64 h-64 rounded-full overflow-hidden border-4' : 'w-64 h-32 flex items-center justify-center'}`}>
            
            {/* Vision Mode: Video Element */}
            {operatingMode === 'vision' && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onCanPlay={() => setIsVideoReady(true)}
                className="w-full h-full object-cover opacity-80 sepia-[.3] contrast-125 brightness-90 grayscale-[0.2]"
              />
            )}

            {/* Audio Mode: Waveform Placeholder */}
            {operatingMode === 'audio' && (
               <div className="flex flex-col items-center gap-2">
                  <div className="flex items-end gap-1 h-8">
                     {[...Array(5)].map((_, i) => (
                        <div key={i} className={`w-2 bg-gold-light ${isRecording ? 'animate-pulse' : 'h-1'}`} style={{ height: isRecording ? `${Math.random() * 100}%` : '4px' }} />
                     ))}
                  </div>
                  <span className="text-xs text-gold-light font-cinzel tracking-widest">LISTENING TO THE WINDS</span>
               </div>
            )}

            {/* HUD Overlay */}
            <div className="absolute inset-0 border-[2px] border-gold-light/40 pointer-events-none flex flex-col justify-between p-3 m-1 rounded-full">
               <div className="flex justify-center mt-4 text-[10px] text-gold-light font-cinzel">
                  <span>{operatingMode === 'vision' ? '● SCRYING' : '● HEARING'}</span>
               </div>
            </div>
         </div>
      </section>

      {/* FOOTER: Controls */}
      <footer className="flex flex-col items-center justify-end pb-8 gap-4 z-10 w-full max-w-sm">
         {/* Dynamic Instructions */}
         <div className="w-full fantasy-box px-4 py-3">
           <p className="text-lg font-cinzel font-bold text-ink-primary text-center">
             {operatingMode === 'vision' 
               ? "PRESS SPACE TO DIVINE"
               : isRecording 
                  ? "PRESS SPACE TO CEASE" 
                  : "PRESS SPACE TO COMMUNE"
             }
           </p>
           
           <div className="divider-flourish text-xs my-1">❖</div>
           
           <div className="text-[10px] text-ink-secondary flex justify-between px-2 font-serif italic font-bold">
             <span>←/→ SHIFT REALMS</span>
             {operatingMode === 'vision' && (
               <span>↑/↓ ADJUST CLARITY</span>
             )}
           </div>
         </div>
      </footer>
      {/* Hidden Canvas for Capture */}
      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}
