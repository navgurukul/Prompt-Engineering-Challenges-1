
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

/**
 * A simple hashing function to generate a deterministic, non-negative integer seed from a string.
 * This ensures that the same input string will always produce the same seed.
 * @param input The string to hash.
 * @returns A non-negative integer seed.
 */
const getSeedFromString = (input: string): number => {
  let hash = 0;
  if (input.length === 0) {
    return 0;
  }
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
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

export const generateImage = async (prompt: string): Promise<string> => {
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
    
    if (response.generatedImages && response.generatedImages.length > 0) {
      return response.generatedImages[0].image.imageBytes;
    } else {
      throw new Error("Image generation failed, no images returned.");
    }
  } catch (error) {
    console.error("Error in generateImage:", error);
    throw new Error("Failed to generate image. Please check your prompt or API key.");
  }
};

export const analyzeImages = async (challenge: Challenge, generatedImageBase64: string, studentPrompt: string): Promise<AnalysisResult> => {
  const model = 'gemini-2.5-flash';
  
  const analysisPrompt = `
    You are an expert AI image analysis system for a prompt engineering educational tool. Your task is to provide a detailed, quantitative evaluation of a student's generated image against a target image. Be objective, analytical, and strict in your scoring.

    **Instructions:**

    1.  **Analyze the Images:**
        *   **Image 1:** The target image for the challenge.
        *   **Image 2:** The student's generated image.

    2.  **Evaluation Criteria & Scoring:**

        **Part A: Visual Similarity (Compare Image 2 to Image 1)**
        You will score the visual similarity based on four sub-criteria. Each is worth 25 points.
        *   **Subject Match (0-25 points):** How accurately do the main subjects/objects in the generated image match the target? Consider their form, details, and presence.
        *   **Composition Match (0-25 points):** How well does the layout, framing, and arrangement of elements in the generated image match the target?
        *   **Color & Lighting Match (0-25 points):** How closely do the color palette, mood, and lighting (shadows, highlights, direction) of the generated image match the target?
        *   **Style Match (0-25 points):** How well does the artistic style (e.g., photorealistic, impressionistic, cartoonish) of the generated image match the target?

        *   **Calculate Total Similarity Score:** Sum the four scores above to get a total \`similarityScore\` out of 100. This score is completely independent of the student's prompt.

        **Part B: Prompt Adherence (Compare Image 2 to Student's Prompt)**
        *   Evaluate how faithfully the generated image represents the student's written prompt: "${studentPrompt}".
        *   Assign a **Prompt Score** from 0-100. A high score means the image is a perfect visual representation of the text.

    3.  **Provide Feedback:**
        *   For \`similarityScoreRemarks\`, briefly explain your reasoning for the overall visual similarity score.
        *   For \`promptScoreRemarks\`, briefly explain your reasoning for the prompt adherence score.
        *   For \`feedback\`, provide one paragraph of overall constructive feedback, guiding the student on how to modify their prompt to better match the target image.

    **Response Format:**
    Respond ONLY with a JSON object that matches the provided schema. Do not include markdown, comments, or any text outside the JSON structure.
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

    // Create a seed based on the inputs for consistent analysis.
    const seedContent = `${challenge.imageUrl}-${generatedImageBase64.substring(0, 256)}`;
    const seed = getSeedFromString(seedContent);

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
            similarityScore: { type: Type.NUMBER, description: 'The total similarity score (0-100), which is the sum of the four sub-scores.' },
            similarityScoreRemarks: { type: Type.STRING, description: 'Remarks explaining the total similarity score.' },
            subjectScore: { type: Type.NUMBER, description: 'Score for subject match (0-25).' },
            compositionScore: { type: Type.NUMBER, description: 'Score for composition match (0-25).' },
            colorScore: { type: Type.NUMBER, description: 'Score for color and lighting match (0-25).' },
            styleScore: { type: Type.NUMBER, description: 'Score for style match (0-25).' },
            promptScore: { type: Type.NUMBER, description: 'CLIP-based score (0-100) for how well the generated image matches the student\'s prompt.' },
            promptScoreRemarks: { type: Type.STRING, description: 'Remarks explaining the prompt score.' },
            feedback: { type: Type.STRING, description: 'Overall constructive feedback for the student.' },
          },
          required: ['similarityScore', 'similarityScoreRemarks', 'subjectScore', 'compositionScore', 'colorScore', 'styleScore', 'promptScore', 'promptScoreRemarks', 'feedback'],
        },
        temperature: 0.2, // Lower temperature for more deterministic and focused output
        topK: 1,          // Use topK=1 for the most deterministic response
        seed: seed,       // Use a seed for deterministic analysis
      }
    });

    const jsonText = response.text.trim();
    const result = JSON.parse(jsonText);

    if (
      typeof result.similarityScore !== 'number' ||
      typeof result.similarityScoreRemarks !== 'string' ||
      typeof result.subjectScore !== 'number' ||
      typeof result.compositionScore !== 'number' ||
      typeof result.colorScore !== 'number' ||
      typeof result.styleScore !== 'number' ||
      typeof result.promptScore !== 'number' ||
      typeof result.promptScoreRemarks !== 'string' ||
      typeof result.feedback !== 'string'
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