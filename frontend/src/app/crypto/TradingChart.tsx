"use client";

import { useEffect, useRef } from "react";
import { createChart, LineStyle, type IChartApi } from "lightweight-charts";
import { ema, macd as calcMacd, rsi as calcRsi, bollingerBands } from "@/lib/indicators";

export interface OHLCBar {
  time: number;   // UTC seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface Props {
  data: OHLCBar[];
  indicators: Set<string>;
}

function smaArr(prices: number[], period: number): number[] {
  return prices.map((_, i) => {
    if (i < period - 1) return NaN;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += prices[j];
    return sum / period;
  });
}

type LWTime = import("lightweight-charts").Time;

function toLine(data: OHLCBar[], values: number[]): { time: LWTime; value: number }[] {
  return data
    .map((d, i) => (isNaN(values[i]) ? null : { time: d.time as LWTime, value: values[i] }))
    .filter(Boolean) as { time: LWTime; value: number }[];
}

const SHARED_LINE = {
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
} as const;

export default function TradingChart({ data, indicators }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    const hasRsi  = indicators.has("rsi");
    const hasMacd = indicators.has("macd");
    const hasVol  = indicators.has("volume");
    const hasSub  = hasRsi || hasMacd || hasVol;
    const hasTwoSub = [hasRsi, hasMacd].filter(Boolean).length === 2;

    const mainBottom = hasTwoSub ? 0.48 : hasSub ? 0.30 : 0.02;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: "#030712" }, textColor: "#9ca3af" },
      grid: { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
      crosshair: {
        vertLine: { color: "#374151", labelBackgroundColor: "#1f2937" },
        horzLine: { color: "#374151", labelBackgroundColor: "#1f2937" },
      },
      timeScale: { borderColor: "#1f2937", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#1f2937" },
    });
    chartRef.current = chart;

    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.02, bottom: mainBottom },
    });

    const closes = data.map((d) => d.close);

    // ── Candlesticks ──────────────────────────────────────────────────────────
    const candles = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candles.setData(
      data.map((d) => ({ time: d.time as LWTime, open: d.open, high: d.high, low: d.low, close: d.close })),
    );

    // ── Bollinger Bands ────────────────────────────────────────────────────────
    if (indicators.has("bb")) {
      const bbStyle = { ...SHARED_LINE, lineWidth: 1 as const, color: "#4b5563" };
      const upperS = chart.addLineSeries(bbStyle);
      const lowerS = chart.addLineSeries(bbStyle);
      const midS   = chart.addLineSeries({ ...SHARED_LINE, lineWidth: 1, color: "#374151", lineStyle: LineStyle.Dashed });

      const bbArr = data
        .map((d, i) => {
          if (i < 19) return null;
          const bb = bollingerBands(closes.slice(0, i + 1), 20);
          return { t: d.time as LWTime, u: bb.upper, l: bb.lower, m: bb.middle };
        })
        .filter(Boolean) as { t: LWTime; u: number; l: number; m: number }[];

      upperS.setData(bbArr.map((b) => ({ time: b.t, value: b.u })));
      lowerS.setData(bbArr.map((b) => ({ time: b.t, value: b.l })));
      midS.setData(bbArr.map((b) => ({ time: b.t, value: b.m })));
    }

    // ── EMA 9 / 21 / 50 ───────────────────────────────────────────────────────
    const emaConfigs: [string, number, string][] = [
      ["ema9",  9,  "#f97316"],
      ["ema21", 21, "#a855f7"],
      ["ema50", 50, "#3b82f6"],
    ];
    for (const [key, period, color] of emaConfigs) {
      if (!indicators.has(key)) continue;
      const s = chart.addLineSeries({ ...SHARED_LINE, color, lineWidth: 1 });
      s.setData(toLine(data, ema(closes, period)));
    }

    // ── SMA / MM 7 / 25 / 99 ─────────────────────────────────────────────────
    const smaConfigs: [string, number, string][] = [
      ["ma7",  7,  "#fbbf24"],
      ["ma25", 25, "#10b981"],
      ["ma99", 99, "#6366f1"],
    ];
    for (const [key, period, color] of smaConfigs) {
      if (!indicators.has(key)) continue;
      const s = chart.addLineSeries({ ...SHARED_LINE, color, lineWidth: 1 });
      s.setData(toLine(data, smaArr(closes, period)));
    }

    // ── Volume (sub-panel) ────────────────────────────────────────────────────
    if (hasVol) {
      const volTop = (hasRsi || hasMacd) ? 0.87 : 0.72;
      const vol = chart.addHistogramSeries({
        priceScaleId: "volume",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: volTop, bottom: 0 },
      });
      vol.setData(
        data.map((d) => ({
          time: d.time as LWTime,
          value: d.volume ?? 0,
          color: d.close >= d.open ? "#16a34a50" : "#dc262650",
        })),
      );
    }

    // ── RSI (sub-panel) ───────────────────────────────────────────────────────
    if (hasRsi) {
      const rsiTop    = hasMacd ? 0.55 : 0.71;
      const rsiBottom = hasVol  ? 0.14 : 0.02;

      const rsiS = chart.addLineSeries({
        priceScaleId: "rsi",
        color: "#a78bfa",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      });
      chart.priceScale("rsi").applyOptions({
        scaleMargins: { top: rsiTop, bottom: rsiBottom },
      });

      const rsiData = data
        .map((d, i) => {
          if (i < 14) return null;
          return { time: d.time as LWTime, value: calcRsi(closes.slice(0, i + 1), 14) };
        })
        .filter(Boolean) as { time: LWTime; value: number }[];

      rsiS.setData(rsiData);
      rsiS.createPriceLine({ price: 70, color: "#ef4444", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "70" });
      rsiS.createPriceLine({ price: 30, color: "#22c55e", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "30" });
    }

    // ── MACD (sub-panel) ──────────────────────────────────────────────────────
    if (hasMacd) {
      const macdTop    = 0.71;
      const macdBottom = hasVol ? 0.14 : 0.02;

      const { line, signal, histogram } = calcMacd(closes);
      const sharedM = { priceScaleId: "macd", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };

      const macdL = chart.addLineSeries({ ...sharedM, color: "#3b82f6", lineWidth: 1 });
      const sigL  = chart.addLineSeries({ ...sharedM, color: "#f97316", lineWidth: 1 });
      const histL = chart.addHistogramSeries({ ...sharedM });

      chart.priceScale("macd").applyOptions({
        scaleMargins: { top: macdTop, bottom: macdBottom },
      });

      macdL.setData(toLine(data, line));
      sigL.setData(toLine(data, signal));
      histL.setData(
        data
          .map((d, i) =>
            isNaN(histogram[i])
              ? null
              : { time: d.time as LWTime, value: histogram[i], color: histogram[i] >= 0 ? "#22c55e60" : "#ef444460" },
          )
          .filter(Boolean) as { time: LWTime; value: number; color: string }[],
      );
    }

    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, indicators]);

  return <div ref={containerRef} className="w-full h-full" />;
}
