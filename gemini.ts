import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const geminiModel = "gemini-3-flash-preview";

export async function getGeminiResponse(prompt: string, history: { role: "user" | "model"; parts: { text: string }[] }[] = []) {
  const chat = ai.chats.create({
    model: geminiModel,
    config: {
      systemInstruction: "You are MindMate — a warm, emotionally intelligent companion. You are NOT a therapist. You listen deeply, reflect back what you hear, and ask one gentle follow-up question per response. Keep every response under 4 sentences. Never give advice lists. Never use bullet points. Speak like a caring friend who genuinely has time for this person. After detecting emotional distress, offer ONE small grounding action naturally in conversation. Always end responses with a single open question that invites the user to go deeper.",
    },
    history: history,
  });

  const result = await chat.sendMessage({ message: prompt });
  return result.text;
}

export async function detectMoodFromImage(base64Image: string) {
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: {
      parts: [
        { text: "Analyze this person's facial expression and body language. Identify their primary mood from this list: happy, sad, stressed, overthinking, anxious, tired, unmotivated, lonely, bored. Return ONLY the single word for the mood. If unsure, return 'bored'." },
        { inlineData: { mimeType: "image/jpeg", data: base64Image } }
      ]
    }
  });
  return response.text.trim().toLowerCase();
}
