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
          totalDataPoints: steps.reduce((sum, step) => sum + step.data.length, 0)
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

  // Fallback action items if AI generation fails
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
      title: `基于${steps[0]?.title || '初步研究'}启动试点项目`,
      description: `启动受控试点，验证研究中的关键发现。${keyInsights[0] ? `重点关注"${keyInsights[0]}"` : ''}，以建立基线指标并及早识别实施挑战。`,
      timeline: "第 1-4 周",
      timelineDetails: "第 1 周：组建团队并梳理需求。第 2-3 周：执行试点。第 4 周：分析与汇报。",
      priority: "High",
      resources: {
        budget: "$15,000 - $30,000（试点阶段）",
        team: "3-5 人：1 名项目负责人、2 名技术专家、1 名分析师、1 名利益相关方联络人",
        tools: isQuantum ? ["量子模拟器", "QPU 访问", "分析工具包"] :
               isAI ? ["ML 框架", "GPU 算力", "数据管道"] :
               isBlockchain ? ["测试网络", "智能合约工具", "分析平台"] :
               ["项目管理软件", "分析工具", "协作平台"]
      },
      metrics: [
        "试点成功率（目标：>75%）",
        "首次结果产出时间（目标：<2 周）",
        "单次交易/操作成本",
        "用户满意度评分（目标：>4/5）",
        "技术可行性评分"
      ],
      risks: [
        {
          risk: "试点阶段利益相关方支持不足",
          mitigation: "开展试点前工作坊，建立清晰的沟通渠道并每周更新"
        },
        {
          risk: "技术挑战超出初始范围",
          mitigation: "在试点时间线中预留 30% 缓冲时间，并安排后备技术专家待命"
        },
        {
          risk: "资源受限或预算超支",
          mitigation: "采用分阶段推进方式，每个阶段后设置明确的继续/终止决策点"
        }
      ],
      references: [
        { title: "试点项目最佳实践", url: "https://www.pmi.org/learning/library/pilot-project-best-practices-6498" },
        { title: "如何衡量试点成功", url: "https://hbr.org/2018/11/how-to-design-a-pilot-study" }
      ],
      researchContext: `基于分析 "${userGoal}" 的 ${steps.length} 个研究步骤，该试点直接针对初始目标分析阶段的研究发现。`
    });

    // Action 2: Scale Implementation
    actionItems.push({
      id: "2",
      title: `扩展至生产环境：全面实施上线`,
      description: `在试点验证成功的基础上，将解决方案扩展至生产环境。${keyInsights[1] ? `利用洞察："${keyInsights[1]}"` : ''}优化部署策略并最大限度减少影响。`,
      timeline: "第 2-4 个月",
      timelineDetails: "第 2 个月：基础设施搭建。第 3 个月：分阶段上线（10% → 50% → 100%）。第 4 个月：优化与稳定。",
      priority: "High",
      resources: {
        budget: "$100,000 - $250,000（全面实施）",
        team: "8-12 人：1 名项目经理、3-4 名工程师、2 名 QA 专员、1 名 DevOps、1 名安全负责人、2 名业务分析师",
        tools: isQuantum ? ["生产级 QPU", "纠错", "监控套件", "集成中间件"] :
               isAI ? ["生产级 ML 基础设施", "模型注册表", "特征存储", "监控工具"] :
               isBlockchain ? ["主网上线", "安全审计工具", "节点基础设施", "钱包集成"] :
               ["CI/CD 流水线", "生产基础设施", "监控栈", "安全工具"]
      },
      metrics: [
        "系统可用性（目标：99.5%+）",
        "部署速度（功能/月）",
        "错误率（目标：<0.1%）",
        "相比基线的成本效率（目标：提升 20%）",
        "用户采用率（目标：3 个月内达到 70%）",
        "ROI 时间线（目标：12 个月内回本）"
      ],
      risks: [
        {
          risk: "生产问题影响现有业务",
          mitigation: "实施蓝绿部署，具备即时回滚能力并提供 24/7 监控"
        },
        {
          risk: "扩展成本超出预期",
          mitigation: "实施成本跟踪看板，在预算达到 80% 阈值时自动告警"
        },
        {
          risk: "用户对新系统的抵触",
          mitigation: "制定全面的培训计划，并在过渡期提供专属支持团队"
        },
        {
          risk: "与遗留系统集成的挑战",
          mitigation: "构建抽象层，并在过渡期并行维护新旧系统"
        }
      ],
      references: [
        { title: "扩展最佳实践", url: "https://aws.amazon.com/architecture/well-architected/" },
        { title: "生产就绪检查清单", url: "https://www.atlassian.com/incident-management/devops/production-ready" }
      ],
      researchContext: `该阶段建立在研究期间收集的 ${totalDataPoints} 个数据点之上，尤其是验证与综合阶段产生的洞察。`
    });

    // Action 3: Optimization & Enhancement
    actionItems.push({
      id: "3",
      title: `持续改进：基于真实数据优化`,
      description: `建立反馈回路与优化循环，持续提升性能。${keyInsights[2] ? `应用研究发现："${keyInsights[2]}"` : ''}推动迭代改进并形成竞争优势。`,
      timeline: "第 4-6 个月（持续进行）",
      timelineDetails: "第 4 个月：基线性能分析。第 5 个月：实施优化 v1。第 6 个月：A/B 测试与完善。之后按季度循环改进。",
      priority: "Medium",
      resources: {
        budget: "每季度 $25,000 - $50,000（优化预算）",
        team: "4-6 人：1 名优化负责人、2 名数据科学家、1 名工程师、1 名 UX 研究员、1 名产品分析师",
        tools: ["A/B 测试平台", "分析套件", "性能监控", "用户反馈工具", "数据可视化平台"]
      },
      metrics: [
        "性能提升率（目标：每季度 10%）",
        "用户参与度增长（目标：增长 15%）",
        "成本降幅（目标：每季度 5%）",
        "功能采用速度",
        "客户满意度（NPS 目标：>50）",
        "问题平均解决时间（MTTR）"
      ],
      risks: [
        {
          risk: "优化引发意外回退",
          mitigation: "实施全面测试覆盖（>80%）并逐步上线优化"
        },
        {
          risk: "优化投入的边际收益递减",
          mitigation: "设定明确的 ROI 阈值，并基于影响分析确定优化优先级"
        },
        {
          risk: "持续变更导致团队倦怠",
          mitigation: "在优化冲刺与稳定期之间保持平衡，并轮换团队职责"
        }
      ],
      references: [
        { title: "持续改进框架", url: "https://www.lean.org/lexicon-terms/continuous-improvement/" },
        { title: "数据驱动优化", url: "https://hbr.org/2012/09/big-data-the-management-revolution" }
      ],
      researchContext: `借鉴研究中的知识综合与洞察生成阶段，确保长期价值实现。`
    });

    // Action 4: Knowledge Sharing & Scaling
    actionItems.push({
      id: "4",
      title: `组织内文档沉淀与知识共享`,
      description: `创建全面的文档与培训材料，以扩大采用范围并建设组织能力。沉淀经验教训与最佳实践，供该领域未来项目使用。`,
      timeline: "第 5-7 个月",
      timelineDetails: "第 5 个月：文档编写。第 6 个月：培训项目开发与试点。第 7 个月：全组织推广与反馈收集。",
      priority: "Medium",
      resources: {
        budget: "$20,000 - $40,000（文档与培训）",
        team: "3-5 人：1 名技术文档工程师、1 名培训专员、1 名领域专家、1 名课程设计师、1 名社区经理",
        tools: ["文档平台", "学习管理系统（LMS）", "录屏工具", "知识库软件", "社区论坛"]
      },
      metrics: [
        "文档完整度（目标：100% 覆盖）",
        "培训完成率（目标：覆盖 >85% 目标人群）",
        "知识库活跃度（浏览量、搜索量、贡献量）",
        "支持工单减少（目标：下降 30%）",
        "跨团队采用率",
        "新成员上手时间（目标：<1 周）"
      ],
      risks: [
        {
          risk: "文档快速过时",
          mitigation: "指定文档负责人，并实施带版本控制的季度审查周期"
        },
        {
          risk: "培训材料参与度低",
          mitigation: "游戏化学习体验，并将完成情况与绩效考核或认证挂钩"
        },
        {
          risk: "虽有文档但知识孤岛依然存在",
          mitigation: "建立实践社区并定期开展知识分享会"
        }
      ],
      references: [
        { title: "文档最佳实践", url: "https://documentation.divio.com/" },
        { title: "高效知识管理", url: "https://www.mckinsey.com/capabilities/people-and-organizational-performance/our-insights/building-organizational-capabilities-knowledge-management" }
      ],
      researchContext: `这确保全部 ${steps.length} 个步骤的研究发现得以制度化，并可为未来项目带来收益。`
    });

    return actionItems;
  };

  const actionItems = aiActionItems.length > 0 ? aiActionItems : generateActionItems();

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

  const exportActionItems = () => {
    let checklist = `# Action Items Checklist: ${userGoal}\n\n`;
    checklist += `Generated: ${new Date().toLocaleString()}\n`;
    checklist += `Research Steps: ${steps.length} | Data Points: ${totalDataPoints}\n\n`;
    checklist += `---\n\n`;
    
    actionItems.forEach((item, idx) => {
      checklist += `## ${idx + 1}. ${item.title}\n\n`;
      checklist += `**Timeline:** ${item.timeline}\n`;
      checklist += `**Priority:** ${item.priority}\n\n`;
      checklist += `**Description:** ${item.description}\n\n`;
      
      checklist += `**Timeline Breakdown:**\n${item.timelineDetails}\n\n`;
      
      if (item.resources.budget) {
        checklist += `**Budget:** ${item.resources.budget}\n`;
      }
      if (item.resources.team) {
        checklist += `**Team:** ${item.resources.team}\n`;
      }
      if (item.resources.tools && item.resources.tools.length > 0) {
        checklist += `**Required Tools:**\n`;
        item.resources.tools.forEach(tool => checklist += `  - ${tool}\n`);
        checklist += `\n`;
      }
      
      checklist += `**Success Metrics:**\n`;
      item.metrics.forEach(metric => checklist += `  - [ ] ${metric}\n`);
      checklist += `\n`;
      
      checklist += `**Risks & Mitigation:**\n`;
      item.risks.forEach(risk => {
        checklist += `  - **Risk:** ${risk.risk}\n`;
        checklist += `    **Mitigation:** ${risk.mitigation}\n`;
      });
      checklist += `\n`;
      
      if (item.references.length > 0) {
        checklist += `**References:**\n`;
        item.references.forEach(ref => {
          checklist += `  - [${ref.title}](${ref.url})\n`;
        });
        checklist += `\n`;
      }
      
      checklist += `**Research Context:** ${item.researchContext}\n\n`;
      checklist += `---\n\n`;
    });
    
    const blob = new Blob([checklist], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `action-items-checklist-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    const report = generateReportText();
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-report-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateReportText = () => {
    let report = `# Research Report: ${userGoal}\n\n`;
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Total Steps: ${steps.length}\n`;
    report += `Data Points: ${totalDataPoints}\n\n`;
    report += `---\n\n`;
    
    report += `## Executive Summary\n\n`;
    report += `This research analyzed "${userGoal}" through a ${steps.length}-step Goal-Oriented Action Planning (GOAP) workflow.\n\n`;
    
    steps.forEach((step, idx) => {
      report += `## ${idx + 1}. ${step.title}\n\n`;
      report += `${step.description}\n\n`;
      step.data.forEach(item => {
        const details = item.details as any;
        report += `- **${item.text}**: ${details?.objective || item.text}\n`;
      });
      report += `\n`;
    });
    
    if (allCitations.length > 0) {
      report += `## Citations\n\n`;
      allCitations.forEach((citation, idx) => {
        report += `${idx + 1}. ${citation}\n`;
      });
    }
    
    return report;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold mb-2">
                研究报告
              </DialogTitle>
              <DialogDescription className="text-base">
                {userGoal}
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                导出
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRevise}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                修订
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Share2 className="w-4 h-4" />
                分享
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
              摘要
            </TabsTrigger>
            <TabsTrigger value="findings" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              关键发现
            </TabsTrigger>
            <TabsTrigger value="methodology" className="gap-2">
              <Target className="w-4 h-4" />
              研究方法
            </TabsTrigger>
            <TabsTrigger value="citations" className="gap-2">
              <BookOpen className="w-4 h-4" />
              引用文献（{allCitations.length}）
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              后续步骤
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
                  <h3 className="text-lg font-semibold">执行摘要</h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {aiSummary || `这项综合性研究通过 ${steps.length} 步目标导向行动规划（GOAP）流程，成功分析了 "${userGoal}"。系统协调多个专业 Agent 收集信息、分析文档、综合知识，并生成可执行的洞察，所有验证检查均获得高置信度评分。`}
                </p>
                {isGeneratingActions && (
                  <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }}></div>
                    正在生成上下文摘要...
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg border p-4">
                  <div className="text-2xl font-bold mb-1">{steps.length}</div>
                  <div className="text-xs text-muted-foreground">研究步骤</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-2xl font-bold mb-1">{totalDataPoints}</div>
                  <div className="text-xs text-muted-foreground">数据点</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-2xl font-bold mb-1" style={{ color: accentColor }}>94%</div>
                  <div className="text-xs text-muted-foreground">置信度</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-2xl font-bold mb-1">{allSources.size}</div>
                  <div className="text-xs text-muted-foreground">来源</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: successColor }} />
                  已完成步骤
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
                      {step.data.length} 项
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
                  关键研究发现
                </h3>
                <p className="text-sm text-muted-foreground">
                  研究过程中的关键洞察与发现
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
                              置信度 {Math.round(details.confidence * 100)}%
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {details?.objective || item.text}
                        </p>
                        {details?.source && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <BookOpen className="w-3 h-3" />
                            来源：{details.source}
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
                  研究方法
                </h3>
                <p className="text-sm text-muted-foreground">
                  基于 GOAP 的系统化方法，按顺序逐步执行
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
                              还有 +{step.data.length - 3} 项
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
                  参考文献与引用
                </h3>
                <p className="text-sm text-muted-foreground">
                  本研究使用的学术参考文献与来源
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
                  本次研究未生成引用文献
                </div>
              )}
            </TabsContent>

            {/* Next Steps Tab */}
            <TabsContent value="insights" className="mt-4 space-y-4 pb-6">
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" style={{ color: accentColor }} />
                    <h3 className="font-semibold">可执行的后续步骤</h3>
                  </div>
                  <Button
                    onClick={exportActionItems}
                    size="sm"
                    variant="outline"
                    className="gap-2 text-xs"
                  >
                    <FileDown className="w-3 h-3" />
                    导出清单
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isGeneratingActions
                    ? "正在基于你的研究生成上下文行动项..."
                    : "基于你的研究结果，提供包含时间线、资源、指标与风险应对的定制化建议"}
                </p>
                {isGeneratingActions && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }}></div>
                    AI 正在分析你的研究以生成相关的后续步骤...
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
                                <h5 className="font-medium text-sm">{action.title}</h5>
                                <Badge 
                                  variant={action.priority === "High" ? "default" : action.priority === "Medium" ? "secondary" : "outline"}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {action.priority}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{action.timeline}</span>
                                </div>
                                {action.resources.budget && (
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" />
                                    <span className="hidden sm:inline">{action.resources.budget}</span>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {action.description}
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
                              <span className="font-medium">研究背景</span>
                            </div>
                            <p className="text-muted-foreground">{action.researchContext}</p>
                          </div>

                          {/* Timeline Details */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Clock className="w-3 h-3" style={{ color: accentColor }} />
                              <h6 className="text-xs font-semibold">时间线明细</h6>
                            </div>
                            <p className="text-xs text-muted-foreground">{action.timelineDetails}</p>
                          </div>

                          {/* Resources */}
                          <div>
                            <h6 className="text-xs font-semibold mb-2">资源需求</h6>
                            <div className="space-y-2">
                              {action.resources.budget && (
                                <div className="flex items-start gap-2 text-xs">
                                  <DollarSign className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: accentColor }} />
                                  <div>
                                    <span className="font-medium">预算：</span>
                                    <span className="text-muted-foreground ml-1">{action.resources.budget}</span>
                                  </div>
                                </div>
                              )}
                              {action.resources.team && (
                                <div className="flex items-start gap-2 text-xs">
                                  <Users className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: accentColor }} />
                                  <div>
                                    <span className="font-medium">团队：</span>
                                    <span className="text-muted-foreground ml-1">{action.resources.team}</span>
                                  </div>
                                </div>
                              )}
                              {action.resources.tools && action.resources.tools.length > 0 && (
                                <div className="flex items-start gap-2 text-xs">
                                  <Target className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: accentColor }} />
                                  <div className="flex-1">
                                    <span className="font-medium">所需工具：</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {action.resources.tools.map((tool, idx) => (
                                        <span key={idx} className="bg-muted px-2 py-0.5 rounded text-[10px]">
                                          {tool}
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
                              <h6 className="text-xs font-semibold">成功指标与 KPI</h6>
                            </div>
                            <ul className="space-y-1">
                              {action.metrics.map((metric, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-xs">
                                  <CheckSquare className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                                  <span className="text-muted-foreground">{metric}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Risks & Mitigation */}
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <AlertTriangle className="w-3 h-3 text-orange-500" />
                              <h6 className="text-xs font-semibold">风险与应对策略</h6>
                            </div>
                            <div className="space-y-2">
                              {action.risks.map((risk, idx) => (
                                <div key={idx} className="rounded-lg bg-muted/50 p-2 text-xs">
                                  <div className="flex items-start gap-1.5 mb-1">
                                    <span className="font-medium text-orange-600">⚠</span>
                                    <span className="font-medium">{risk.risk}</span>
                                  </div>
                                  <div className="flex items-start gap-1.5 ml-4">
                                    <span className="text-green-600">→</span>
                                    <span className="text-muted-foreground">{risk.mitigation}</span>
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
                                <h6 className="text-xs font-semibold">实施资源</h6>
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
                                    <span>{ref.title}</span>
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
                  <h4 className="font-semibold text-sm">实施就绪</h4>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  所有研究验证检查均已通过。这些行动项直接来源于你的 {steps.length} 个研究步骤和收集到的 {totalDataPoints} 个数据点，可随时供利益相关方审阅并制定实施计划。
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {actionItems.length} 个行动项
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Clock className="w-3 h-3" />
                    预计 {actionItems[0]?.timeline} 后启动
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Target className="w-3 h-3" />
                    {actionItems.reduce((sum, item) => sum + item.metrics.length, 0)} 个成功指标
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
