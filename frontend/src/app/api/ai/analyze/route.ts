import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, info, type = "stock" } = body;

    if (!symbol || !info) {
      return NextResponse.json({ error: "symbol and info required" }, { status: 400 });
    }

    const dataPrompt = `
Symbole: ${symbol}
Type: ${type === "crypto" ? "Cryptomonnaie" : "Action boursière"}
Nom: ${info.longName ?? info.shortName ?? info.name ?? symbol}
Prix actuel: ${info.regularMarketPrice ?? info.price ?? "N/A"} ${info.currency ?? ""}
Variation: ${info.regularMarketChangePercent != null ? (info.regularMarketChangePercent * 100).toFixed(2) : "N/A"}%
Capitalisation: ${info.marketCap != null ? (info.marketCap / 1e9).toFixed(2) + "B" : "N/A"} ${info.currency ?? ""}
P/E trailing: ${info.trailingPE?.toFixed(2) ?? "N/A"}
P/E forward: ${info.forwardPE?.toFixed(2) ?? "N/A"}
P/B: ${info.priceToBook?.toFixed(2) ?? "N/A"}
EPS: ${info.trailingEps?.toFixed(2) ?? "N/A"}
Bêta: ${info.beta?.toFixed(2) ?? "N/A"}
ROE: ${info.returnOnEquity != null ? (info.returnOnEquity * 100).toFixed(2) + "%" : "N/A"}
ROA: ${info.returnOnAssets != null ? (info.returnOnAssets * 100).toFixed(2) + "%" : "N/A"}
Croissance revenus: ${info.revenueGrowth != null ? (info.revenueGrowth * 100).toFixed(2) + "%" : "N/A"}
Croissance bénéfices: ${info.earningsGrowth != null ? (info.earningsGrowth * 100).toFixed(2) + "%" : "N/A"}
Marges bénéficiaires: ${info.profitMargins != null ? (info.profitMargins * 100).toFixed(2) + "%" : "N/A"}
Marges brutes: ${info.grossMargins != null ? (info.grossMargins * 100).toFixed(2) + "%" : "N/A"}
Rendement dividende: ${info.dividendYield != null ? (info.dividendYield * 100).toFixed(2) + "%" : "N/A"}
Dette/Fonds propres: ${info.debtToEquity?.toFixed(2) ?? "N/A"}
Plus haut 52 semaines: ${info.fiftyTwoWeekHigh?.toFixed(2) ?? "N/A"}
Plus bas 52 semaines: ${info.fiftyTwoWeekLow?.toFixed(2) ?? "N/A"}
Secteur: ${info.sector ?? info.category ?? "N/A"}
Industrie: ${info.industry ?? "N/A"}
Employés: ${info.fullTimeEmployees?.toLocaleString("fr-FR") ?? "N/A"}
`.trim();

    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      system: `Tu es un analyste financier expert. Analyse cette ${type === "crypto" ? "cryptomonnaie" : "action"} avec les données fournies et donne un avis structuré en français.
Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans backticks. Le JSON doit avoir exactement cette structure:
{
  "summary": "résumé en 2 phrases max",
  "positifs": ["point positif 1", "point positif 2", "point positif 3"],
  "negatifs": ["point négatif 1", "point négatif 2"],
  "recommandation": "ACHETER" ou "CONSERVER" ou "VENDRE",
  "confiance": 75,
  "detail": "paragraphe d'analyse détaillée en 3-4 phrases",
  "disclaimer": "Ceci est une analyse automatisée à titre informatif uniquement. Ne constitue pas un conseil en investissement."
}`,
      messages: [
        {
          role: "user",
          content: `Analyse ces données financières:\n\n${dataPrompt}`,
        },
      ],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from Claude" }, { status: 500 });
    }

    const parsed = JSON.parse(textBlock.text);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("AI analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
