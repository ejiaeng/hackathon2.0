const fs = require('fs');
const path = require('path');
const sdk = require('microsoft-cognitiveservices-speech-sdk');

// 1. Load Env Vars
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const speechKey = process.env.AZURE_SPEECH_KEY;
const speechRegion = process.env.AZURE_SPEECH_REGION;

if (!speechKey || !speechRegion) {
    console.error("Missing Azure Speech credentials in .env.local");
    process.exit(1);
}

console.log(`Using Region: ${speechRegion}`);

async function testAudio() {
    const audioPath = path.join(__dirname, 'aud', 'test.mp3');
    if (!fs.existsSync(audioPath)) {
        console.error("Audio file not found:", audioPath);
        return;
    }

    const audioBuffer = fs.readFileSync(audioPath);
    console.log(`Read audio file: ${audioBuffer.length} bytes`);

    // Use ffmpeg to convert to PCM
    // ffmpeg -i input.mp3 -f s16le -acodec pcm_s16le -ac 1 -ar 16000 pipe:1
    const { spawn } = require('child_process');
    
    console.log("Spawning ffmpeg for conversion...");
    const ffmpeg = spawn('ffmpeg', [
        '-i', audioPath,
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-ac', '1',
        '-ar', '16000',
        'pipe:1'
    ]);

    const pushStream = sdk.AudioInputStream.createPushStream();

    ffmpeg.stdout.on('data', (chunk) => {
        // chunk is a Buffer (Uint8Array)
        pushStream.write(chunk.buffer);
    });

    ffmpeg.stderr.on('data', (data) => {
        // console.error(`ffmpeg stderr: ${data}`);
    });

    ffmpeg.on('close', (code) => {
        console.log(`ffmpeg process exited with code ${code}`);
        pushStream.close();
    });

    try {
        const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
        speechConfig.speechRecognitionLanguage = "en-US";

        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        console.log("Recognizing...");
        
        recognizer.recognizeOnceAsync(
            (result) => {
                recognizer.close();
                console.log("Result Reason:", result.reason);
                if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                    console.log("Text:", result.text);
                } else {
                    console.log("No speech recognized. Details:", result.errorDetails);
                }
            },
            (err) => {
                recognizer.close();
                console.error("Error:", err);
            }
        );

    } catch (e) {
        console.error("Exception:", e);
    }
}

testAudio();
