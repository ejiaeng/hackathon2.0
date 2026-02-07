"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Mic, Settings, Play, Square, Zap } from "lucide-react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailLevel, setDetailLevel] = useState("summary");
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const triggerFlashPattern = async (pattern: number[]) => {
    for (const bit of pattern) {
      if (bit === 1) {
        setShowFlash(true);
        await new Promise((resolve) => setTimeout(resolve, 300));
        setShowFlash(false);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      setIsProcessing(true);

      // Simulate sending data
      const formData = new FormData();
      formData.append("detailLevel", detailLevel);
      // In a real app, we'd append the audio blob here
      
      try {
        const response = await fetch("/api/process", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.success) {
          await triggerFlashPattern(data.flashPattern);
        }
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setIsProcessing(false);
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing media devices:", err);
      }
    }
  };

  const triggerFlash = () => {
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 500); // Flash for 500ms
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gray-900 text-white relative overflow-hidden">
      {/* Flash Overlay */}
      {showFlash && (
        <div className="fixed inset-0 bg-white z-50 flex items-center justify-center animate-pulse">
          <span className="sr-only">FLASH</span>
        </div>
      )}

      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          VisionFlash All-in-One
        </p>
      </div>

      <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
        <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border-4 border-gray-700 shadow-2xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {!isRecording && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Camera className="w-16 h-16 text-gray-400" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          <button
            onClick={toggleRecording}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-8 py-4 rounded-full font-bold transition-all ${
              isRecording 
                ? "bg-red-600 hover:bg-red-700 animate-pulse" 
                : isProcessing
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isRecording ? <Square size={24} /> : <Play size={24} />}
            {isRecording ? "STOP" : isProcessing ? "PROCESSING..." : "START"}
          </button>

          <button
            onClick={() => triggerFlashPattern([1, 0, 1, 0, 1])}
            disabled={isProcessing || isRecording}
            className="flex items-center gap-2 px-8 py-4 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full font-bold text-black transition-all"
          >
            <Zap size={24} />
            TEST FLASH
          </button>
        </div>

        <div className="w-full p-6 bg-gray-800 rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="text-gray-400" />
            <h2 className="text-xl font-semibold">Settings</h2>
          </div>
          
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-gray-400">Detail Level</span>
              <select 
                value={detailLevel}
                onChange={(e) => setDetailLevel(e.target.value)}
                className="bg-gray-700 p-2 rounded border border-gray-600"
              >
                <option value="summary">Summary (Quick Flash)</option>
                <option value="detailed">Detailed (Pattern Flash)</option>
                <option value="word-for-word">Word-for-Word (Morse Flash)</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-3 lg:text-left opacity-50">
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors">
          <h2 className={`mb-3 text-2xl font-semibold`}>Audio <Mic className="inline" /></h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Captures real-time audio for speech-to-flash conversion.
          </p>
        </div>
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors">
          <h2 className={`mb-3 text-2xl font-semibold`}>Image <Camera className="inline" /></h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Analyzes visual environment via Azure OpenAI.
          </p>
        </div>
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors">
          <h2 className={`mb-3 text-2xl font-semibold`}>Flash <Zap className="inline" /></h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Provides visual feedback for deaf-blind users.
          </p>
        </div>
      </div>
    </main>
  );
}
