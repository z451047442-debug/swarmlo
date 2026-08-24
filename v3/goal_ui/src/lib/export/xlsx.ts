// 行动清单 → Excel：每个行动项一行，表头加粗+底色，长文本自动换行，冻结表头。

import ExcelJS from "exceljs";
import type { ChecklistDocument } from "./types";
import { downloadBlob, buildFilename } from "./download";

const COLUMNS: { key: string; header: string; width: number }[] = [
  { key: "index", header: "序号", width: 6 },
  { key: "title", header: "行动项标题", width: 28 },
  { key: "priority", header: "优先级", width: 10 },
  { key: "timeline", header: "时间线", width: 14 },
  { key: "description", header: "说明", width: 40 },
  { key: "timelineDetails", header: "时间拆解", width: 30 },
  { key: "budget", header: "预算", width: 14 },
  { key: "team", header: "团队", width: 14 },
  { key: "tools", header: "工具", width: 24 },
  { key: "metrics", header: "成功指标", width: 30 },
  { key: "risks", header: "风险与缓解", width: 36 },
  { key: "references", header: "参考来源", width: 24 },
  { key: "researchContext", header: "研究背景", width: 32 },
];

export async function exportChecklistXlsx(doc: ChecklistDocument): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Swarmlo Research";
  const sheet = workbook.addWorksheet("行动清单");

  sheet.columns = COLUMNS.map((c) => ({
    key: c.key,
    header: c.header,
    width: c.width,
  }));

  // 表头样式：加粗 + 浅灰底色 + 边框
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, name: "Microsoft YaHei" };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  doc.items.forEach((item, idx) => {
    sheet.addRow({
      index: idx + 1,
      title: item.title,
      priority: item.priority,
      timeline: item.timeline,
      description: item.description,
      timelineDetails: item.timelineDetails,
      budget: item.resources.budget ?? "",
      team: item.resources.team ?? "",
      tools: item.resources.tools.join("、"),
      metrics: item.metrics.join("\n"),
      risks: item.risks.map((r) => `风险：${r.risk}\n缓解：${r.mitigation}`).join("\n\n"),
      references: item.references.map((ref) => `${ref.title}\n${ref.url}`).join("\n\n"),
      researchContext: item.researchContext,
    });
  });

  // 数据行样式：换行 + 顶部对齐 + 边框
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.font = { name: "Microsoft YaHei", size: 10 };
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `M${doc.items.length + 1}` };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob([buffer], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buildFilename("action-items-checklist", "xlsx"));
}
