import { NextRequest, NextResponse } from "next/server";
import { AzureOpenAI } from "openai";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import os from "os";

// Load credentials from environment variables
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_ID || "gpt-4o";
const apiVersion = "2025-01-01-preview";

const speechKey = process.env.AZURE_SPEECH_KEY;
const speechRegion = process.env.AZURE_SPEECH_REGION;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageDataUrl = formData.get("image") as string | null;
    const detailLevel = (formData.get("detailLevel") as string) || "low";
    const audioBlob = formData.get("audio") as Blob | null;

    let imageDescription = "";
    let audioText = "";

    console.log(`[API] Received request. Image: ${!!imageDataUrl}, Audio: ${!!audioBlob}, Detail: ${detailLevel}`);

    // 1. Process Image with Azure OpenAI (GPT-4o)
    if (imageDataUrl && imageDataUrl.startsWith("data:image")) {
      
      // SAVE IMAGE TO DISK (img folder)
      try {
        const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const timestamp = Date.now();
        const filename = `capture_${timestamp}.jpg`;
        const filepath = path.join(process.cwd(), 'img', filename);
        
        // Ensure directory exists (redundant if mkdir was run, but safe)
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filepath, buffer);
        console.log(`[API] Saved captured image to: ${filepath}`);
      } catch (saveError) {
        console.error("[API] Failed to save image to disk:", saveError);
      }

      if (!endpoint || !apiKey) {
        console.error("[API] Missing Azure OpenAI credentials");
        throw new Error("Azure OpenAI credentials not configured");
      }

      console.log(`[API] Sending image to Azure OpenAI (${deployment})...`);
      
      const client = new AzureOpenAI({
        endpoint,
        apiKey,
        apiVersion,
        deployment,
      });

      const response = await client.chat.completions.create({
        model: deployment,
        messages: [
          {
            role: "system",
            content: "You are a concise visual assistant for the deaf-blind. Describe the most important thing in the image in 3-5 words only.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                  detail: detailLevel as "low" | "high" | "auto",
                },
              },
            ],
          },
        ],
        max_tokens: 20,
        temperature: 0.5,
      });
      
      imageDescription = response.choices[0].message?.content || "";
      console.log(`[API] Azure OpenAI Response: "${imageDescription}"`);
    }

    // 2. Process Audio with Azure Speech SDK
    // Note: This expects the audioBlob to be in a format the SDK can handle (usually PCM/WAV).
    // Browsers often send WebM. If this fails, client-side transcoding to WAV/PCM is needed.
    if (audioBlob && speechKey && speechRegion) {
      try {
        const text = await processAudio(audioBlob, speechKey, speechRegion);
        if (text) {
          audioText = text;
        }
      } catch (err) {
        console.error("Speech processing warning:", err);
        // Do not fail the whole request if audio fails
      }
    }

    return NextResponse.json({
      success: true,
      imageDescription,
      audioText,
    });
  } catch (error: any) {
    console.error("Processing Error:", error.message);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function processAudio(audioBlob: Blob, key: string, region: string): Promise<string> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Create temp file
  const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.webm`);
  fs.writeFileSync(tempFilePath, buffer);
  
  // Create the push stream
  const pushStream = sdk.AudioInputStream.createPushStream();
  
  // Spawn ffmpeg to convert to PCM
  // ffmpeg -i input.webm -f s16le -acodec pcm_s16le -ac 1 -ar 16000 pipe:1
  const ffmpeg = spawn('ffmpeg', [
    '-i', tempFilePath,
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    '-ac', '1',
    '-ar', '16000',
    'pipe:1'
  ]);

  ffmpeg.stdout.on('data', (chunk: Buffer) => {
    // Write array buffer to push stream
    // Ensure we send the correct slice of the buffer
    const arrayBuf = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    pushStream.write(arrayBuf as ArrayBuffer);
  });

  ffmpeg.stderr.on('data', (data) => {
     // console.error(`ffmpeg stderr: ${data}`);
  });
  
  ffmpeg.on('close', (code) => {
     console.log(`[API] ffmpeg exited with code ${code}`);
     pushStream.close();
     // Cleanup temp file
     try { 
         if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); 
     } catch(e) {
         console.error("Error deleting temp file:", e);
     }
  });

  // Configure for audio input
  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = "en-US";
  
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          resolve(result.text);
        } else {
          console.log("Speech recognition failed or no speech:", result.errorDetails);
          resolve("");
        }
      },
      (err) => {
        recognizer.close();
        console.error("Recognizer error:", err);
        reject(err);
      }
    );
  });
}
