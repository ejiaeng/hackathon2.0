import { NextRequest, NextResponse } from "next/server";
import { AzureOpenAI } from "openai";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

// Load credentials from environment variables
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "https://poopi-mlbpq8ma-eastus2.cognitiveservices.azure.com/";
const apiKey = process.env.AZURE_OPENAI_KEY || "54rHEu3QSx7klJO8T8EwAjnMc0kuFcj2aVNzx3zQpuZPUGKvg4EYJQQJ99CBACHYHv6XJ3w3AAAAACOGmHRL";
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_ID || "gpt-4o";
const apiVersion = "2025-01-01-preview";

const speechKey = process.env.AZURE_SPEECH_KEY || "BuTse6NIcCqeOrsVCfHgWlhFu2cdYsQDa0OM5SILkqHBEUZY67MmJQQJ99CBACYeBjFXJ3w3AAAYACOGF9cd";
const speechRegion = process.env.AZURE_SPEECH_REGION || "eastus";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageDataUrl = formData.get("image") as string | null;
    const audioBlob = formData.get("audio") as Blob | null;

    let imageDescription = "";
    let audioText = "";

    // 1. Process Image if present
    if (imageDataUrl) {
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
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 20,
        temperature: 0.5,
      });
      imageDescription = response.choices[0].message?.content || "";
    }

    // 2. Process Audio if present
    if (audioBlob) {
      try {
        audioText = await processAudio(audioBlob);
      } catch (err) {
        console.error("Speech error:", err);
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

async function processAudio(audioBlob: Blob): Promise<string> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const pushStream = sdk.AudioInputStream.createPushStream();
  pushStream.write(arrayBuffer);
  pushStream.close();

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          resolve(result.text);
        } else {
          resolve("");
        }
      },
      (err) => {
        recognizer.close();
        reject(err);
      }
    );
  });
}
