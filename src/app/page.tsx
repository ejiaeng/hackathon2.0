"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Mic, Settings, Play, Square, Zap, Smartphone, ChevronUp, ChevronDown } from "lucide-react";
import { textToMorse, morseToPattern } from "@/lib/morse";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailLevel, setDetailLevel] = useState("low"); // Default to low for speed
  const [isDevMode, setIsDevMode] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [morseSpeed, setMorseSpeed] = useState(150);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRequestInFlight = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Enumerate cameras
  useEffect(() => {
    const getCameras = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === "videoinput");
        setCameras(videoDevices);
        if (videoDevices.length > 0 && !selectedCamera) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Error listing cameras:", err);
      }
    };
    getCameras();
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
    stopContinuousCapture();
    setDetailLevel("low");
    setIsRecording(false);
    setIsProcessing(false);
    triggerSelectionFlash();
  };

  const cycleDetailLevel = (direction: "up" | "down") => {
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", " ", "Shift"].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case "ArrowUp":
          cycleDetailLevel("up");
          break;
        case "ArrowDown":
          cycleDetailLevel("down");
          break;
        case " ": // Space
          toggleRecording();
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
  }, [detailLevel, isDevMode, isRecording, isProcessing]);

  const triggerFlashPattern = async (content: string) => {
    const morse = textToMorse(content);
    const pattern = morseToPattern(morse);
    
    for (const bit of pattern) {
      if (bit === 1) {
        setShowFlash(true);
        await new Promise((resolve) => setTimeout(resolve, morseSpeed));
        setShowFlash(false);
      } else {
        await new Promise((resolve) => setTimeout(resolve, morseSpeed));
      }
      await new Promise((resolve) => setTimeout(resolve, morseSpeed / 2));
    }
  };

  const captureFrame = (): string | null => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.5); // Lower quality for faster upload
      }
    }
    return null;
  };

  const processFrame = async () => {
    if (isRequestInFlight.current) return;
    
    const photoDataUrl = captureFrame();
    if (!photoDataUrl) return;

    // Grab audio chunks and reset
    const audioBlob = audioChunksRef.current.length > 0 
      ? new Blob(audioChunksRef.current, { type: "audio/webm" }) 
      : null;
    audioChunksRef.current = [];

    isRequestInFlight.current = true;
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append("image", photoDataUrl);
      formData.append("detailLevel", detailLevel);
      if (audioBlob) {
        formData.append("audio", audioBlob, "audio.webm");
      }

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        const textToFlash = `${data.audioText} ${data.imageDescription}`.trim();
        if (textToFlash) {
          await triggerFlashPattern(textToFlash);
        }
      }
    } catch (err) {
      console.error("Processing error:", err);
    } finally {
      isRequestInFlight.current = false;
      setIsProcessing(false);
    }
  };

  const startContinuousCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true, 
        audio: true
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Start recording audio in chunks
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.start(250); // Request data every 250ms

      setIsRecording(true);
      intervalRef.current = setInterval(processFrame, 250); // Capture every 0.25s
    } catch (err) {
      console.error("Error starting capture:", err);
    }
  };

  const stopContinuousCapture = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsRecording(false);
    setIsProcessing(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopContinuousCapture();
    } else {
      startContinuousCapture();
    }
  };

  const triggerFlash = () => {
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 500); // Flash for 500ms
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gray-900 text-white relative overflow-hidden">
      {/* Flash Overlay - FULL SCREEN WHITE */}
      {showFlash && (
        <div className="fixed inset-0 bg-white z-[9999] transition-opacity duration-0" />
      )}

      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          VisionFlash {isDevMode ? "(Dev Mode)" : "(Gesture Mode)"}
        </p>
        <p className="text-xs opacity-50">Press 'D' to toggle Dev Mode</p>
      </div>

      <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
        {/* Main Visual/Gesture Interface */}
        <div className="text-center mb-4">
          <h1 className="text-5xl font-extrabold mb-2 tracking-tighter">
            VISION MODE
          </h1>
          <div className="flex flex-col gap-1">
            <p className="text-2xl text-yellow-500 font-mono font-bold">
              DETAIL: {detailLevel.toUpperCase()}
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-blue-400 font-mono">
              <p className="animate-pulse">
                {isRecording ? "● ANALYZING EVERY 0.25s" : isProcessing ? "● PROCESSING" : "READY (SPACE)"}
              </p>
              <div className="flex items-center gap-1 bg-blue-900/40 px-2 py-0.5 rounded border border-blue-500/30">
                <Zap size={12} />
                <span>{morseSpeed}ms</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border-4 border-gray-700 shadow-2xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-500 ${isRecording ? "opacity-100" : "opacity-40"}`}
          />
          <canvas ref={canvasRef} className="hidden" />
          {!isRecording && !isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="text-center p-8 bg-black/60 backdrop-blur-sm rounded-3xl border border-white/10">
                <Camera className="w-16 h-16 text-white mx-auto mb-6" />
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-4">
                    <span className="px-3 py-1 bg-white text-black rounded font-bold text-sm">↑</span>
                    <span className="text-white text-lg font-medium uppercase tracking-tight">INCREASE DETAIL</span>
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <span className="px-3 py-1 bg-white text-black rounded font-bold text-sm">↓</span>
                    <span className="text-white text-lg font-medium uppercase tracking-tight">DECREASE DETAIL</span>
                  </div>
                  <div className="flex items-center justify-center gap-4 pt-2">
                    <span className="px-6 py-1 bg-blue-600 text-white rounded font-bold text-sm">SPACE</span>
                    <span className="text-white text-lg font-medium uppercase tracking-tight">START / STOP</span>
                  </div>
                  <div className="flex items-center justify-center gap-4 pt-2">
                    <span className="px-4 py-1 bg-red-600 text-white rounded font-bold text-sm">SHIFT</span>
                    <span className="text-white text-lg font-medium uppercase tracking-tight">RESET APP</span>
                  </div>
                  <div className="flex items-center justify-center gap-4 pt-4 text-xs text-gray-400">
                    <div className="flex items-center gap-1">
                      <ChevronUp size={14} />
                      <ChevronDown size={14} />
                      <span>SCROLL TO ADJUST MORSE SPEED</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons - Always visible but styled differently in Dev Mode */}
        <div className="flex items-center gap-6">
          <button
            onClick={toggleRecording}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-12 py-6 rounded-full font-bold text-2xl transition-all ${
              isRecording 
                ? "bg-red-600 hover:bg-red-700 animate-pulse scale-110" 
                : isProcessing
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isRecording ? <Square size={32} /> : <Play size={32} />}
            {isRecording ? "STOP" : isProcessing ? "PROCESSING..." : "START"}
          </button>
        </div>

        {/* Dev Window */}
        {isDevMode && (
          <div className="w-full p-6 bg-gray-800/80 backdrop-blur-md rounded-xl border border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings className="text-blue-400" />
                <h2 className="text-xl font-semibold text-blue-400">Developer Settings</h2>
              </div>
              <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">DEBUG ACTIVE</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">Camera Device</span>
                <select 
                  value={selectedCamera}
                  onChange={(e) => {
                    setSelectedCamera(e.target.value);
                    console.log(`Camera changed to: ${e.target.value}`);
                  }}
                  className="bg-gray-700 p-2 rounded border border-gray-600"
                >
                  {cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Camera ${camera.deviceId.slice(0, 5)}...`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">Detail Level</span>
                <select 
                  value={detailLevel}
                  onChange={(e) => {
                    setDetailLevel(e.target.value);
                    triggerSelectionFlash();
                  }}
                  className="bg-gray-700 p-2 rounded border border-gray-600 text-white"
                >
                  <option value="low">Low (Fastest)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High (Slower)</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">Morse Speed ({morseSpeed}ms)</span>
                <input 
                  type="range"
                  min="50"
                  max="500"
                  step="10"
                  value={morseSpeed}
                  onChange={(e) => setMorseSpeed(parseInt(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-700 flex justify-center">
              <button
                onClick={() => triggerFlashPattern("TEST")}
                disabled={isProcessing || isRecording}
                className="flex items-center gap-2 px-6 py-2 bg-yellow-500/20 hover:bg-yellow-500/40 border border-yellow-500/50 rounded-full font-bold text-yellow-500 transition-all text-sm"
              >
                <Zap size={16} />
                TEST MORSE FLASH
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-3 lg:text-left opacity-50">
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors">
          <h2 className={`mb-3 text-2xl font-semibold`}>Vision <Camera className="inline" /></h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Analyzes environment every 0.25s via Azure GPT-4o.
          </p>
        </div>
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors">
          <h2 className={`mb-3 text-2xl font-semibold`}>Audio <Mic className="inline" /></h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Transcribes speech via Azure Speech Services.
          </p>
        </div>
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors">
          <h2 className={`mb-3 text-2xl font-semibold`}>Morse Flash <Zap className="inline" /></h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Converts both Vision and Audio into Morse code flashes.
          </p>
        </div>
      </div>
    </main>
  );
}
