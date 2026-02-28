import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
];

function getApiKey() {
  const raw = process.env.GEMINI_API_KEY;
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function summarizeGeminiError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const compact = message.replace(/\s+/g, " ").trim();

  if (/api key|invalid|unauth|permission denied|403/i.test(compact)) {
    return "authentication failed (check GEMINI_API_KEY restrictions/validity)";
  }
  if (/quota|rate|429|resource exhausted/i.test(compact)) {
    return "quota/rate limit reached";
  }
  if (/not found|404|model/i.test(compact)) {
    return "model unavailable for this key/project";
  }

  return compact.slice(0, 180) || "unknown error";
}

function buildFallbackInsights(salesData: any[], inventoryData: any[]) {
  const salesRows = Array.isArray(salesData) ? salesData : [];
  const inventoryRows = Array.isArray(inventoryData) ? inventoryData : [];

  const validSales = salesRows.filter((row) => !row?.is_voided);
  const totalRevenue = validSales.reduce((sum, row) => sum + Number(row?.amount ?? 0), 0);

  const staffTotals = new Map<string, { revenue: number; count: number; voided: number }>();
  for (const row of salesRows) {
    const staff = String(row?.staff_name ?? "unknown");
    if (!staffTotals.has(staff)) {
      staffTotals.set(staff, { revenue: 0, count: 0, voided: 0 });
    }
    const bucket = staffTotals.get(staff)!;
    const amount = Number(row?.amount ?? 0);
    if (row?.is_voided) {
      bucket.voided += 1;
    } else {
      bucket.revenue += amount;
      bucket.count += 1;
    }
  }

  const suspiciousStaff = Array.from(staffTotals.entries())
    .map(([name, stats]) => {
      const totalEvents = stats.count + stats.voided;
      const voidRate = totalEvents > 0 ? (stats.voided / totalEvents) * 100 : 0;
      return { name, ...stats, voidRate };
    })
    .sort((a, b) => b.voidRate - a.voidRate)[0];
  const hasAnyVoids = Array.from(staffTotals.values()).some((stats) => stats.voided > 0);

  const topInventoryByStock = inventoryRows
    .map((row) => ({
      item: String(row?.item_name ?? "Unknown Item"),
      category: String(row?.category ?? "Uncategorized"),
      stockMl: Number(row?.current_stock_ml ?? 0),
    }))
    .sort((a, b) => b.stockMl - a.stockMl)[0];

  const lowOrZeroStock = inventoryRows.filter(
    (row) => Number(row?.current_stock_ml ?? 0) <= 180 || Number(row?.stock_quantity ?? 0) <= 1
  ).length;

  const avgTicket = validSales.length > 0 ? totalRevenue / validSales.length : 0;

  return [
    `1. CRITICAL ALERTS`,
    suspiciousStaff && hasAnyVoids
      ? `Highest void pattern: ${suspiciousStaff.name} (${suspiciousStaff.voided} voids, ${suspiciousStaff.voidRate.toFixed(1)}% void rate). Review recent void reasons and timestamps.`
      : "No void anomalies detected in the selected period.",
    "",
    `2. INVENTORY WASTE`,
    topInventoryByStock
      ? `Most stock currently sitting: ${topInventoryByStock.item} (${topInventoryByStock.category}) at ${topInventoryByStock.stockMl} ml. Push this item in promos to unlock cash.`
      : "No inventory rows available for waste analysis.",
    "",
    `3. SMART RE-STOCK`,
    lowOrZeroStock > 0
      ? `${lowOrZeroStock} items are low/near-empty. Prioritize reordering top-selling items first, then refill safety stock for fast movers.`
      : "No urgent low-stock pressure detected in current snapshot.",
    "",
    `4. PROFIT TIPS`,
    `Current average ticket is ${avgTicket.toFixed(2)}. Raise attachment by bundling one high-margin add-on with each core order.`,
  ].join("\n");
}

export async function getWeeklyInsights(salesData: any[], inventoryData: any[]) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return "The AI Auditor is offline: GEMINI_API_KEY is missing on the server.";
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const configuredModel =
    typeof process.env.GEMINI_MODEL === "string" && process.env.GEMINI_MODEL.trim().length > 0
      ? process.env.GEMINI_MODEL.trim()
      : "";
  const modelsToTry = configuredModel ? [configuredModel, ...DEFAULT_MODELS] : DEFAULT_MODELS;
  const uniqueModels = Array.from(new Set(modelsToTry));

  try {
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

    const failures: string[] = [];
    for (const modelName of uniqueModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        if (typeof text === "string" && text.trim().length > 0) {
          return text;
        }
      } catch (modelError) {
        console.error("Gemini model attempt failed:", modelName, modelError);
        failures.push(`${modelName}: ${summarizeGeminiError(modelError)}`);
      }
    }

    const details = failures.length > 0 ? failures.join("; ") : "no model attempts recorded";
    if (details.includes("quota/rate limit reached")) {
      return buildFallbackInsights(salesData, inventoryData);
    }
    return `The AI Auditor is offline: ${details}`;
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return `The AI Auditor is offline: ${summarizeGeminiError(error)}`;
  }
}
