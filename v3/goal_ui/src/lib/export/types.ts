// 导出系统统一数据模型：与具体文件格式解耦，
// 各格式生成器（markdown/docx/xlsx/pdf）消费同一份文档结构。

export interface ExportFinding {
  title: string;
  content: string;
  source?: string;
  confidence?: number;
}

export interface ExportStep {
  title: string;
  description: string;
  findings: ExportFinding[];
}

export interface ExportCitation {
  title: string;
  source: string;
}

export interface ReportDocument {
  goal: string;
  generatedAt: string;
  totalSteps: number;
  dataPoints: number;
  executiveSummary: string;
  steps: ExportStep[];
  citations: ExportCitation[];
}

export interface ExportActionItem {
  title: string;
  timeline: string;
  priority: string;
  description: string;
  timelineDetails: string;
  resources: {
    budget?: string;
    team?: string;
    tools: string[];
  };
  metrics: string[];
  risks: {
    risk: string;
    mitigation: string;
  }[];
  references: {
    title: string;
    url: string;
  }[];
  researchContext: string;
}

export interface ChecklistDocument {
  goal: string;
  generatedAt: string;
  totalSteps: number;
  dataPoints: number;
  items: ExportActionItem[];
}

export type ExportFormat = "md" | "docx" | "xlsx" | "pdf";
