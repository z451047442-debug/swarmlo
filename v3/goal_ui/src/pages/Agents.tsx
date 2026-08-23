import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Bot, 
  Code, 
  TestTube, 
  FileCheck, 
  FileText, 
  Server,
  Target,
  GitBranch,
  Zap,
  Shield,
  MessageSquare,
  Eye,
  Play,
  Pause,
  SkipForward,
  RotateCw,
  Network,
  CheckCircle2
} from "lucide-react";
import { AgentStatusCard } from "@/components/agents/AgentStatusCard";
import { TaskBoard } from "@/components/agents/TaskBoard";
import { DependencyGraph } from "@/components/agents/DependencyGraph";
import { ExecutionMonitor } from "@/components/agents/ExecutionMonitor";
import { QualityGates } from "@/components/agents/QualityGates";
import { CommunicationLog } from "@/components/agents/CommunicationLog";
import { CodePreview } from "@/components/agents/CodePreview";
import { AgentStep, StepStatus } from "@/components/AgentStep";
import { DevelopmentStep } from "@/components/DevelopmentStep";
import { StateAssessmentCard } from "@/components/StateAssessmentCard";
import { AdvancedSettingsModal } from "@/components/agents/AdvancedSettingsModal";
import { PlanVisualization } from "@/components/agents/PlanVisualization";
import { StepExecutionPanel } from "@/components/agents/StepExecutionPanel";
import { AgentActivityPanel } from "@/components/agents/AgentActivityPanel";
import { RealTimeEventLog } from "@/components/agents/RealTimeEventLog";
import { ExecutionDashboard } from "@/components/agents/ExecutionDashboard";
import { ResearchReviewCard } from "@/components/ResearchReviewCard";

type AgentStatus = "idle" | "working" | "blocked";
type SwarmMode = "distributed" | "pipeline" | "collaborative";

interface Agent {
  id: string;
  name: string;
  icon: any;
  status: AgentStatus;
  currentTask?: string;
}

export default function Agents() {
  const [goal, setGoal] = useState("");
  const [swarmMode, setSwarmMode] = useState<SwarmMode>("distributed");
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [isPlanGenerated, setIsPlanGenerated] = useState(false);
  const [workflowStage, setWorkflowStage] = useState<"research" | "review" | "development">("research");
  const [devPhase, setDevPhase] = useState(0);

  const [agents, setAgents] = useState<Agent[]>([
    { id: "arch", name: "架构", icon: GitBranch, status: "idle" },
    { id: "impl", name: "实现", icon: Code, status: "idle" },
    { id: "test", name: "测试", icon: TestTube, status: "idle" },
    { id: "review", name: "代码审查", icon: FileCheck, status: "idle" },
    { id: "docs", name: "文档", icon: FileText, status: "idle" },
    { id: "devops", name: "DevOps", icon: Server, status: "idle" },
  ]);

  const [projectState, setProjectState] = useState({
    codebaseAnalyzed: 0,
    testsWritten: 0,
    codeReviewed: 0,
    deployed: 0,
    documented: 0,
  });

  const [qualityMetrics, setQualityMetrics] = useState({
    compileCheck: true,
    testCoverage: 85,
    securityScore: 92,
  });

  const handleGeneratePlan = () => {
    if (!goal.trim()) return;
    
    setIsPlanGenerated(true);
    setCurrentPhase(0);
    setIsRunning(true);
    setWorkflowStage("research");
    
    // Sequential phase progression with delays
    setTimeout(() => setCurrentPhase(1), 1000);
    setTimeout(() => setCurrentPhase(2), 8000);
    setTimeout(() => setCurrentPhase(3), 16000);
    setTimeout(() => setCurrentPhase(4), 24000);
    setTimeout(() => setCurrentPhase(5), 32000);
    setTimeout(() => {
      setIsRunning(false);
      setCurrentPhase(5);
      setWorkflowStage("review"); // Move to review after research completes
    }, 40000);
  };

  const handleApproveResearch = () => {
    console.log("Approving research, transitioning to development phase");
    setWorkflowStage("development");
    setDevPhase(0);
    setIsRunning(true);
    
    // Start development swarm execution
    setTimeout(() => {
      console.log("Dev phase 1");
      setDevPhase(1);
    }, 1000);
    setTimeout(() => {
      console.log("Dev phase 2");
      setDevPhase(2);
    }, 8000);
    setTimeout(() => {
      console.log("Dev phase 3");
      setDevPhase(3);
    }, 16000);
    setTimeout(() => {
      console.log("Dev phase 4");
      setDevPhase(4);
    }, 24000);
    setTimeout(() => {
      console.log("Dev phase 5");
      setDevPhase(5);
    }, 32000);
    setTimeout(() => {
      console.log("Development complete");
      setIsRunning(false);
      setDevPhase(5);
    }, 40000);
  };

  const handleReviseResearch = (feedback: string) => {
    console.log("Revising research with feedback:", feedback);
    // Reset and restart research
    setWorkflowStage("research");
    handleGeneratePlan();
  };

  const handleStartSwarm = () => {
    if (!isPlanGenerated) {
      handleGeneratePlan();
      return;
    }
    
    const newRunning = !isRunning;
    setIsRunning(newRunning);
    
    if (newRunning) {
      setCurrentPhase(0);
      
      // Sequential phase progression with delays
      setTimeout(() => setCurrentPhase(1), 1000);
      setTimeout(() => setCurrentPhase(2), 8000);
      setTimeout(() => setCurrentPhase(3), 16000);
      setTimeout(() => setCurrentPhase(4), 24000);
      setTimeout(() => setCurrentPhase(5), 32000);
      setTimeout(() => {
        setIsRunning(false);
        setCurrentPhase(5);
      }, 40000);
    } else {
      setCurrentPhase(0);
    }
  };

  const getPhaseStatus = (phaseIndex: number): StepStatus => {
    if (currentPhase === 0 && !isRunning) return "pending";
    if (phaseIndex < currentPhase) return "completed";
    if (phaseIndex === currentPhase && isRunning) return "active";
    if (phaseIndex === currentPhase && !isRunning) return "completed";
    return "pending";
  };

  const shouldShowPhase = (phaseIndex: number): boolean => {
    if (!isRunning && currentPhase === 0) return false;
    return phaseIndex <= currentPhase;
  };

  // Auto-scroll to newly revealed cards
  const assessmentRef = useRef<HTMLDivElement | null>(null);
  const phaseRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    // Scroll to the currently active phase card
    if (phaseRefs.current[currentPhase]) {
      setTimeout(() => {
        phaseRefs.current[currentPhase]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
  }, [currentPhase]);

  useEffect(() => {
    // When planning starts, scroll to the assessment card first
    if (isPlanGenerated && assessmentRef.current) {
      setTimeout(() => {
        assessmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  }, [isPlanGenerated]);

  // Debug workflow stage changes
  useEffect(() => {
    console.log("Workflow stage changed to:", workflowStage);
    console.log("Dev phase:", devPhase);
  }, [workflowStage, devPhase]);

  // Mock state for Goal Assessment - dynamically update based on current phase
  const currentState = {
    project_defined: goal.length > 0,
    requirements_clear: currentPhase >= 1,
    agents_ready: currentPhase >= 1,
    architecture_planned: currentPhase >= 2,
    code_implemented: currentPhase >= 3,
  };

  const goalState = {
    project_defined: true,
    requirements_clear: true,
    agents_ready: true,
    architecture_planned: true,
    code_implemented: true,
    tests_written: true,
    code_reviewed: true,
    deployed: true,
  };

  const stateGaps = currentPhase === 0 ? [
    "需要分析需求",
    "需要设计架构",
    "需要制定实施方案",
    "需要定义测试策略",
    "需要制定部署策略",
  ] : currentPhase === 1 ? [
    "需要设计架构",
    "需要制定实施方案",
    "需要定义测试策略",
    "需要制定部署策略",
  ] : currentPhase === 2 ? [
    "需要制定实施方案",
    "需要定义测试策略",
    "需要制定部署策略",
  ] : currentPhase === 3 ? [
    "需要定义测试策略",
    "需要制定部署策略",
  ] : currentPhase === 4 ? [
    "需要制定部署策略",
  ] : [];

  // Research phases - planning and analysis
  const researchPhases = [
    {
      title: "目标评估",
      description: "分析项目需求与当前状态",
      icon: Target,
      data: [
        {
          text: "解析编码目标",
          icon: FileText,
          details: {
            objective: "将目标拆解为可执行组件",
            agents: ["研究 Agent"],
            effects: ["需求已提取", "范围已确定"],
          }
        },
        {
          text: "识别所需技术",
          icon: Bot,
          details: {
            objective: "确定所需的工具与框架",
            agents: ["研究 Agent"],
            effects: ["技术栈已确定", "依赖已列出"],
          }
        },
        {
          text: "评估复杂度与可行性",
          icon: GitBranch,
          details: {
            objective: "评估技术挑战与工作量估算",
            agents: ["研究 Agent"],
            effects: ["复杂度评分已计算", "风险评估完成"],
          }
        },
      ],
      metrics: [
        { label: "复杂度", value: "中等" },
        { label: "预计时间", value: "2-4 周" },
      ],
    },
    {
      title: "架构规划",
      description: "设计系统结构与组件交互",
      icon: GitBranch,
      data: [
        {
          text: "研究架构模式",
          icon: Server,
          details: {
            objective: "评估不同的架构方案",
            agents: ["研究 Agent"],
            sources: ["Clean Architecture", "微服务模式", "Domain-Driven Design"],
            effects: ["模式已选定", "架构大纲已创建"],
          }
        },
        {
          text: "设计 API 契约",
          icon: Code,
          details: {
            objective: "定义端点、数据模型与接口",
            agents: ["研究 Agent"],
            effects: ["API 规范草案已完成", "请求/响应结构已定义"],
          }
        },
        {
          text: "规划数据库结构",
          icon: Server,
          details: {
            objective: "设计数据模型与关系",
            agents: ["研究 Agent"],
            effects: ["ERD 已创建", "迁移策略已规划"],
          }
        },
      ],
      metrics: [
        { label: "组件", value: "12" },
        { label: "API 端点", value: "8" },
      ],
    },
    {
      title: "实施方案",
      description: "规划开发方法与里程碑",
      icon: Code,
      data: [
        {
          text: "定义开发阶段",
          icon: FileText,
          details: {
            objective: "将实现拆分为可管理的阶段",
            agents: ["研究 Agent"],
            effects: ["里程碑路线图已创建", "依赖已映射"],
          }
        },
        {
          text: "确定 Agent 职责",
          icon: Bot,
          details: {
            objective: "将任务分配给专业开发 Agent",
            agents: ["研究 Agent"],
            effects: ["Agent 名单已确定", "任务分发已规划"],
          }
        },
        {
          text: "研究最佳实践",
          icon: Shield,
          details: {
            objective: "收集编码规范与安全指南",
            agents: ["研究 Agent"],
            sources: ["OWASP Top 10", "行业标准", "框架文档"],
            effects: ["指南已记录", "代码模式已选定"],
          }
        },
      ],
      metrics: [
        { label: "里程碑", value: "5" },
        { label: "Agent", value: "6" },
      ],
    },
    {
      title: "测试策略",
      description: "规划质量保障方案",
      icon: TestTube,
      data: [
        {
          text: "定义测试覆盖目标",
          icon: TestTube,
          details: {
            objective: "为单元、集成和 E2E 测试设定目标",
            agents: ["研究 Agent"],
            effects: ["覆盖目标已设定", "测试类型已确定"],
          }
        },
        {
          text: "研究测试框架",
          icon: Shield,
          details: {
            objective: "评估测试工具与方法",
            agents: ["研究 Agent"],
            sources: ["Jest", "Vitest", "Testing Library", "Cypress"],
            effects: ["测试技术栈已选定", "安装计划已创建"],
          }
        },
      ],
      metrics: [
        { label: "目标覆盖率", value: "85%" },
        { label: "测试类型", value: "3" },
      ],
    },
    {
      title: "部署规划",
      description: "准备生产部署策略",
      icon: FileText,
      data: [
        {
          text: "研究部署方案",
          icon: Server,
          details: {
            objective: "评估托管平台与 CI/CD 工具",
            agents: ["研究 Agent"],
            sources: ["Vercel", "Netlify", "AWS", "GitHub Actions"],
            effects: ["平台已选定", "部署计划草案已完成"],
          }
        },
        {
          text: "规划监控与可观测性",
          icon: Zap,
          details: {
            objective: "定义日志、指标与告警策略",
            agents: ["研究 Agent"],
            effects: ["监控计划已创建", "工具已选定"],
          }
        },
      ],
      metrics: [
        { label: "服务", value: "4" },
        { label: "环境", value: "3" },
      ],
    },
  ];

  // Development phases - actual implementation
  const developmentPhases = [
    {
      title: "项目初始化",
      description: "初始化代码库与依赖",
      icon: FileText,
      data: [
        {
          text: "搭建项目结构",
          icon: FileText,
          details: {
            objective: "以规范的目录结构初始化仓库",
            agents: ["DevOps Agent"],
            files: ["package.json", "tsconfig.json", "vite.config.ts"],
            effects: ["仓库已创建", "依赖已安装", "构建已配置"],
          }
        },
        {
          text: "配置开发环境",
          icon: Server,
          details: {
            objective: "配置代码检查、格式化与开发工具",
            agents: ["DevOps Agent"],
            files: [".eslintrc", ".prettierrc", ".env.example"],
            effects: ["ESLint 已配置", "Prettier 已配置", "Git hooks 已添加"],
          }
        },
      ],
      metrics: [
        { label: "已创建文件", value: "12" },
        { label: "依赖", value: "24" },
      ],
    },
    {
      title: "核心实现",
      description: "构建核心应用功能",
      icon: Code,
      data: [
        {
          text: "实现认证模块",
          icon: Shield,
          details: {
            objective: "构建基于 JWT 的登录/注册认证",
            agents: ["实现 Agent"],
            files: ["auth.service.ts", "auth.controller.ts", "auth.middleware.ts"],
            effects: ["认证端点已创建", "Token 校验已实现", "受保护路由已配置"],
            metrics: [
              { label: "端点", value: "4" },
              { label: "代码行", value: "287" },
            ]
          }
        },
        {
          text: "构建 REST API 端点",
          icon: Server,
          details: {
            objective: "为核心资源创建 CRUD 操作",
            agents: ["实现 Agent"],
            files: ["users.controller.ts", "posts.controller.ts", "api.routes.ts"],
            effects: ["已实现 8 个端点", "请求校验已添加", "错误处理已配置"],
            metrics: [
              { label: "端点", value: "8" },
              { label: "代码行", value: "456" },
            ]
          }
        },
        {
          text: "集成数据库层",
          icon: Server,
          details: {
            objective: "连接 PostgreSQL 并实现数据访问",
            agents: ["实现 Agent"],
            files: ["database.config.ts", "user.model.ts", "post.model.ts"],
            effects: ["ORM 已配置", "查询已优化", "迁移已创建"],
            metrics: [
              { label: "模型", value: "5" },
              { label: "代码行", value: "504" },
            ]
          }
        },
      ],
      metrics: [
        { label: "文件", value: "42" },
        { label: "总代码行", value: "1,247" },
      ],
    },
    {
      title: "测试与质量",
      description: "验证代码质量与功能",
      icon: TestTube,
      data: [
        {
          text: "编写单元测试",
          icon: TestTube,
          details: {
            objective: "创建全面的测试覆盖",
            agents: ["测试 Agent"],
            files: ["auth.test.ts", "api.test.ts", "database.test.ts"],
            effects: ["已达成 87% 覆盖率", "边界情况已覆盖", "模拟数据已创建"],
            metrics: [
              { label: "测试文件", value: "12" },
              { label: "测试", value: "124" },
            ]
          }
        },
        {
          text: "运行安全分析",
          icon: Shield,
          details: {
            objective: "扫描漏洞与安全问题",
            agents: ["代码审查 Agent"],
            effects: ["0 个严重问题", "2 个轻微警告", "安全报告已生成"],
          }
        },
        {
          text: "代码审查",
          icon: FileCheck,
          details: {
            objective: "审查代码质量与最佳实践",
            agents: ["代码审查 Agent"],
            effects: ["代码已通过", "建议小幅重构", "文档已更新"],
          }
        },
      ],
      metrics: [
        { label: "测试", value: "124" },
        { label: "覆盖率", value: "87%" },
      ],
    },
    {
      title: "文档",
      description: "创建完整的项目文档",
      icon: FileText,
      data: [
        {
          text: "生成 API 文档",
          icon: FileText,
          details: {
            objective: "创建带示例的完整 API 文档",
            agents: ["文档 Agent"],
            files: ["openapi.yaml", "README.md", "API.md"],
            effects: ["OpenAPI 规范已生成", "使用示例已添加", "端点文档已完成"],
          }
        },
        {
          text: "编写开发者指南",
          icon: Code,
          details: {
            objective: "记录安装、开发与部署流程",
            agents: ["文档 Agent"],
            files: ["CONTRIBUTING.md", "DEPLOYMENT.md", "ARCHITECTURE.md"],
            effects: ["安装指南已编写", "架构已记录", "贡献指南已添加"],
          }
        },
      ],
      metrics: [
        { label: "文档", value: "8" },
        { label: "页数", value: "24" },
      ],
    },
    {
      title: "部署",
      description: "部署到生产环境",
      icon: Zap,
      data: [
        {
          text: "搭建 CI/CD 流水线",
          icon: Zap,
          details: {
            objective: "配置自动化测试与部署",
            agents: ["DevOps Agent"],
            files: [".github/workflows/ci.yml", ".github/workflows/deploy.yml"],
            effects: ["GitHub Actions 已配置", "自动部署已启用", "环境密钥已设置"],
          }
        },
        {
          text: "部署到生产",
          icon: Server,
          details: {
            objective: "将应用发布到线上环境",
            agents: ["DevOps Agent"],
            effects: ["应用已部署", "监控已启用", "健康检查通过"],
            metrics: [
              { label: "运行时间", value: "99.9%" },
              { label: "响应时间", value: "< 200ms" },
            ]
          }
        },
      ],
      metrics: [
        { label: "环境", value: "3" },
        { label: "状态", value: "在线" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-500 to-blue-500 bg-clip-text text-transparent">
              编码 Agent 集群
            </h1>
            <p className="text-muted-foreground mt-2">
              面向协作软件开发的智能多 Agent 系统
            </p>
          </div>
        </div>

        {/* Goal Input */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  编码目标
                </CardTitle>
                <CardDescription>定义你希望 Agent 集群构建的内容</CardDescription>
              </div>
              <AdvancedSettingsModal />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="例如：使用 JWT 认证和 PostgreSQL 构建 REST API"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="flex-1"
              />
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={handleGeneratePlan}
                disabled={!goal.trim() || isRunning}
              >
                <Bot className="w-4 h-4" />
                {isPlanGenerated && !isRunning ? "重新生成计划" : "生成计划"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Research Phase */}
        {isPlanGenerated && workflowStage === "research" && (
          <div className="space-y-6">
            <div ref={assessmentRef} className="animate-fade-in">
              <StateAssessmentCard
                currentState={currentState}
                goalState={goalState}
                stateGaps={stateGaps}
                primaryColor="#a855f7"
                accentColor="#3b82f6"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 animate-fade-in">
                  <Bot className="w-5 h-5 text-purple-500" />
                  研究阶段进度
                </h3>
                {isRunning && (
                  <Badge variant="outline" className="animate-pulse bg-purple-500/10 text-purple-400 border-purple-500/50">
                    <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mr-2 animate-pulse"></span>
                    研究中...
                  </Badge>
                )}
              </div>
              <div className="space-y-4 relative">
                <div className="absolute left-2 top-6 bottom-6 w-0.5 bg-gradient-to-b from-purple-500/50 via-blue-500/50 to-green-500/50" 
                     style={{ 
                       height: `${shouldShowPhase(researchPhases.length - 1) ? '100%' : `${(currentPhase / researchPhases.length) * 100}%`}`,
                       transition: 'height 0.5s ease-out'
                     }} 
                />
                
                {researchPhases.map((phase, index) => 
                  shouldShowPhase(index) ? (
                    <div 
                      key={index}
                      ref={(el) => (phaseRefs.current[index] = el)}
                      className="animate-fade-in opacity-0"
                      style={{ 
                        animationDelay: `${(index * 200) + 300}ms`,
                        animationFillMode: "forwards"
                      }}
                    >
                      <AgentStep
                        title={phase.title}
                        description={phase.description}
                        icon={phase.icon}
                        status={getPhaseStatus(index)}
                        data={phase.data}
                        metrics={phase.metrics}
                        primaryColor="#a855f7"
                        accentColor="#3b82f6"
                        cardBackgroundColor="#1a1a1a"
                        cardBorderColor="#404040"
                        textColor="#ffffff"
                        secondaryTextColor="#a3a3a3"
                        successColor="#22c55e"
                        animationSpeed="normal"
                        compactMode={false}
                      />
                    </div>
                  ) : null
                )}
              </div>
            </div>
          </div>
        )}

        {/* Review Phase */}
        {workflowStage === "review" && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">研究审查</h3>
              {devPhase > 0 && (
                <Button 
                  variant="outline" 
                  onClick={() => setWorkflowStage("development")}
                  className="flex items-center gap-2"
                >
                  <Code className="w-4 h-4" />
                  返回开发阶段
                </Button>
              )}
            </div>
            
            {/* Tabs visible during review */}
            <Tabs defaultValue="dashboard" className="space-y-4">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="dashboard">仪表盘</TabsTrigger>
                <TabsTrigger value="tasks">任务</TabsTrigger>
                <TabsTrigger value="execution">执行</TabsTrigger>
                <TabsTrigger value="quality">质量</TabsTrigger>
                <TabsTrigger value="logs">日志</TabsTrigger>
              </TabsList>

              <TabsContent value="dashboard" className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      研究摘要
                    </h3>
                    <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/50">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      已完成
                    </Badge>
                  </div>
                  
                  <div className="space-y-4 relative">
                    <div className="absolute left-2 top-6 bottom-6 w-0.5 bg-gradient-to-b from-purple-500/50 via-blue-500/50 to-green-500/50" />
                    
                    {researchPhases.map((phase, index) => (
                      <div key={index} className="animate-fade-in">
                        <AgentStep
                          title={phase.title}
                          description={phase.description}
                          icon={phase.icon}
                          status="completed"
                          data={phase.data}
                          metrics={phase.metrics}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="tasks">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-primary" />
                        研究任务流程
                      </CardTitle>
                      <CardDescription>
                        顺序研究阶段及其依赖
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DependencyGraph />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>研究任务分解</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {researchPhases.map((phase, index) => (
                          <div key={index} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold mb-1">{phase.title}</h4>
                              <p className="text-sm text-muted-foreground mb-2">{phase.description}</p>
                              <div className="flex gap-2">
                                {phase.metrics?.map((metric, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {metric.label}: {metric.value}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="execution">
                <Tabs defaultValue="plan" className="space-y-4">
                  <TabsList className="w-full grid grid-cols-3">
                    <TabsTrigger value="plan">研究计划</TabsTrigger>
                    <TabsTrigger value="activity">Agent 活动</TabsTrigger>
                    <TabsTrigger value="events">事件时间线</TabsTrigger>
                  </TabsList>

                  <TabsContent value="plan" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Network className="w-5 h-5 text-primary" />
                          研究执行计划
                        </CardTitle>
                        <CardDescription>
                          {researchPhases.length} 个阶段 • 全部完成 • 目标：{goal}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <PlanVisualization
                          actions={researchPhases.map((phase, idx) => ({
                            id: String(idx + 1),
                            name: phase.title,
                            cost: 2 + idx,
                            description: phase.description
                          }))}
                          currentActionId={undefined}
                          completedActionIds={researchPhases.map((_, idx) => String(idx + 1))}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="activity">
                    <AgentActivityPanel
                      agents={[
                        { id: 'research', name: '研究 Agent', status: 'idle', type: '专家' }
                      ]}
                      metrics={new Map([
                        ['research', {
                          tasksCompleted: researchPhases.length,
                          tasksActive: 0,
                          tasksFailed: 0,
                          avgCompletionTime: 5000,
                          totalTokens: 45000,
                          uptime: 40000
                        }]
                      ])}
                    />
                  </TabsContent>

                  <TabsContent value="events">
                    <RealTimeEventLog
                      events={researchPhases.map((phase, idx) => ({
                        type: 'STEP_COMPLETED',
                        timestamp: Date.now() - (researchPhases.length - idx) * 8000,
                        data: { step: phase.title, phase: idx + 1 }
                      }))}
                    />
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="quality">
                <div className="space-y-6">
                  <QualityGates metrics={{
                    compileCheck: true,
                    testCoverage: 100,
                    securityScore: 95
                  }} />

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        研究质量指标
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                          <div>
                            <h4 className="font-semibold">完整性</h4>
                            <p className="text-sm text-muted-foreground">所有阶段均已成功完成</p>
                          </div>
                          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50">
                            100%
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                          <div>
                            <h4 className="font-semibold">覆盖率</h4>
                            <p className="text-sm text-muted-foreground">架构、实现、测试与部署</p>
                          </div>
                          <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                            已完成
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                          <div>
                            <h4 className="font-semibold">就绪度</h4>
                            <p className="text-sm text-muted-foreground">已准备好进入开发阶段</p>
                          </div>
                          <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/50">
                            就绪
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="logs">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      研究执行日志
                    </CardTitle>
                    <CardDescription>
                      所有研究阶段的详细日志
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-2 font-mono text-xs">
                        {researchPhases.flatMap((phase, phaseIdx) => [
                          <div key={`phase-${phaseIdx}-start`} className="text-blue-400">
                            [{new Date(Date.now() - (researchPhases.length - phaseIdx) * 8000).toLocaleTimeString()}] ▶ 开始阶段 {phaseIdx + 1}：{phase.title}
                          </div>,
                          ...phase.data.map((item, itemIdx) => (
                            <div key={`phase-${phaseIdx}-item-${itemIdx}`} className="ml-4 text-muted-foreground">
                              [{new Date(Date.now() - (researchPhases.length - phaseIdx) * 8000 + itemIdx * 1000).toLocaleTimeString()}] • {item.text}
                            </div>
                          )),
                          ...phase.metrics.map((metric, metricIdx) => (
                            <div key={`phase-${phaseIdx}-metric-${metricIdx}`} className="ml-4 text-green-400">
                              [{new Date(Date.now() - (researchPhases.length - phaseIdx) * 8000 + phase.data.length * 1000).toLocaleTimeString()}] ✓ {metric.label}: {metric.value}
                            </div>
                          )),
                          <div key={`phase-${phaseIdx}-complete`} className="text-green-500 font-semibold">
                            [{new Date(Date.now() - (researchPhases.length - phaseIdx - 1) * 8000).toLocaleTimeString()}] ✓ 阶段 {phaseIdx + 1} 完成
                          </div>,
                          <div key={`phase-${phaseIdx}-spacer`} className="h-2" />
                        ])}
                        <div className="text-green-500 font-bold mt-4">
                          [{new Date().toLocaleTimeString()}] ✓ 所有研究阶段已完成 - 等待审查
                        </div>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <ResearchReviewCard
              goal={goal}
              onApprove={handleApproveResearch}
              onRevise={handleReviseResearch}
            />
          </div>
        )}

        {/* Development Phase */}
        {workflowStage === "development" && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">开发阶段</h3>
              <Button 
                variant="outline" 
                onClick={() => setWorkflowStage("review")}
                className="flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                查看研究结果
              </Button>
            </div>
            
            <Tabs defaultValue="dashboard" className="space-y-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="dashboard">仪表盘</TabsTrigger>
              <TabsTrigger value="tasks">任务</TabsTrigger>
              <TabsTrigger value="execution">执行</TabsTrigger>
              <TabsTrigger value="quality">质量</TabsTrigger>
              <TabsTrigger value="logs">日志</TabsTrigger>
            </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 animate-fade-in">
                  <Code className="w-5 h-5 text-blue-500" />
                  开发集群进度
                </h3>
                {isRunning && (
                  <Badge variant="outline" className="animate-pulse bg-blue-500/10 text-blue-400 border-blue-500/50">
                    <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
                    构建中...
                  </Badge>
                )}
              </div>
              <div className="space-y-4 relative">
                <div className="absolute left-2 top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-500/50 via-green-500/50 to-emerald-500/50" 
                     style={{ 
                       height: `${devPhase === developmentPhases.length ? '100%' : `${(devPhase / developmentPhases.length) * 100}%`}`,
                       transition: 'height 0.5s ease-out'
                     }} 
                />
                
                {developmentPhases.map((phase, index) => 
                  index <= devPhase ? (
                    <div 
                      key={index}
                      className="animate-fade-in opacity-0"
                      style={{ 
                        animationDelay: `${(index * 200) + 300}ms`,
                        animationFillMode: "forwards"
                      }}
                    >
                      <DevelopmentStep
                        title={phase.title}
                        description={phase.description}
                        icon={phase.icon}
                        status={index < devPhase ? "completed" : index === devPhase && isRunning ? "active" : index === devPhase ? "completed" : "pending"}
                        data={phase.data}
                        metrics={phase.metrics}
                      />
                    </div>
                  ) : null
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tasks">
            <div className="space-y-6">
              <TaskBoard swarmMode={swarmMode} />
              
              {/* Task Dependencies */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-primary" />
                    任务依赖
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DependencyGraph />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="execution">
            <Tabs defaultValue="plan" className="space-y-4">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="plan">执行计划</TabsTrigger>
                <TabsTrigger value="current">当前步骤</TabsTrigger>
                <TabsTrigger value="activity">Agent 活动</TabsTrigger>
                <TabsTrigger value="events">事件日志</TabsTrigger>
              </TabsList>

              {/* Execution Plan */}
              <TabsContent value="plan" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Network className="w-5 h-5 text-primary" />
                          执行计划
                        </CardTitle>
                        <CardDescription className="mt-1">
                          5 个操作 • 成本：15 • 预计 8 分钟
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">图视图</Button>
                        <Button variant="outline" size="sm">时间线视图</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PlanVisualization
                      actions={[
                        { id: '1', name: '搭建架构', cost: 3, description: '定义系统设计' },
                        { id: '2', name: '设计 API', cost: 2, description: '定义端点' },
                        { id: '3', name: '实现后端', cost: 5, description: '构建 REST API' },
                        { id: '4', name: '编写测试', cost: 4, description: '创建测试套件' },
                        { id: '5', name: '部署', cost: 1, description: '发布到生产环境' }
                      ]}
                      currentActionId={currentPhase > 0 ? String(Math.min(currentPhase, 5)) : undefined}
                      completedActionIds={Array.from({ length: Math.max(0, currentPhase - 1) }, (_, i) => String(i + 1))}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Current Step */}
              <TabsContent value="current" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>当前步骤</CardTitle>
                            <CardDescription>
                              {researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.title || '规划中'}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={handleStartSwarm} disabled={isRunning}>
                              <Play className="w-4 h-4 mr-1" />
                              继续
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setCurrentPhase(Math.min(currentPhase + 1, researchPhases.length))}>
                              <SkipForward className="w-4 h-4 mr-1" />
                              跳过
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => {
                              setCurrentPhase(Math.max(0, currentPhase - 1));
                              setIsRunning(true);
                            }}>
                              <RotateCw className="w-4 h-4 mr-1" />
                              重试
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <h3 className="font-semibold mb-2">
                              {researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.title}
                            </h3>
                            <p className="text-sm text-muted-foreground mb-2">
                              成本：{researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.data?.[0]?.details?.objective}
                            </p>
                            <p className="text-sm">
                              {researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.description}
                            </p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold">前置条件</h4>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  <span>initialized: true</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  <span>requirements_clear: true</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold">效果</h4>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  <span>architecture_defined: true</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  <span>api_designed: true</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">执行日志</h4>
                            <ScrollArea className="h-[120px] rounded border bg-muted/50 p-3">
                              <div className="space-y-1 font-mono text-xs">
                                <div>[2:49:25 PM] 开始架构规划...</div>
                                <div>[2:49:25 PM] 正在分析需求...</div>
                                <div>[2:49:25 PM] 正在生成系统设计...</div>
                              </div>
                            </ScrollArea>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <StepExecutionPanel
                    currentAction={{
                      name: researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.title || '规划中',
                      description: researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.description,
                      cost: 3,
                      preconditions: { initialized: true, requirements_clear: true },
                      effects: { architecture_defined: true, api_designed: true }
                    }}
                    assignedAgent={{
                      name: agents[Math.min(currentPhase - 1, agents.length - 1)]?.name || '架构 Agent',
                      type: '专家',
                      status: isRunning ? 'working' : 'idle'
                    }}
                    progress={isRunning ? 65 : 0}
                    logs={[
                      '开始架构规划...',
                      '正在分析需求...',
                      '正在生成系统设计...'
                    ]}
                    isPaused={!isRunning}
                    onPause={() => setIsRunning(false)}
                    onResume={() => setIsRunning(true)}
                  />
                </div>
              </TabsContent>

              {/* Agent Activity */}
              <TabsContent value="activity">
                <AgentActivityPanel
                  agents={agents.map(a => ({ ...a, type: '专家' }))}
                  metrics={new Map(agents.map(a => [
                    a.id,
                    {
                      tasksCompleted: Math.floor(Math.random() * 10),
                      tasksActive: a.status === 'working' ? 1 : 0,
                      tasksFailed: 0,
                      avgCompletionTime: 2500,
                      totalTokens: 15000,
                      uptime: 3600000
                    }
                  ]))}
                />
              </TabsContent>

              {/* Event Log */}
              <TabsContent value="events">
                <RealTimeEventLog
                  events={[
                    { type: 'PLAN_GENERATED', timestamp: Date.now() - 5000, data: { actions: 5 } },
                    { type: 'AGENT_STARTED', timestamp: Date.now() - 4000, data: { agent: 'Architecture' } },
                    { type: 'STEP_COMPLETED', timestamp: Date.now() - 2000, data: { step: 'Analysis' } }
                  ]}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

            <TabsContent value="quality">
              <QualityGates metrics={qualityMetrics} />
            </TabsContent>

            <TabsContent value="logs">
              <CommunicationLog />
            </TabsContent>
          </Tabs>
          </div>
        )}

        {/* Placeholder when plan not generated */}
        {!isPlanGenerated && (
          <Card className="border-2 border-dashed border-primary/20">
            <CardContent className="py-12 text-center">
              <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold mb-2 text-muted-foreground">
                准备规划
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                在上方输入编码目标并点击"生成计划"，即可查看 Agent 集群的运行过程
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>示例："使用 JWT 认证和 PostgreSQL 构建 REST API"</p>
                <p>示例："创建带图表和实时数据的 React 仪表盘"</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
