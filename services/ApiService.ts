import { getAi } from './analysisService';

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
