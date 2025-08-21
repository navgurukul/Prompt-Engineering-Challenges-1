import { GoogleGenAI, LiveServerMessage, MediaResolution, Modality, Session } from "@google/genai";
import { AnalysisResult, Challenge, User } from '../types';

// --- AI Client Initialization ---

let ai: GoogleGenAI | null = null;

export const initializeAi = (apiKey: string) => {
  if (!apiKey) {
    throw new Error("An API key is required to initialize the AI service.");
  }
  ai = new GoogleGenAI({ apiKey });
};

export const getAi = (): GoogleGenAI => {
  if (!ai) {
    if (process.env.API_KEY) {
      initializeAi(process.env.API_KEY);
      return ai!;
    }
    throw new Error("Gemini AI client has not been initialized. Please provide an API key.");
  }
  return ai;
};

/**
 * Fetches an image from a local URL and returns it as a blob URL.
 * This is useful for ensuring images are loaded and displayed correctly
 * when relative paths might be problematic.
 * @param url The local URL of the image (e.g., '/challenges/challenge-1.jpg')
 * @returns A promise that resolves to a blob URL (e.g., 'blob:http://...')
 */
export const getLocalImageAsBlobUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${url}. Status: ${response.statusText}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error(`Error fetching local image ${url}:`, error);
    // Fallback to the original URL if fetching fails, allowing the browser to try and load it directly.
    return url;
  }
};


// --- Image Stitching ---

async function stitchImages(
  targetImageUrl: string,
  generatedImageBase64: string
): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  const targetImage = new Image();
  const generatedImage = new Image();
  targetImage.crossOrigin = 'anonymous';

  // Use getLocalImageAsBlobUrl to safely fetch the local target image.
  const targetBlobUrl = await getLocalImageAsBlobUrl(targetImageUrl);

  try {
    const loadTargetPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      targetImage.onload = () => resolve(targetImage);
      targetImage.onerror = () => reject(new Error(`Failed to load target image: ${targetImageUrl}`));
      targetImage.src = targetBlobUrl;
    });
  
    const loadGeneratedPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      generatedImage.onload = () => resolve(generatedImage);
      generatedImage.onerror = () => reject(new Error('Failed to load generated image from base64'));
      generatedImage.src = `data:image/jpeg;base64,${generatedImageBase64}`;
    });

    const [img1, img2] = await Promise.all([loadTargetPromise, loadGeneratedPromise]);

    const canvasWidth = img1.width + img2.width;
    const canvasHeight = Math.max(img1.height, img2.height);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.drawImage(img1, 0, 0);
    ctx.drawImage(img2, img1.width, 0);

    // Return base64 string without the data URL prefix
    return canvas.toDataURL('image/jpeg').split(',')[1];
  } finally {
      // Clean up the blob URL to avoid memory leaks
      if (targetBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(targetBlobUrl);
      }
  }
}


// --- TTS & Analysis Service Logic ---

let session: Session | undefined = undefined;
let currentAudio: HTMLAudioElement | null = null;

interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

function createWavHeader(dataLength: number, options: WavConversionOptions): ArrayBuffer {
  const { numChannels, sampleRate, bitsPerSample } = options;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  return buffer;
}

function parseMimeType(mimeType: string): WavConversionOptions {
  const params = mimeType.split(';').map(s => s.trim());
  const options: Partial<WavConversionOptions> = {
    numChannels: 1,
    bitsPerSample: 16,
  };

  for (const param of params) {
    if (param.startsWith('audio/L')) {
      const bits = parseInt(param.substring('audio/L'.length), 10);
      if (!isNaN(bits)) options.bitsPerSample = bits;
    } else if (param.startsWith('rate=')) {
      const rate = parseInt(param.substring('rate='.length), 10);
      if (!isNaN(rate)) options.sampleRate = rate;
    }
  }

  if (!options.sampleRate) {
    console.warn('Sample rate not found in mime type, defaulting to 24000');
    options.sampleRate = 24000;
  }

  return options as WavConversionOptions;
}

function convertToWav(rawData: string[], mimeType: string): Blob {
  const options = parseMimeType(mimeType);
  const decodedChunks = rawData.map(chunk => {
    const binaryString = atob(chunk);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  });

  const dataLength = decodedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const header = createWavHeader(dataLength, options);
  return new Blob([header, ...decodedChunks], { type: 'audio/wav' });
}

const cleanup = (onEnd?: () => void) => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.removeAttribute('src');
    currentAudio = null;
  }
  if (session) {
    session.close();
    session = undefined;
  }
  if (onEnd) {
    onEnd();
  }
};

export const stopSpeaking = (onEnd?: () => void): void => {
  cleanup(onEnd);
};

interface AnalysisCallbacks {
  onAnalysisComplete: (result: AnalysisResult) => void;
  onSpeakingStart: () => void;
  onSpeakingEnd: () => void;
}

export const analyzeAndSpeak = async (
  user: User,
  challenge: Challenge,
  generatedImageBase64: string,
  userPrompt: string,
  callbacks: AnalysisCallbacks,
): Promise<void> => {
  stopSpeaking(); // Cleanup previous session

  let accumulatedJson = "";
  const audioChunks: string[] = [];
  let currentMimeType: string | null = null;
  let analysisResult: AnalysisResult | null = null;

  const onEnd = callbacks.onSpeakingEnd;

  try {
    const gemini = getAi();
    const model = 'models/gemini-2.5-flash-live-preview';

    const getUserName = (email: string): string => {
      const namePart = email.split('@')[0];
      // Capitalize first letter of the first part (e.g., 'john.doe' -> 'John')
      return namePart.split('.')[0].charAt(0).toUpperCase() + namePart.split('.')[0].slice(1);
    };
    const userName = getUserName(user.email);

    const systemPrompt = `You are an expert image analysis AI for a prompt engineering learning tool. Your feedback tone should be quirky and vague, in simple and clear Indian English. Keep technical terms in pure English.
Tone: Indian female voice and Indian English or Hindi accent
Speed of speaking: Very slow. A student named ${userName} is trying to generate an image to match a target image for a prompt engineering challenge.
Analyze the provided image which contains two images side-by-side. The image on the LEFT is the "target image", and the image on the RIGHT is the student's generated image.

Provide:
1. A 'similarityScore' from 0-100. (Only through text)
2. A 'feedback' JSON array of up to 3 strings with prompt improvement suggestions. (both text and audio)

Respond ONLY with a JSON object.`;

    const userTurnPrompt = ` Challenge Name: "${challenge.name}".
The goal is: "${challenge.description}".
The student's prompt was: "${userPrompt}".
`;

    const config = {
      responseModalities: [Modality.AUDIO, Modality.TEXT],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        languageCode: 'en-IN',
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Zephyr',
          }
        }
      },
      contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' },
      },
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
    };

    const stitchedImageBase64 = await stitchImages(challenge.imageUrl, generatedImageBase64);
    const stitchedImagePart = {
      inlineData: {
        data: stitchedImageBase64,
        mimeType: "image/jpeg",
      },
    };

    const responseQueue: LiveServerMessage[] = [];
    let turnComplete = false;

    session = await gemini.live.connect({
      model,
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          responseQueue.push(message);
          if (message.serverContent?.turnComplete) {
            turnComplete = true;
          }
        },
        onerror: (e: any) => { console.error('Live session error:', e.message); cleanup(onEnd); },
        onclose: () => { session = undefined; },
      },
      config
    });

    session.sendClientContent({
      turns: [{
        parts: [
          { text: userTurnPrompt },
          stitchedImagePart,
        ]
      }]
    });

    while (!turnComplete || responseQueue.length > 0) {
      const message = responseQueue.shift();

      // console.log("[AnalysisService] message: ", message);
      if (!message) {
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }

      if (message.serverContent?.modelTurn?.parts) {
        for (const part of message.serverContent.modelTurn.parts) {
          if (part.text) {
            accumulatedJson += part.text;
          }
          if (part.inlineData) {
            if (!currentMimeType) currentMimeType = part.inlineData.mimeType;
            audioChunks.push(part.inlineData.data ?? '');
          }
        }
      }
    }

    if (accumulatedJson) {
      try {
        const cleanedJson = accumulatedJson.replace(/^```json\n?/, '').replace(/```$/, '').trim();
        analysisResult = JSON.parse(cleanedJson);
        callbacks.onAnalysisComplete(analysisResult!);
      } catch (e) {
        console.error("Failed to parse JSON response:", accumulatedJson, e);
        throw new Error("Failed to parse analysis from model.");
      }
    } 
    // else {
    //   throw new Error("Model did not return any analysis.");
    // }

    if (audioChunks.length > 0 && currentMimeType) {
      callbacks.onSpeakingStart();
      const wavBlob = convertToWav(audioChunks, currentMimeType);
      const audioUrl = URL.createObjectURL(wavBlob);
      currentAudio = new Audio(audioUrl);
      currentAudio.onended = () => { URL.revokeObjectURL(audioUrl); cleanup(onEnd); };
      currentAudio.onerror = (e) => {
        console.error("Error playing generated audio:", e);
        URL.revokeObjectURL(audioUrl);
        cleanup(onEnd);
      }
      currentAudio.play();
    } else {
      console.warn("Analysis resulted in no audio data.");
      cleanup(onEnd);
    }

  } catch (error) {
    console.error("Failed to get analysis and speak:", error);
    cleanup(onEnd);
    throw error;
  }
};