import { GoogleGenAI, LiveServerMessage, MediaResolution, Modality, Session } from '@google/genai';

let session: Session | undefined = undefined;
let currentAudio: HTMLAudioElement | null = null;
let audioChunks: string[] = [];
let responseQueue: LiveServerMessage[] = [];
let onEndCallback: (() => void) | undefined = undefined;
let currentMimeType: string | null = null;

// Singleton for the AI client
const getAi = (() => {
    let ai: GoogleGenAI | null = null;
    return () => {
        if (!ai) {
            if (!process.env.API_KEY) {
                throw new Error("CRITICAL ERROR: API_KEY environment variable not set.");
            }
            ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        }
        return ai;
    };
})();

// --- WAV Conversion Utilities (Browser-compatible) ---

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


// --- TTS Service Implementation ---

const processMessageQueue = async () => {
    let done = false;
    while (!done && session) {
        const message = responseQueue.shift();
        if (!message) {
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
        }

        if (message.serverContent?.modelTurn?.parts) {
            const part = message.serverContent.modelTurn.parts[0];
            if (part?.inlineData) {
                if (!currentMimeType) {
                    currentMimeType = part.inlineData.mimeType;
                }
                audioChunks.push(part.inlineData.data ?? '');
            }
        }

        if (message.serverContent?.turnComplete) {
            done = true;
        }
    }
};

const cleanup = () => {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.removeAttribute('src');
        currentAudio = null;
    }
    if (session) {
        session.close();
        session = undefined;
    }
    // Call the callback before clearing it
    if (onEndCallback) {
        onEndCallback();
        onEndCallback = undefined;
    }
    audioChunks = [];
    responseQueue = [];
    currentMimeType = null;
};

export const speak = async (text: string, onEnd?: () => void): Promise<void> => {
    stopSpeaking(); // This calls cleanup from the previous run
    onEndCallback = onEnd;

    try {
        const ai = getAi();
        const model = 'models/gemini-2.5-flash-live-preview';
        
        session = await ai.live.connect({
            model,
            callbacks: {
                onmessage: (message: LiveServerMessage) => responseQueue.push(message),
                onerror: (e: any) => {
                    console.error('TTS session error:', e.message);
                    cleanup();
                },
                onclose: () => {
                    session = undefined;
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
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
                  parts: [{
                    text: `Tone: Indian female voice and Indian English or Hindi accent
Speed of speaking: Very slow`,
                  }]
                },
            }
        });

        session.sendClientContent({ turns: [{ parts: [{ text }] }] });
        
        await processMessageQueue();

        if (audioChunks.length > 0 && currentMimeType) {
            const wavBlob = convertToWav(audioChunks, currentMimeType);
            const audioUrl = URL.createObjectURL(wavBlob);
            currentAudio = new Audio(audioUrl);
            currentAudio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                cleanup();
            };
            currentAudio.onerror = (e) => {
                 console.error("Error playing generated audio:", e);
                 URL.revokeObjectURL(audioUrl);
                 cleanup();
            }
            currentAudio.play();
        } else {
            console.warn("TTS generation resulted in no audio data.");
            cleanup();
        }

    } catch (error) {
        console.error("Failed to initialize TTS session:", error);
        cleanup();
    }
};

export const stopSpeaking = (): void => {
    cleanup();
};