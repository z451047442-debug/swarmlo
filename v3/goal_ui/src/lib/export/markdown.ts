// 美化版 Markdown 生成：统一排版体系（标题块 + 元信息表 + 分隔线 + 表格化发现）
// 与 docx/pdf 生成器共享同一视觉语言，保证三种格式观感一致。

import type { ReportDocument, ChecklistDocument } from "./types";
import { downloadBlob, buildFilename } from "./download";

const escapeCell = (value: string): string =>
  (value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();

function renderMetaTable(doc: { generatedAt: string; totalSteps: number; dataPoints: number }): string {
  return [
    "| 生成时间 | 研究步骤 | 数据点 |",
    "| --- | --- | --- |",
    `| ${doc.generatedAt} | ${doc.totalSteps} | ${doc.dataPoints} |`,
    "",
  ].join("\n");
}

const divider = () => "\n---\n\n";

export function renderReportMarkdown(doc: ReportDocument): string {
  let md = `# ${doc.goal}\n\n`;
  md += renderMetaTable(doc);
  md += divider();

  md += `## 执行摘要\n\n${doc.executiveSummary}\n\n`;
  md += divider();

  doc.steps.forEach((step, idx) => {
    md += `## ${idx + 1}. ${step.title}\n\n`;
    md += `${step.description}\n\n`;

    if (step.findings.length > 0) {
      md += "| 发现 | 内容 | 来源 |\n| --- | --- | --- |\n";
      step.findings.forEach((f) => {
        md += `| ${escapeCell(f.title)} | ${escapeCell(f.content)} | ${escapeCell(f.source || "—")} |\n`;
      });
      md += "\n";
    }
  });

  if (doc.citations.length > 0) {
    md += divider();
    md += `## 引用来源\n\n`;
    doc.citations.forEach((c, idx) => {
      md += `${idx + 1}. ${c.title} —— ${c.source}\n`;
    });
    md += "\n";
  }

  return md;
}

export function renderChecklistMarkdown(doc: ChecklistDocument): string {
  let md = `# ${doc.goal} — 行动清单\n\n`;
  md += renderMetaTable(doc);
  md += divider();

  doc.items.forEach((item, idx) => {
    md += `## ${idx + 1}. ${item.title}\n\n`;
    md += `| 优先级 | 时间线 |\n| --- | --- |\n| ${escapeCell(item.priority)} | ${escapeCell(item.timeline)} |\n\n`;
    md += `**说明：** ${escapeCell(item.description)}\n\n`;
    md += `**时间拆解：** ${escapeCell(item.timelineDetails)}\n\n`;

    const resources: string[] = [];
    if (item.resources.budget) resources.push(`**预算：** ${escapeCell(item.resources.budget)}`);
    if (item.resources.team) resources.push(`**团队：** ${escapeCell(item.resources.team)}`);
    if (item.resources.tools.length > 0) resources.push(`**工具：** ${item.resources.tools.map(escapeCell).join("、")}`);
    if (resources.length > 0) md += resources.join("　") + "\n\n";

    if (item.metrics.length > 0) {
      md += `**成功指标：**\n\n`;
      item.metrics.forEach((m) => (md += `- [ ] ${escapeCell(m)}\n`));
      md += "\n";
    }

    if (item.risks.length > 0) {
      md += "**风险与缓解：**\n\n| 风险 | 缓解措施 |\n| --- | --- |\n";
      item.risks.forEach((r) => {
        md += `| ${escapeCell(r.risk)} | ${escapeCell(r.mitigation)} |\n`;
      });
      md += "\n";
    }

    if (item.references.length > 0) {
      md += `**参考来源：**\n\n`;
      item.references.forEach((ref) => (md += `- [${escapeCell(ref.title)}](${ref.url})\n`));
      md += "\n";
    }

    md += `**研究背景：** ${escapeCell(item.researchContext)}\n\n`;
    md += divider();
  });

  return md;
}

export function exportReportMarkdown(doc: ReportDocument): void {
  downloadBlob([renderReportMarkdown(doc)], "text/markdown;charset=utf-8", buildFilename("research-report", "md"));
}

export function exportChecklistMarkdown(doc: ChecklistDocument): void {
  downloadBlob([renderChecklistMarkdown(doc)], "text/markdown;charset=utf-8", buildFilename("action-items-checklist", "md"));
}
