
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { AnalysisResult, Challenge } from '../types';

let ai: GoogleGenAI | null = null;

export const initializeAi = (apiKey: string) => {
  if (!apiKey) {
    throw new Error("An API key is required to initialize the AI service.");
  }
  ai = new GoogleGenAI({ apiKey });
};

const getAi = (): GoogleGenAI => {
  if (!ai) {
    throw new Error("Gemini AI client has not been initialized. Please provide an API key.");
  }
  return ai;
};

async function urlToGenerativePart(url: string, mimeType: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${url}`);
  }
  const buffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);
  const binaryString = Array.from(uint8Array).map((byte) => String.fromCharCode(byte)).join('');
  const base64 = btoa(binaryString);
  return {
    inlineData: {
      data: base64,
      mimeType,
    },
  };
}

export type ImageService = 'gemini' | 'pollinations';

export const generateImage = async (prompt: string, service: ImageService = 'pollinations'): Promise<string> => {
  prompt = prompt + " Don't add any additional effects or styles";
  if (service === 'pollinations') {
    try {
      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux`;
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to generate image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const binaryString = Array.from(uint8Array).map((byte) => String.fromCharCode(byte)).join('');
      const base64 = btoa(binaryString);
      return base64;
    } catch (error) {
      console.error("Error in generateImage:", error);
      throw new Error("Failed to generate image. Please check your prompt or internet connection.");
    }
  } else if (service === 'gemini') {
    try {
      const gemini = getAi();
      const response = await gemini.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        },
      });

      if (!response.generatedImages || response.generatedImages.length === 0 || !response.generatedImages[0].image.imageBytes) {
        throw new Error('No image returned from Gemini');
      }

      const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
      return base64ImageBytes;
    } catch (error) {
      console.error("Error in generateImage (Gemini):", error);
      throw new Error("Failed to generate image with Gemini.");
    }
  } else {
    throw new Error('Unknown image service selected');
  }
};

export const analyzeImages = async (challenge: Challenge, generatedImageBase64: string, userPrompt: string): Promise<AnalysisResult> => {
  const model = 'gemini-2.5-flash';
  
  const analysisPrompt = `
    You are an expert image analysis AI for a prompt engineering learning tool.
    A student is trying to match a target image for a challenge called "${challenge.name}".
    The goal is: "${challenge.description}".
    The student's prompt was: "${userPrompt}".
    
    Your task is to compare the student's generated image with the target image, evaluate the student's prompt, and provide structured feedback.
    
    Based on this, provide:
    1.  A 'similarityScore' from 0-100 for the generated image compared to the target image.
    2.  A 'feedback' JSON array of strings. This array should contain up to 3 of the most obvious prompt changes required to better match the target. Let the tone of this feedback be quirky and vague, in simple and clear Indian English. Keep technical terms in pure English.
    
    Respond ONLY with a JSON object matching the schema.
  `;

  try {
    const gemini = getAi();
    const targetImagePart = await urlToGenerativePart(challenge.imageUrl, "image/jpeg");
    const generatedImagePart = {
      inlineData: {
        data: generatedImageBase64,
        mimeType: "image/jpeg",
      },
    };

    const response: GenerateContentResponse = await gemini.models.generateContent({
      model: model,
      contents: {
          parts: [
            { text: analysisPrompt },
            targetImagePart,
            generatedImagePart,
          ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            similarityScore: {
              type: Type.NUMBER,
              description: 'A similarity score from 0 to 100, where 100 is a perfect match.'
            },
            feedback: {
              type: Type.ARRAY,
              description: 'A list of up to 3 prompt changes required.',
              items: {
                type: Type.STRING
              }
            }
          },
          required: ['similarityScore', 'feedback'],
        }
      }
    });

    const jsonText = response.text.trim();
    const result = JSON.parse(jsonText);

    if (
        typeof result.similarityScore !== 'number' || 
        !Array.isArray(result.feedback) ||
        !result.feedback.every((item: unknown) => typeof item === 'string')
    ) {
        throw new Error('Invalid JSON structure received from analysis API.');
    }

    return result as AnalysisResult;

  } catch (error) {
    console.error("Error in analyzeImages:", error);
    throw new Error("Failed to analyze images. The model may have returned an unexpected response.");
  }
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
