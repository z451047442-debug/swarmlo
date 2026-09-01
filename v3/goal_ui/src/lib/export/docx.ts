// Word 文档生成：报告与行动清单共用一套排版体系
// （一级标题 + 元信息表 + 分隔线 + 表格化发现/风险 + 中文字体「等线」）。

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ChecklistDocument, ReportDocument } from "./types";
import { buildFilename, downloadBlob } from "./download";

// 中文字体：Windows 自带等线（DengXian），西文配 Segoe UI
const FONT = { ascii: "Segoe UI", hAnsi: "Segoe UI", eastAsia: "DengXian" };
const DIVIDER_BORDER = { style: BorderStyle.SINGLE, size: 6, color: "E5E7EB" };

function metaTable(doc: { generatedAt: string; totalSteps: number; dataPoints: number }): Table {
  const cell = (label: string, value: string) =>
    new TableCell({
      width: { size: 33, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: label, bold: true, font: FONT, size: 20 }),
            new TextRun({ text: value, font: FONT, size: 20 }),
          ],
        }),
      ],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell("生成时间：", doc.generatedAt),
          cell("研究步骤：", String(doc.totalSteps)),
          cell("数据点：", String(doc.dataPoints)),
        ],
      }),
    ],
  });
}

function divider(): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: DIVIDER_BORDER },
    children: [],
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: FONT, color: "1F2937" })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: FONT, size: 21 })],
  });
}

function fieldTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 22, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F3F4F6" },
              children: [
                new Paragraph({ children: [new TextRun({ text: label, bold: true, font: FONT, size: 20 })] }),
              ],
            }),
            new TableCell({
              width: { size: 78, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: value, font: FONT, size: 20 })] })],
            }),
          ],
        })
    ),
  });
}

function tableFromRows(header: string[], rows: string[][], colPcts: number[]): Table {
  const makeCell = (text: string, opts: { bold?: boolean; fill?: string } = {}) =>
    new TableCell({
      width: { size: colPcts[0] ?? 25, type: WidthType.PERCENTAGE },
      shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, font: FONT, size: 20 })] })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((h) => makeCell(h, { bold: true, fill: "F3F4F6" })),
      }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => makeCell(c)) })),
    ],
  });
}

export async function exportReportDocx(doc: ReportDocument): Promise<void> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [new TextRun({ text: doc.goal, bold: true, font: FONT, color: "111827", size: 36 })],
    }),
    metaTable(doc),
    divider(),
    heading("执行摘要", HeadingLevel.HEADING_2),
    body(doc.executiveSummary),
    divider(),
  ];

  doc.steps.forEach((step, idx) => {
    children.push(heading(`${idx + 1}. ${step.title}`, HeadingLevel.HEADING_2));
    children.push(body(step.description));
    if (step.findings.length > 0) {
      children.push(
        tableFromRows(
          ["发现", "内容", "来源"],
          step.findings.map((f) => [f.title, f.content, f.source || "—"]),
          [25, 55, 20]
        )
      );
    }
  });

  if (doc.citations.length > 0) {
    children.push(divider());
    children.push(heading("引用来源", HeadingLevel.HEADING_2));
    doc.citations.forEach((c, idx) => {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: `${idx + 1}. ${c.title} —— ${c.source}`, font: FONT, size: 20 })],
        })
      );
    });
  }

  const document = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(document);
  downloadBlob([blob], "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buildFilename("research-report", "docx"));
}

export async function exportChecklistDocx(doc: ChecklistDocument): Promise<void> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [new TextRun({ text: `${doc.goal} — 行动清单`, bold: true, font: FONT, color: "111827", size: 36 })],
    }),
    metaTable(doc),
    divider(),
  ];

  doc.items.forEach((item, idx) => {
    children.push(heading(`${idx + 1}. ${item.title}`, HeadingLevel.HEADING_2));
    children.push(
      fieldTable([
        ["优先级", item.priority],
        ["时间线", item.timeline],
        ["说明", item.description],
        ["时间拆解", item.timelineDetails],
        ...(item.resources.budget ? [["预算", item.resources.budget] as [string, string]] : []),
        ...(item.resources.team ? [["团队", item.resources.team] as [string, string]] : []),
        ...(item.resources.tools.length > 0 ? [["工具", item.resources.tools.join("、")] as [string, string]] : []),
      ])
    );

    if (item.metrics.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [new TextRun({ text: "成功指标", bold: true, font: FONT, size: 22 })],
        })
      );
      item.metrics.forEach((m) => {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: m, font: FONT, size: 20 })],
          })
        );
      });
    }

    if (item.risks.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [new TextRun({ text: "风险与缓解", bold: true, font: FONT, size: 22 })],
        })
      );
      children.push(tableFromRows(["风险", "缓解措施"], item.risks.map((r) => [r.risk, r.mitigation]), [40, 60]));
    }

    if (item.references.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [new TextRun({ text: "参考来源", bold: true, font: FONT, size: 22 })],
        })
      );
      item.references.forEach((ref) => {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: ref.title, font: FONT, size: 20 }),
              new TextRun({ text: ` ${ref.url}`, font: FONT, size: 18, color: "6B7280" }),
            ],
          })
        );
      });
    }

    children.push(body(`研究背景：${item.researchContext}`));
    children.push(divider());
  });

  const document = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(document);
  downloadBlob([blob], "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buildFilename("action-items-checklist", "docx"));
}
