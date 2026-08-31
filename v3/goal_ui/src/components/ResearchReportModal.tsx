import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  FileText,
  Lightbulb,
  BookOpen,
  TrendingUp,
  Download,
  RefreshCw,
  Share2,
  ChevronRight,
  CheckCircle2,
  Target,
  Brain,
  Search,
  FileSearch,
  GitBranch,
  Sparkles,
  ChevronDown,
  Clock,
  Users,
  DollarSign,
  BarChart3,
  AlertTriangle,
  ExternalLink,
  FileDown,
  CheckSquare,
} from "lucide-react";
import { Step } from "@/lib/goapPlanner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChecklistDocument, ExportFormat, ReportDocument } from "@/lib/export/types";

interface ResearchReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userGoal: string;
  steps: Step[];
  onRevise: () => void;
  primaryColor?: string;
  accentColor?: string;
  successColor?: string;
}

interface ActionItem {
  id: string;
  title: string;
  description: string;
  timeline: string;
  timelineDetails: string;
  priority: "High" | "Medium" | "Low";
  resources: {
    budget?: string;
    team?: string;
    tools?: string[];
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
  // Optional interpolation vars for fallback items whose fields store i18n keys
  titleVars?: Record<string, string | number>;
  descriptionVars?: Record<string, string | number>;
  researchContextVars?: Record<string, string | number>;
}

export const ResearchReportModal = ({
  open,
  onOpenChange,
  userGoal,
  steps,
  onRevise,
  primaryColor = "#6b7280",
  accentColor = "#22c55e",
  successColor = "#22c55e",
}: ResearchReportModalProps) => {
  const { t, lang } = useI18n();
  const [activeTab, setActiveTab] = useState("summary");
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [aiActionItems, setAiActionItems] = useState<ActionItem[]>([]);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isGeneratingActions, setIsGeneratingActions] = useState(false);

  // Generate AI-powered action items and summary on mount
  useEffect(() => {
    if (open && steps.length > 0 && aiActionItems.length === 0) {
      generateAIContent();
    }
  }, [open, steps]);

  const generateAIContent = async () => {
    setIsGeneratingActions(true);
    
    try {
      // Build research context from all steps
      const researchContext = steps.map(step => ({
        stepTitle: step.title,
        findings: step.data.map(item => {
          const details = item.details as any;
          return {
            title: item.text,
            content: details?.objective || details?.content || item.text,
            source: details?.source
          };
        })
      }));

      // Call AI to generate contextual action items
      const { data, error } = await supabase.functions.invoke('generate-action-items', {
        body: {
          goal: userGoal,
          researchContext: researchContext,
          totalSteps: steps.length,
          totalDataPoints: steps.reduce((sum, step) => sum + step.data.length, 0),
          language: lang
        }
      });

      if (!error && data) {
        if (data.actionItems) {
          setAiActionItems(data.actionItems);
        }
        if (data.summary) {
          setAiSummary(data.summary);
        }
      }
    } catch (err) {
      console.error('Error generating AI content:', err);
    } finally {
      setIsGeneratingActions(false);
    }
  };

  // Extract all research items with their sources as citations
  const allCitations = steps.flatMap(step => 
    step.data.map(item => {
      const details = item.details as any;
      return {
        title: item.text,
        source: details?.source || 'Research Analysis',
        content: details?.objective || details?.content || item.text
      };
    })
  ).filter(item => item.source && item.source !== 'Research Analysis');

  const allSources = new Set(allCitations.map(item => item.source).filter(Boolean));
  const totalDataPoints = steps.reduce((sum, step) => sum + step.data.length, 0);

  // Fallback action items if AI generation fails.
  // String fields store i18n keys ("report.faN.*") and are translated via
  // translateItem() at render time, so the module-level data stays language-agnostic.
  const generateActionItems = (): ActionItem[] => {
    const domain = userGoal.toLowerCase();
    const isQuantum = domain.includes('quantum');
    const isAI = domain.includes('ai') || domain.includes('artificial intelligence');
    const isBlockchain = domain.includes('blockchain');
    const isSustainability = domain.includes('sustainability') || domain.includes('green') || domain.includes('climate');

    // Extract key insights from research data
    const keyInsights = steps.flatMap(step =>
      step.data.map(item => item.text)
    ).slice(0, 5);

    const actionItems: ActionItem[] = [];

    // Action 1: Pilot/Proof of Concept
    actionItems.push({
      id: "1",
      title: "report.fa1.title",
      titleVars: { topic: steps[0]?.title || t("report.fa1.initialResearch") },
      description: "report.fa1.description",
      descriptionVars: keyInsights[0] ? { focus: t("report.fa1.focusOn", { insight: keyInsights[0] }) } : undefined,
      timeline: "report.fa1.timeline",
      timelineDetails: "report.fa1.timelineDetails",
      priority: "High",
      resources: {
        budget: "report.fa1.budget",
        team: "report.fa1.team",
        tools: isQuantum ? ["report.fa1.tools.quantumSimulator", "report.fa1.tools.qpuAccess", "report.fa1.tools.analysisToolkit"] :
               isAI ? ["report.fa1.tools.mlFramework", "report.fa1.tools.gpuCompute", "report.fa1.tools.dataPipeline"] :
               isBlockchain ? ["report.fa1.tools.testNetwork", "report.fa1.tools.smartContract", "report.fa1.tools.analyticsPlatform"] :
               ["report.fa1.tools.projectMgmt", "report.fa1.tools.analyticsTools", "report.fa1.tools.collabPlatform"]
      },
      metrics: [
        "report.fa1.metric.pilotSuccess",
        "report.fa1.metric.timeToFirstResult",
        "report.fa1.metric.costPerTransaction",
        "report.fa1.metric.userSatisfaction",
        "report.fa1.metric.techFeasibility"
      ],
      risks: [
        {
          risk: "report.fa1.risk.buyIn",
          mitigation: "report.fa1.mitigation.buyIn"
        },
        {
          risk: "report.fa1.risk.techChallenges",
          mitigation: "report.fa1.mitigation.techChallenges"
        },
        {
          risk: "report.fa1.risk.resourceConstraints",
          mitigation: "report.fa1.mitigation.resourceConstraints"
        }
      ],
      references: [
        { title: "report.fa1.ref.pilotBestPractices", url: "https://www.pmi.org/learning/library/pilot-project-best-practices-6498" },
        { title: "report.fa1.ref.measuringPilotSuccess", url: "https://hbr.org/2018/11/how-to-design-a-pilot-study" }
      ],
      researchContext: "report.fa1.researchContext",
      researchContextVars: { goal: userGoal, steps: steps.length }
    });

    // Action 2: Scale Implementation
    actionItems.push({
      id: "2",
      title: "report.fa2.title",
      description: "report.fa2.description",
      descriptionVars: keyInsights[1] ? { leverage: t("report.fa2.leverage", { insight: keyInsights[1] }) } : undefined,
      timeline: "report.fa2.timeline",
      timelineDetails: "report.fa2.timelineDetails",
      priority: "High",
      resources: {
        budget: "report.fa2.budget",
        team: "report.fa2.team",
        tools: isQuantum ? ["report.fa2.tools.productionQpu", "report.fa2.tools.errorCorrection", "report.fa2.tools.monitoringSuite", "report.fa2.tools.integrationMiddleware"] :
               isAI ? ["report.fa2.tools.mlInfrastructure", "report.fa2.tools.modelRegistry", "report.fa2.tools.featureStore", "report.fa2.tools.monitoringTools"] :
               isBlockchain ? ["report.fa2.tools.mainnet", "report.fa2.tools.securityAudit", "report.fa2.tools.nodeInfrastructure", "report.fa2.tools.walletIntegration"] :
               ["report.fa2.tools.cicd", "report.fa2.tools.prodInfrastructure", "report.fa2.tools.monitoringStack", "report.fa2.tools.securityTools"]
      },
      metrics: [
        "report.fa2.metric.uptime",
        "report.fa2.metric.deploymentVelocity",
        "report.fa2.metric.errorRate",
        "report.fa2.metric.costEfficiency",
        "report.fa2.metric.adoptionRate",
        "report.fa2.metric.roiTimeline"
      ],
      risks: [
        {
          risk: "report.fa2.risk.productionIssues",
          mitigation: "report.fa2.mitigation.productionIssues"
        },
        {
          risk: "report.fa2.risk.scalingCosts",
          mitigation: "report.fa2.mitigation.scalingCosts"
        },
        {
          risk: "report.fa2.risk.userResistance",
          mitigation: "report.fa2.mitigation.userResistance"
        },
        {
          risk: "report.fa2.risk.legacyIntegration",
          mitigation: "report.fa2.mitigation.legacyIntegration"
        }
      ],
      references: [
        { title: "report.fa2.ref.scalingBestPractices", url: "https://aws.amazon.com/architecture/well-architected/" },
        { title: "report.fa2.ref.productionReadiness", url: "https://www.atlassian.com/incident-management/devops/production-ready" }
      ],
      researchContext: "report.fa2.researchContext",
      researchContextVars: { dataPoints: totalDataPoints }
    });

    // Action 3: Optimization & Enhancement
    actionItems.push({
      id: "3",
      title: "report.fa3.title",
      description: "report.fa3.description",
      descriptionVars: keyInsights[2] ? { applyFinding: t("report.fa3.applyFinding", { insight: keyInsights[2] }) } : undefined,
      timeline: "report.fa3.timeline",
      timelineDetails: "report.fa3.timelineDetails",
      priority: "Medium",
      resources: {
        budget: "report.fa3.budget",
        team: "report.fa3.team",
        tools: ["report.fa3.tools.abTesting", "report.fa3.tools.analyticsSuite", "report.fa3.tools.perfMonitoring", "report.fa3.tools.userFeedback", "report.fa3.tools.dataViz"]
      },
      metrics: [
        "report.fa3.metric.perfImprovement",
        "report.fa3.metric.engagementGrowth",
        "report.fa3.metric.costReduction",
        "report.fa3.metric.featureAdoption",
        "report.fa3.metric.customerSatisfaction",
        "report.fa3.metric.mttr"
      ],
      risks: [
        {
          risk: "report.fa3.risk.regressions",
          mitigation: "report.fa3.mitigation.regressions"
        },
        {
          risk: "report.fa3.risk.diminishingReturns",
          mitigation: "report.fa3.mitigation.diminishingReturns"
        },
        {
          risk: "report.fa3.risk.teamBurnout",
          mitigation: "report.fa3.mitigation.teamBurnout"
        }
      ],
      references: [
        { title: "report.fa3.ref.continuousImprovement", url: "https://www.lean.org/lexicon-terms/continuous-improvement/" },
        { title: "report.fa3.ref.dataDriven", url: "https://hbr.org/2012/09/big-data-the-management-revolution" }
      ],
      researchContext: "report.fa3.researchContext"
    });

    // Action 4: Knowledge Sharing & Scaling
    actionItems.push({
      id: "4",
      title: "report.fa4.title",
      description: "report.fa4.description",
      timeline: "report.fa4.timeline",
      timelineDetails: "report.fa4.timelineDetails",
      priority: "Medium",
      resources: {
        budget: "report.fa4.budget",
        team: "report.fa4.team",
        tools: ["report.fa4.tools.docsPlatform", "report.fa4.tools.lms", "report.fa4.tools.videoRecording", "report.fa4.tools.knowledgeBase", "report.fa4.tools.communityForum"]
      },
      metrics: [
        "report.fa4.metric.docCompleteness",
        "report.fa4.metric.trainingCompletion",
        "report.fa4.metric.kbEngagement",
        "report.fa4.metric.supportTickets",
        "report.fa4.metric.crossTeamAdoption",
        "report.fa4.metric.onboardingTime"
      ],
      risks: [
        {
          risk: "report.fa4.risk.outdatedDocs",
          mitigation: "report.fa4.mitigation.outdatedDocs"
        },
        {
          risk: "report.fa4.risk.lowEngagement",
          mitigation: "report.fa4.mitigation.lowEngagement"
        },
        {
          risk: "report.fa4.risk.knowledgeSilos",
          mitigation: "report.fa4.mitigation.knowledgeSilos"
        }
      ],
      references: [
        { title: "report.fa4.ref.docsBestPractices", url: "https://documentation.divio.com/" },
        { title: "report.fa4.ref.knowledgeManagement", url: "https://www.mckinsey.com/capabilities/people-and-organizational-performance/our-insights/building-organizational-capabilities-knowledge-management" }
      ],
      researchContext: "report.fa4.researchContext",
      researchContextVars: { steps: steps.length }
    });

    return actionItems;
  };

  const actionItems = aiActionItems.length > 0 ? aiActionItems : generateActionItems();

  // Fallback items store i18n keys ("report.*") in their string fields; AI-generated
  // items carry plain strings. Translate keys, pass strings through untouched.
  const translateItem = (value: string, vars?: Record<string, string | number>) =>
    value.startsWith("report.") ? t(value, vars) : value;

  const toggleAction = (id: string) => {
    setExpandedActions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 构建与格式无关的统一文档模型，交给 src/lib/export/ 各格式生成器
  const buildReportDoc = (): ReportDocument => ({
    goal: userGoal,
    generatedAt: new Date().toLocaleString(),
    totalSteps: steps.length,
    dataPoints: totalDataPoints,
    executiveSummary: aiSummary || t("report.export.reportIntro", { goal: userGoal, steps: steps.length }),
    steps: steps.map((step) => ({
      title: step.title,
      description: step.description,
      findings: step.data.map((item) => {
        const details = item.details as any;
        return {
          title: item.text,
          content: details?.objective || details?.content || item.text,
          source: details?.source,
        };
      }),
    })),
    citations: allCitations.map((c) => ({ title: c.title, source: c.source })),
  });

  const buildChecklistDoc = (): ChecklistDocument => ({
    goal: userGoal,
    generatedAt: new Date().toLocaleString(),
    totalSteps: steps.length,
    dataPoints: totalDataPoints,
    items: actionItems.map((item) => ({
      title: translateItem(item.title, item.titleVars),
      timeline: translateItem(item.timeline),
      priority: t("report.priority." + item.priority.toLowerCase()),
      description: translateItem(item.description, item.descriptionVars),
      timelineDetails: translateItem(item.timelineDetails),
      resources: {
        budget: item.resources.budget ? translateItem(item.resources.budget) : undefined,
        team: item.resources.team ? translateItem(item.resources.team) : undefined,
        tools: (item.resources.tools ?? []).map((tool) => translateItem(tool)),
      },
      metrics: item.metrics.map((m) => translateItem(m)),
      risks: item.risks.map((r) => ({ risk: translateItem(r.risk), mitigation: translateItem(r.mitigation) })),
      references: item.references.map((ref) => ({ title: translateItem(ref.title), url: ref.url })),
      researchContext: translateItem(item.researchContext, item.researchContextVars),
    })),
  });

  // 生成库按需动态加载（code-split），只在点击导出时拉取对应 chunk
  const handleExportReport = async (format: ExportFormat) => {
    const doc = buildReportDoc();
    if (format === "md") {
      const { exportReportMarkdown } = await import("@/lib/export/markdown");
      exportReportMarkdown(doc);
    } else if (format === "docx") {
      const { exportReportDocx } = await import("@/lib/export/docx");
      await exportReportDocx(doc);
    } else if (format === "pdf") {
      const { exportReportPdf } = await import("@/lib/export/pdf");
      await exportReportPdf(doc);
    }
  };

  const handleExportChecklist = async (format: ExportFormat) => {
    const doc = buildChecklistDoc();
    if (format === "md") {
      const { exportChecklistMarkdown } = await import("@/lib/export/markdown");
      exportChecklistMarkdown(doc);
    } else if (format === "docx") {
      const { exportChecklistDocx } = await import("@/lib/export/docx");
      await exportChecklistDocx(doc);
    } else if (format === "xlsx") {
      const { exportChecklistXlsx } = await import("@/lib/export/xlsx");
      await exportChecklistXlsx(doc);
    }
  };

  const handleShare = async () => {
    const shareText = `${userGoal}\n\n${window.location.href}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: t("report.modal.title"),
          text: shareText,
        });
      } catch (err) {
        // 用户取消分享不算错误
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Share failed:", err);
        }
      }
      return;
    }
    // 不支持 Web Share API 时回退到复制链接
    try {
      await navigator.clipboard.writeText(shareText);
    } catch (err) {
      console.warn("Copy to clipboard failed:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold mb-2">
                {t("report.modal.title")}
              </DialogTitle>
              <DialogDescription className="text-base">
                {userGoal}
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="w-4 h-4" />
                    {t("report.modal.export")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => handleExportReport("md")}>
                    {t("report.export.formatMd")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleExportReport("docx")}>
                    {t("report.export.formatDocx")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleExportReport("pdf")}>
                    {t("report.export.formatPdf")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                onClick={onRevise}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {t("report.modal.revise")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleShare}
              >
                <Share2 className="w-4 h-4" />
                {t("report.modal.share")}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          // Auto-scroll to top when tab changes
          const scrollArea = document.querySelector('[data-radix-scroll-area-viewport]');
          if (scrollArea) {
            scrollArea.scrollTop = 0;
          }
        }} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-4 shrink-0">
            <TabsTrigger value="summary" className="gap-2">
              <FileText className="w-4 h-4" />
              {t("report.tab.summary")}
            </TabsTrigger>
            <TabsTrigger value="findings" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              {t("report.tab.findings")}
            </TabsTrigger>
            <TabsTrigger value="methodology" className="gap-2">
              <Target className="w-4 h-4" />
              {t("report.tab.methodology")}
            </TabsTrigger>
            <TabsTrigger value="citations" className="gap-2">
              <BookOpen className="w-4 h-4" />
              {t("report.tab.citations", { count: allCitations.length })}
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              {t("report.tab.nextSteps")}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 min-h-0">
            {/* Summary Tab */}
            <TabsContent value="summary" className="mt-4 space-y-6 pb-6">
              <div className="rounded-lg border p-6" style={{ borderColor: `${accentColor}4d`, backgroundColor: `${accentColor}0d` }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: `${accentColor}33` }}>
                    <Sparkles className="w-5 h-5" style={{ color: accentColor }} />
                  </div>
                  <h3 className="text-lg font-semibold">{t("report.summary.title")}</h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {aiSummary || t("report.summary.fallback", { steps: steps.length, goal: userGoal })}
                </p>
                {isGeneratingActions && (
                  <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }}></div>
                    {t("report.summary.generating")}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg border p-4">
                  <div className="text-2xl font-bold mb-1">{steps.length}</div>
                  <div className="text-xs text-muted-foreground">{t("report.stats.steps")}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-2xl font-bold mb-1">{totalDataPoints}</div>
                  <div className="text-xs text-muted-foreground">{t("report.stats.dataPoints")}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-2xl font-bold mb-1" style={{ color: accentColor }}>94%</div>
                  <div className="text-xs text-muted-foreground">{t("report.stats.confidence")}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-2xl font-bold mb-1">{allSources.size}</div>
                  <div className="text-xs text-muted-foreground">{t("report.stats.sources")}</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: successColor }} />
                  {t("report.summary.completedSteps")}
                </h4>
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                    <div className="p-2 rounded" style={{ backgroundColor: `${primaryColor}1a` }}>
                      {step.icon && <step.icon className="w-4 h-4" style={{ color: primaryColor }} />}
                    </div>
                    <div className="flex-1">
                      <h5 className="font-medium text-sm mb-1">{step.title}</h5>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                    <Badge variant="outline" className="text-xs" style={{ borderColor: successColor, color: successColor }}>
                      {t("report.summary.items", { count: step.data.length })}
                    </Badge>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Key Findings Tab */}
            <TabsContent value="findings" className="mt-4 space-y-4 pb-6">
              <div className="rounded-lg border p-4 bg-muted/30">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" style={{ color: accentColor }} />
                  {t("report.findings.title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("report.findings.subtitle")}
                </p>
              </div>

              {steps.map((step, stepIdx) => (
                <div key={stepIdx} className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2 sticky top-0 bg-background py-2">
                    <step.icon className="w-4 h-4" style={{ color: primaryColor }} />
                    {step.title}
                  </h4>
                  {step.data.map((item, itemIdx) => {
                    const details = item.details as any;
                    return (
                      <div key={itemIdx} className="rounded-lg border p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <h5 className="font-medium text-sm flex-1">{item.text}</h5>
                          {details?.confidence && (
                            <Badge variant="secondary" className="text-xs">
                              {t("report.findings.confidence", { percent: Math.round(details.confidence * 100) })}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {details?.objective || item.text}
                        </p>
                        {details?.source && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <BookOpen className="w-3 h-3" />
                            {t("report.findings.source", { source: details.source })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </TabsContent>

            {/* Methodology Tab */}
            <TabsContent value="methodology" className="mt-4 space-y-4 pb-6">
              <div className="rounded-lg border p-4 bg-muted/30">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4" style={{ color: primaryColor }} />
                  {t("report.methodology.title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("report.methodology.subtitle")}
                </p>
              </div>

              <div className="space-y-3">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                        style={{ backgroundColor: `${successColor}33`, color: successColor }}
                      >
                        {idx + 1}
                      </div>
                      {idx < steps.length - 1 && (
                        <div className="w-0.5 flex-1 my-2" style={{ backgroundColor: `${successColor}33` }} />
                      )}
                    </div>
                    <div className="flex-1 pb-6">
                      <div className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          {step.icon && <step.icon className="w-4 h-4" style={{ color: primaryColor }} />}
                          <h4 className="font-semibold text-sm">{step.title}</h4>
                          <CheckCircle2 className="w-4 h-4 ml-auto" style={{ color: successColor }} />
                        </div>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {step.data.slice(0, 3).map((item, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {item.text}
                            </Badge>
                          ))}
                          {step.data.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              {t("report.methodology.more", { count: step.data.length - 3 })}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Citations Tab */}
            <TabsContent value="citations" className="mt-4 space-y-4 pb-6">
              <div className="rounded-lg border p-4 bg-muted/30">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" style={{ color: primaryColor }} />
                  {t("report.citations.title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("report.citations.subtitle")}
                </p>
              </div>

              {allCitations.length > 0 ? (
                <div className="space-y-3">
                  {allCitations.map((citation, idx) => (
                    <div key={idx} className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="text-sm font-semibold text-muted-foreground min-w-[32px]">[{idx + 1}]</div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-relaxed">{citation.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <BookOpen className="w-3 h-3" />
                            <span className="font-medium">{citation.source}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t("report.citations.empty")}
                </div>
              )}
            </TabsContent>

            {/* Next Steps Tab */}
            <TabsContent value="insights" className="mt-4 space-y-4 pb-6">
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" style={{ color: accentColor }} />
                    <h3 className="font-semibold">{t("report.insights.title")}</h3>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 text-xs"
                      >
                        <FileDown className="w-3 h-3" />
                        {t("report.insights.exportChecklist")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleExportChecklist("md")}>
                        {t("report.export.formatMd")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleExportChecklist("xlsx")}>
                        {t("report.export.formatXlsx")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleExportChecklist("docx")}>
                        {t("report.export.formatDocx")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isGeneratingActions
                    ? t("report.insights.generating")
                    : t("report.insights.subtitle")}
                </p>
                {isGeneratingActions && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }}></div>
                    {t("report.insights.analyzing")}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {actionItems.map((action) => (
                  <Collapsible
                    key={action.id}
                    open={expandedActions.has(action.id)}
                    onOpenChange={() => toggleAction(action.id)}
                  >
                    <div className="rounded-lg border">
                      <CollapsibleTrigger className="w-full p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 text-left">
                            <ChevronDown 
                              className={`w-4 h-4 mt-0.5 transition-transform flex-shrink-0 ${
                                expandedActions.has(action.id) ? 'rotate-180' : ''
                              }`}
                              style={{ color: accentColor }}
                            />
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className="font-medium text-sm">{translateItem(action.title, action.titleVars)}</h5>
                                <Badge
                                  variant={action.priority === "High" ? "default" : action.priority === "Medium" ? "secondary" : "outline"}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {t("report.priority." + action.priority.toLowerCase())}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{translateItem(action.timeline)}</span>
                                </div>
                                {action.resources.budget && (
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" />
                                    <span className="hidden sm:inline">{translateItem(action.resources.budget)}</span>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {translateItem(action.description, action.descriptionVars)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-4 pb-4 space-y-4 border-t pt-4">
                          {/* Research Context */}
                          <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: `${primaryColor}0d` }}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Brain className="w-3 h-3" style={{ color: primaryColor }} />
                              <span className="font-medium">{t("report.insights.researchContext")}</span>
                            </div>
                            <p className="text-muted-foreground">{translateItem(action.researchContext, action.researchContextVars)}</p>
                          </div>

                          {/* Timeline Details */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Clock className="w-3 h-3" style={{ color: accentColor }} />
                              <h6 className="text-xs font-semibold">{t("report.insights.timelineBreakdown")}</h6>
                            </div>
                            <p className="text-xs text-muted-foreground">{translateItem(action.timelineDetails)}</p>
                          </div>

                          {/* Resources */}
                          <div>
                            <h6 className="text-xs font-semibold mb-2">{t("report.insights.resources")}</h6>
                            <div className="space-y-2">
                              {action.resources.budget && (
                                <div className="flex items-start gap-2 text-xs">
                                  <DollarSign className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: accentColor }} />
                                  <div>
                                    <span className="font-medium">{t("report.insights.budget")}</span>
                                    <span className="text-muted-foreground ml-1">{translateItem(action.resources.budget)}</span>
                                  </div>
                                </div>
                              )}
                              {action.resources.team && (
                                <div className="flex items-start gap-2 text-xs">
                                  <Users className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: accentColor }} />
                                  <div>
                                    <span className="font-medium">{t("report.insights.team")}</span>
                                    <span className="text-muted-foreground ml-1">{translateItem(action.resources.team)}</span>
                                  </div>
                                </div>
                              )}
                              {action.resources.tools && action.resources.tools.length > 0 && (
                                <div className="flex items-start gap-2 text-xs">
                                  <Target className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: accentColor }} />
                                  <div className="flex-1">
                                    <span className="font-medium">{t("report.insights.tools")}</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {action.resources.tools.map((tool, idx) => (
                                        <span key={idx} className="bg-muted px-2 py-0.5 rounded text-[10px]">
                                          {translateItem(tool)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Success Metrics */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <BarChart3 className="w-3 h-3" style={{ color: accentColor }} />
                              <h6 className="text-xs font-semibold">{t("report.insights.successMetrics")}</h6>
                            </div>
                            <ul className="space-y-1">
                              {action.metrics.map((metric, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-xs">
                                  <CheckSquare className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                                  <span className="text-muted-foreground">{translateItem(metric)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Risks & Mitigation */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <AlertTriangle className="w-3 h-3 text-orange-500" />
                              <h6 className="text-xs font-semibold">{t("report.insights.risks")}</h6>
                            </div>
                            <div className="space-y-2">
                              {action.risks.map((risk, idx) => (
                                <div key={idx} className="rounded-lg bg-muted/50 p-2 text-xs">
                                  <div className="flex items-start gap-1.5 mb-1">
                                    <span className="font-medium text-orange-600">⚠</span>
                                    <span className="font-medium">{translateItem(risk.risk)}</span>
                                  </div>
                                  <div className="flex items-start gap-1.5 ml-4">
                                    <span className="text-green-600">→</span>
                                    <span className="text-muted-foreground">{translateItem(risk.mitigation)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* References */}
                          {action.references.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <ExternalLink className="w-3 h-3" style={{ color: accentColor }} />
                                <h6 className="text-xs font-semibold">{t("report.insights.references")}</h6>
                              </div>
                              <div className="space-y-1">
                                {action.references.map((ref, idx) => (
                                  <a
                                    key={idx}
                                    href={ref.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-xs hover:underline group"
                                    style={{ color: primaryColor }}
                                  >
                                    <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                                    <span>{translateItem(ref.title)}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>

              <div className="rounded-lg border p-4 mt-6" style={{ borderColor: `${successColor}4d`, backgroundColor: `${successColor}0d` }}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: successColor }} />
                  <h4 className="font-semibold text-sm">{t("report.insights.ready")}</h4>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("report.insights.readyDescription", { steps: steps.length, dataPoints: totalDataPoints })}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {t("report.insights.actionItems", { count: actionItems.length })}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Clock className="w-3 h-3" />
                    {t("report.insights.startIn", { timeline: actionItems[0] ? translateItem(actionItems[0].timeline) : "" })}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Target className="w-3 h-3" />
                    {t("report.insights.successMetricsCount", { count: actionItems.reduce((sum, item) => sum + item.metrics.length, 0) })}
                  </Badge>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
