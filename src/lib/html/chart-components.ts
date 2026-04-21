/**
 * Chart component processor for HTML content.
 *
 * Scans HTML for <echarts-chart> tags, renders each to a pure SVG string
 * via ECharts SSR, and replaces the tag in-place. Runs BEFORE the sanitizer.
 *
 * Usage in HTML:
 *   <echarts-chart type="bar" width="760" height="380">
 *   {"categories":["A","B","C"],"series":[{"name":"s","data":[10,20,30]}]}
 *   </echarts-chart>
 *
 * Supported types: bar, line, donut, candlestick, waterfall, heatmap, gauge, radar, scatter
 */

import * as echarts from "echarts";

// ── Dark finance theme colors ───────────────────────────────────────

const C = {
  gold: "#c9a55c",
  goldLight: "#e8d5a3",
  green: "#2ecc71",
  red: "#e74c3c",
  blue: "#3498db",
  purple: "#9b59b6",
  orange: "#e67e22",
  teal: "#1abc9c",
  navy: "#0a1628",
  tp: "#e8edf5",
  ts: "#8899b4",
  border: "rgba(201,165,92,0.2)",
  grid: "rgba(255,255,255,0.08)",
};

const PALETTE = [C.gold, C.green, C.blue, C.purple, C.orange, C.teal, C.red, C.goldLight];

// ── Base theme applied to every chart ───────────────────────────────

function baseOption(): Record<string, unknown> {
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "'Inter',-apple-system,sans-serif", color: C.ts },
    title: {
      textStyle: { color: C.tp, fontSize: 14, fontWeight: 600 },
      subtextStyle: { color: C.ts, fontSize: 12 },
    },
    legend: { textStyle: { color: C.ts, fontSize: 11 } },
    grid: { containLabel: true, left: 12, right: 12, top: 48, bottom: 12 },
    color: PALETTE,
  };
}

// ── Axis helpers ────────────────────────────────────────────────────

function catAxis(data: string[]) {
  return {
    type: "category",
    data,
    axisLine: { lineStyle: { color: C.border } },
    axisTick: { lineStyle: { color: C.border } },
    axisLabel: { color: C.ts, fontSize: 11 },
  };
}

function valAxis() {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: C.ts, fontSize: 11 },
    splitLine: { lineStyle: { color: C.grid } },
  };
}

// ── Chart builders — each returns an ECharts option object ──────────

type Builder = (data: Record<string, unknown>, title?: string, subtitle?: string) => Record<string, unknown>;

const builders: Record<string, Builder> = {
  bar(d, title, subtitle) {
    const cats = d.categories as string[];
    const series = d.series as { name: string; data: number[] }[];
    const h = d.horizontal as boolean | undefined;
    return {
      title: title ? { text: title, subtext: subtitle } : undefined,
      tooltip: {},
      legend: series.length > 1 ? { data: series.map((s) => s.name) } : undefined,
      xAxis: h ? valAxis() : catAxis(cats),
      yAxis: h ? catAxis(cats) : valAxis(),
      series: series.map((s) => ({
        name: s.name,
        type: "bar",
        data: s.data,
        itemStyle: { borderRadius: h ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        barMaxWidth: 48,
        label: {
          show: series.length === 1,
          position: h ? "right" : "top",
          color: C.ts,
          fontSize: 11,
        },
      })),
    };
  },

  line(d, title, subtitle) {
    const cats = d.categories as string[];
    const series = d.series as { name: string; data: number[] }[];
    const area = d.area as boolean | undefined;
    return {
      title: title ? { text: title, subtext: subtitle } : undefined,
      tooltip: { trigger: "axis" },
      legend: { data: series.map((s) => s.name) },
      xAxis: { ...catAxis(cats), boundaryGap: false },
      yAxis: valAxis(),
      series: series.map((s) => ({
        name: s.name,
        type: "line",
        data: s.data,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2.5 },
        areaStyle: area ? { opacity: 0.12 } : undefined,
      })),
    };
  },

  donut(d, title, subtitle) {
    const items = d.items as { name: string; value: number }[];
    return {
      title: title
        ? { text: title, subtext: subtitle, left: "center" }
        : d.centerText
          ? { text: d.centerText as string, left: "center", top: "center", textStyle: { color: C.tp, fontSize: 18, fontWeight: 700 } }
          : undefined,
      tooltip: {},
      legend: { orient: "horizontal", bottom: 0, textStyle: { color: C.ts, fontSize: 11 } },
      series: [{
        type: "pie",
        radius: ["42%", "70%"],
        center: ["50%", "48%"],
        itemStyle: { borderRadius: 6, borderColor: C.navy, borderWidth: 2 },
        label: { color: C.ts, fontSize: 12, formatter: "{b}: {d}%" },
        data: items,
      }],
    };
  },

  candlestick(d, title, subtitle) {
    const dates = d.dates as string[];
    const ohlc = d.data as number[][];
    const vols = d.volumes as number[] | undefined;
    const hasVol = vols && vols.length > 0;

    return {
      title: title ? { text: title, subtext: subtitle } : undefined,
      grid: hasVol
        ? [{ left: 60, right: 20, top: 48, height: "55%" }, { left: 60, right: 20, top: "75%", height: "15%" }]
        : { containLabel: true, left: 12, right: 12, top: 48, bottom: 12 },
      xAxis: hasVol
        ? [{ type: "category", data: dates, axisLine: { lineStyle: { color: C.border } }, axisLabel: { color: C.ts, fontSize: 10 } },
           { type: "category", gridIndex: 1, data: dates, axisLabel: { show: false }, axisLine: { lineStyle: { color: C.border } } }]
        : { type: "category", data: dates, axisLine: { lineStyle: { color: C.border } }, axisLabel: { color: C.ts, fontSize: 10 } },
      yAxis: hasVol
        ? [{ type: "value", splitLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.ts, fontSize: 11 } },
           { type: "value", gridIndex: 1, splitLine: { show: false }, axisLabel: { show: false } }]
        : { type: "value", splitLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.ts, fontSize: 11 } },
      series: [
        { type: "candlestick", data: ohlc, itemStyle: { color: C.green, color0: C.red, borderColor: C.green, borderColor0: C.red } },
        ...(hasVol ? [{ type: "bar" as const, xAxisIndex: 1, yAxisIndex: 1, data: vols, itemStyle: { color: "rgba(201,165,92,0.35)" }, barMaxWidth: 12 }] : []),
      ],
    };
  },

  waterfall(d, title, subtitle) {
    const cats = d.categories as string[];
    const vals = d.values as number[];
    const base: number[] = [];
    const inc: (number | string)[] = [];
    const dec: (number | string)[] = [];
    let run = 0;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (i === 0 || i === vals.length - 1) {
        base.push(0);
        inc.push(v >= 0 ? v : "-");
        dec.push(v < 0 ? Math.abs(v) : "-");
        if (i === 0) run = v;
      } else if (v >= 0) {
        base.push(run);
        inc.push(v);
        dec.push("-");
        run += v;
      } else {
        base.push(run + v);
        inc.push("-");
        dec.push(Math.abs(v));
        run += v;
      }
    }
    return {
      title: title ? { text: title, subtext: subtitle } : undefined,
      xAxis: catAxis(cats),
      yAxis: valAxis(),
      series: [
        { name: "Base", type: "bar", stack: "w", data: base, itemStyle: { color: "transparent" }, emphasis: { itemStyle: { color: "transparent" } } },
        { name: "Increase", type: "bar", stack: "w", data: inc, itemStyle: { color: C.green, borderRadius: [4, 4, 0, 0] } },
        { name: "Decrease", type: "bar", stack: "w", data: dec, itemStyle: { color: C.red, borderRadius: [4, 4, 0, 0] } },
      ],
    };
  },

  heatmap(d, title, subtitle) {
    const xLabels = d.xLabels as string[];
    const yLabels = d.yLabels as string[];
    const data = d.data as number[][];
    const allVals = data.map((r) => r[2]);
    const min = (d.min as number) ?? Math.min(...allVals);
    const max = (d.max as number) ?? Math.max(...allVals);
    return {
      title: title ? { text: title, subtext: subtitle } : undefined,
      grid: { containLabel: true, left: 12, right: 60, top: 48, bottom: 12 },
      xAxis: { ...catAxis(xLabels), axisLabel: { color: C.ts, fontSize: 10 } },
      yAxis: { type: "category", data: yLabels, axisLine: { show: false }, axisLabel: { color: C.ts, fontSize: 11 } },
      visualMap: { min, max, calculable: false, orient: "vertical", right: 0, top: "center", inRange: { color: [C.red, "#333", C.green] }, textStyle: { color: C.ts, fontSize: 10 } },
      series: [{ type: "heatmap", data, label: { show: true, color: C.tp, fontSize: 10 }, itemStyle: { borderColor: C.navy, borderWidth: 2 } }],
    };
  },

  gauge(d, title, subtitle) {
    return {
      title: title ? { text: title, subtext: subtitle, left: "center" } : undefined,
      series: [{
        type: "gauge",
        min: (d.min as number) ?? 0,
        max: (d.max as number) ?? 100,
        progress: { show: true, width: 18 },
        axisLine: { lineStyle: { width: 18, color: [[0.3, C.red], [0.7, C.gold], [1, C.green]] } },
        axisTick: { show: false },
        splitLine: { length: 10, lineStyle: { color: C.ts } },
        axisLabel: { color: C.ts, fontSize: 10, distance: 25 },
        pointer: { width: 5, length: "60%", itemStyle: { color: C.gold } },
        detail: { valueAnimation: false, fontSize: 28, fontWeight: 700, color: C.tp, offsetCenter: [0, "70%"], formatter: "{value}" },
        title: { offsetCenter: [0, "90%"], color: C.ts, fontSize: 13 },
        data: [{ value: d.value as number, name: (d.name as string) ?? "" }],
      }],
    };
  },

  radar(d, title, subtitle) {
    const indicators = d.indicators as { name: string; max: number }[];
    const series = d.series as { name: string; values: number[] }[];
    return {
      title: title ? { text: title, subtext: subtitle, left: "center" } : undefined,
      legend: { bottom: 0, data: series.map((s) => s.name), textStyle: { color: C.ts } },
      radar: {
        indicator: indicators,
        shape: "polygon",
        axisName: { color: C.ts, fontSize: 11 },
        splitArea: { areaStyle: { color: ["transparent"] } },
        splitLine: { lineStyle: { color: C.grid } },
        axisLine: { lineStyle: { color: C.grid } },
      },
      series: [{ type: "radar", data: series.map((s) => ({ name: s.name, value: s.values, areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } })) }],
    };
  },

  scatter(d, title, subtitle) {
    const series = d.series as { name: string; data: number[][] }[];
    return {
      title: title ? { text: title, subtext: subtitle } : undefined,
      legend: { data: series.map((s) => s.name), textStyle: { color: C.ts } },
      xAxis: { type: "value", name: d.xName as string | undefined, nameTextStyle: { color: C.ts }, axisLine: { lineStyle: { color: C.border } }, splitLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.ts, fontSize: 11 } },
      yAxis: { type: "value", name: d.yName as string | undefined, nameTextStyle: { color: C.ts }, axisLine: { show: false }, splitLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.ts, fontSize: 11 } },
      series: series.map((s) => ({ name: s.name, type: "scatter" as const, data: s.data, symbolSize: 12 })),
    };
  },
};

// ── SVG renderer ────────────────────────────────────────────────────

function renderToSvg(
  type: string,
  data: Record<string, unknown>,
  width: number,
  height: number,
  title?: string,
  subtitle?: string,
): string {
  const build = builders[type];
  if (!build) return `<!-- unknown chart type: ${type} -->`;

  const chart = echarts.init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height,
  });
  const option = { ...baseOption(), ...build(data, title, subtitle) };
  chart.setOption(option as echarts.EChartsOption);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

// ── Default dimensions per chart type ───────────────────────────────

const DEFAULTS: Record<string, { w: number; h: number }> = {
  bar: { w: 700, h: 400 },
  line: { w: 700, h: 400 },
  donut: { w: 400, h: 400 },
  candlestick: { w: 700, h: 450 },
  waterfall: { w: 700, h: 400 },
  heatmap: { w: 700, h: 400 },
  gauge: { w: 380, h: 340 },
  radar: { w: 500, h: 420 },
  scatter: { w: 600, h: 400 },
};

// ── Main processor ──────────────────────────────────────────────────

const TAG_RE = /<echarts-chart([^>]*)>([\s\S]*?)<\/echarts-chart>/gi;

function parseAttrs(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/**
 * Scan HTML for <echarts-chart> tags and replace each with rendered SVG.
 * Returns the processed HTML. If no tags found, returns input unchanged.
 */
export function processChartComponents(html: string): string {
  return html.replace(TAG_RE, (_match, attrsStr: string, body: string) => {
    const attrs = parseAttrs(attrsStr);
    const type = attrs.type || "bar";
    const def = DEFAULTS[type] || { w: 700, h: 400 };
    const width = attrs.width ? parseInt(attrs.width, 10) : def.w;
    const height = attrs.height ? parseInt(attrs.height, 10) : def.h;
    const title = attrs.title;
    const subtitle = attrs.subtitle;

    try {
      const data = JSON.parse(body.trim());
      return renderToSvg(type, data, width, height, title, subtitle);
    } catch {
      return `<!-- echarts-chart parse error: invalid JSON -->`;
    }
  });
}
