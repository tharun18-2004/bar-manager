import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function getWeeklyInsights(salesData: any[], inventoryData: any[]) {
  try {
    // We use the 1.5 Flash model because it is fast and free
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are a professional bar consultant and forensic auditor. 
      Analyze the following data from a real bar:

      SALES LOGS: ${JSON.stringify(salesData)}
      INVENTORY STATUS: ${JSON.stringify(inventoryData)}

      Please provide:
      1. CRITICAL ALERTS: Identify if any staff are voiding too many high-value drinks (potential theft).
      2. INVENTORY WASTE: Identify which "Stack" (category) is sitting on the shelf and not making money.
      3. SMART RE-STOCK: Based on sales trends, what exactly should the owner buy for next week?
      4. PROFIT TIPS: One specific tip to increase the bar's margin.

      Keep the tone professional, blunt, and business-focused for a remote owner.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return "The AI Auditor is currently offline. Please check your API key.";
  }
}