// PDF 生成（pdfmake）：矢量排版，文字可选中。
// 中文字体从 public/fonts/ 按需加载（OFL 许可的 Noto Sans SC 子集），不打进 JS bundle。

import pdfMake from "pdfmake/build/pdfmake";
import type { ReportDocument } from "./types";
import { buildFilename } from "./download";

// pdfmake 0.3.x 浏览器版：字体二进制注册进 virtualfs，fonts 按文件名引用
async function registerCjkFonts(pdf: typeof pdfMake): Promise<void> {
  const load = async (url: string): Promise<Uint8Array> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Font fetch failed: ${url} (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const vfs = pdf.virtualfs as unknown as {
    writeFileSync: (filename: string, content: Uint8Array) => void;
  };
  vfs.writeFileSync("NotoSansSC-Regular.ttf", await load("/fonts/NotoSansSC-Regular.ttf"));
  vfs.writeFileSync("NotoSansSC-Bold.ttf", await load("/fonts/NotoSansSC-Bold.ttf"));
  pdf.fonts = {
    NotoSansSC: {
      normal: "NotoSansSC-Regular.ttf",
      bold: "NotoSansSC-Bold.ttf",
    },
  };
}

const GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const HEADER_FILL = "#F3F4F6";

function metaTable(doc: { generatedAt: string; totalSteps: number; dataPoints: number }) {
  return {
    margin: [0, 0, 0, 12] as [number, number, number, number],
    table: {
      widths: ["33%", "33%", "34%"],
      body: [
        [
          { text: "生成时间", bold: true, fillColor: HEADER_FILL },
          { text: "研究步骤", bold: true, fillColor: HEADER_FILL },
          { text: "数据点", bold: true, fillColor: HEADER_FILL },
        ],
        [doc.generatedAt, String(doc.totalSteps), String(doc.dataPoints)],
      ],
    },
    layout: {
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };
}

function divider() {
  return {
    canvas: [{ type: "line" as const, x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: BORDER }],
    margin: [0, 4, 0, 14] as [number, number, number, number],
  };
}

function findingsTable(findings: ReportDocument["steps"][number]["findings"]) {
  return {
    margin: [0, 4, 0, 8] as [number, number, number, number],
    table: {
      headerRows: 1,
      widths: ["26%", "54%", "20%"],
      body: [
        [
          { text: "发现", bold: true, fillColor: HEADER_FILL },
          { text: "内容", bold: true, fillColor: HEADER_FILL },
          { text: "来源", bold: true, fillColor: HEADER_FILL },
        ],
        ...findings.map((f) => [f.title, f.content, f.source || "—"]),
      ],
    },
    layout: {
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };
}

export async function exportReportPdf(doc: ReportDocument): Promise<void> {
  const content: unknown[] = [
    { text: doc.goal, style: "h1" },
    metaTable(doc),
    divider(),
    { text: "执行摘要", style: "h2" },
    { text: doc.executiveSummary, style: "body" },
    divider(),
  ];

  doc.steps.forEach((step, idx) => {
    content.push({ text: `${idx + 1}. ${step.title}`, style: "h2" });
    content.push({ text: step.description, style: "body" });
    if (step.findings.length > 0) {
      content.push(findingsTable(step.findings));
    }
  });

  if (doc.citations.length > 0) {
    content.push(divider());
    content.push({ text: "引用来源", style: "h2" });
    doc.citations.forEach((c, idx) => {
      content.push({ text: [{ text: `${idx + 1}. `, bold: true }, `${c.title} —— ${c.source}`], style: "body" });
    });
  }

  const documentDefinition = {
    pageSize: "A4" as const,
    pageMargins: [48, 48, 48, 48] as [number, number, number, number],
    defaultStyle: { font: "NotoSansSC", fontSize: 10, color: "#1F2937", lineHeight: 1.5 },
    styles: {
      h1: { fontSize: 20, bold: true, color: "#111827", margin: [0, 0, 0, 14] },
      h2: { fontSize: 14, bold: true, color: "#1F2937", margin: [0, 16, 0, 6] },
      body: { fontSize: 10, margin: [0, 2, 0, 6] },
    },
    content,
  };

  // pdfmake 0.3.x：字体注册在实例的 fonts 属性上（二进制走 virtualfs），而非 createPdf 参数
  await registerCjkFonts(pdfMake);
  pdfMake.createPdf(documentDefinition).download(buildFilename("research-report", "pdf"));
}
