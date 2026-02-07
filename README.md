# VisionFlash All-in-One

VisionFlash is a laptop application designed for deaf-blind users. It captures real-time audio and video, processes the content using Azure services, and provides feedback via bright white screen flashes.

## Features

- **Media Capture**: Real-time camera and microphone recording.
- **Visual Feedback**: Bright white screen flashes (instead of vibrations) to communicate environmental information.
- **Customizable Detail**: Users can choose between different levels of feedback:
  - **Summary**: Quick flashes for high-level environmental changes.
  - **Detailed**: Patterned flashes for more context.
  - **Word-for-Word**: Morse-like flashes for precise communication.
- **Azure Integration (Planned)**:
  - **Azure Speech SDK**: For real-time speech-to-text conversion.
  - **Azure OpenAI (GPT-4V)**: For visual scene analysis.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## How it works

1. The user clicks **START** to begin capturing audio and video.
2. Upon clicking **STOP**, the captured data is sent to the `/api/process` endpoint.
3. The backend (planned Azure integration) processes the media and returns a flash pattern.
4. The frontend triggers the "Flash Overlay" based on the received pattern.
