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
import { useI18n } from "@/i18n";
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
  const { t } = useI18n();
  const [goal, setGoal] = useState("");
  const [swarmMode, setSwarmMode] = useState<SwarmMode>("distributed");
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [isPlanGenerated, setIsPlanGenerated] = useState(false);
  const [workflowStage, setWorkflowStage] = useState<"research" | "review" | "development">("research");
  const [devPhase, setDevPhase] = useState(0);

  const [agents, setAgents] = useState<Agent[]>([
    { id: "arch", name: "agents.agent.arch", icon: GitBranch, status: "idle" },
    { id: "impl", name: "agents.agent.impl", icon: Code, status: "idle" },
    { id: "test", name: "agents.agent.test", icon: TestTube, status: "idle" },
    { id: "review", name: "agents.agent.review", icon: FileCheck, status: "idle" },
    { id: "docs", name: "agents.agent.docs", icon: FileText, status: "idle" },
    { id: "devops", name: "agents.agent.devops", icon: Server, status: "idle" },
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
    "agents.gap.requirements",
    "agents.gap.architecture",
    "agents.gap.implementation",
    "agents.gap.testStrategy",
    "agents.gap.deployment",
  ] : currentPhase === 1 ? [
    "agents.gap.architecture",
    "agents.gap.implementation",
    "agents.gap.testStrategy",
    "agents.gap.deployment",
  ] : currentPhase === 2 ? [
    "agents.gap.implementation",
    "agents.gap.testStrategy",
    "agents.gap.deployment",
  ] : currentPhase === 3 ? [
    "agents.gap.testStrategy",
    "agents.gap.deployment",
  ] : currentPhase === 4 ? [
    "agents.gap.deployment",
  ] : [];

  // Research phases - planning and analysis
  const researchPhases = [
    {
      title: "agents.phase.goalAssessment",
      description: "agents.phase.goalAssessmentDesc",
      icon: Target,
      data: [
        {
          text: "agents.step.parseObjective",
          icon: FileText,
          details: {
            objective: "agents.obj.breakDownGoal",
            agents: ["agents.agent.research"],
            effects: ["agents.eff.requirementsExtracted", "agents.eff.scopeDefined"],
          }
        },
        {
          text: "agents.step.identifyTech",
          icon: Bot,
          details: {
            objective: "agents.obj.determineTools",
            agents: ["agents.agent.research"],
            effects: ["agents.eff.techStackIdentified", "agents.eff.dependenciesListed"],
          }
        },
        {
          text: "agents.step.assessComplexity",
          icon: GitBranch,
          details: {
            objective: "agents.obj.evaluateChallenges",
            agents: ["agents.agent.research"],
            effects: ["agents.eff.complexityCalculated", "agents.eff.riskAssessed"],
          }
        },
      ],
      metrics: [
        { label: "agents.metric.complexity", value: "agents.value.medium" },
        { label: "agents.metric.estimatedTime", value: "agents.value.weeks" },
      ],
    },
    {
      title: "agents.phase.architecturePlanning",
      description: "agents.phase.architecturePlanningDesc",
      icon: GitBranch,
      data: [
        {
          text: "agents.step.researchPatterns",
          icon: Server,
          details: {
            objective: "agents.obj.evaluateApproaches",
            agents: ["agents.agent.research"],
            sources: ["Clean Architecture", "agents.source.microservices", "Domain-Driven Design"],
            effects: ["agents.eff.patternSelected", "agents.eff.architectureOutline"],
          }
        },
        {
          text: "agents.step.designApiContracts",
          icon: Code,
          details: {
            objective: "agents.obj.specifyContracts",
            agents: ["agents.agent.research"],
            effects: ["agents.eff.apiSpecDrafted", "agents.eff.schemasDefined"],
          }
        },
        {
          text: "agents.step.planDbSchema",
          icon: Server,
          details: {
            objective: "agents.obj.designDataModels",
            agents: ["agents.agent.research"],
            effects: ["agents.eff.erdCreated", "agents.eff.migrationPlanned"],
          }
        },
      ],
      metrics: [
        { label: "agents.metric.components", value: "12" },
        { label: "agents.metric.apiEndpoints", value: "8" },
      ],
    },
    {
      title: "agents.phase.implementationStrategy",
      description: "agents.phase.implementationStrategyDesc",
      icon: Code,
      data: [
        {
          text: "agents.step.defineDevPhases",
          icon: FileText,
          details: {
            objective: "agents.obj.breakDownPhases",
            agents: ["agents.agent.research"],
            effects: ["agents.eff.milestoneRoadmap", "agents.eff.dependenciesMapped"],
          }
        },
        {
          text: "agents.step.identifyAgentRoles",
          icon: Bot,
          details: {
            objective: "agents.obj.assignTasks",
            agents: ["agents.agent.research"],
            effects: ["agents.eff.agentRoster", "agents.eff.taskDistribution"],
          }
        },
        {
          text: "agents.step.researchBestPractices",
          icon: Shield,
          details: {
            objective: "agents.obj.gatherStandards",
            agents: ["agents.agent.research"],
            sources: ["OWASP Top 10", "agents.source.industryStandards", "agents.source.frameworkDocs"],
            effects: ["agents.eff.guidelinesDocumented", "agents.eff.codePatternsSelected"],
          }
        },
      ],
      metrics: [
        { label: "agents.metric.milestones", value: "5" },
        { label: "agents.metric.agents", value: "6" },
      ],
    },
    {
      title: "agents.phase.testingStrategy",
      description: "agents.phase.testingStrategyDesc",
      icon: TestTube,
      data: [
        {
          text: "agents.step.defineCoverageGoals",
          icon: TestTube,
          details: {
            objective: "agents.obj.setTestTargets",
            agents: ["agents.agent.research"],
            effects: ["agents.eff.coverageTargetsSet", "agents.eff.testTypesIdentified"],
          }
        },
        {
          text: "agents.step.researchTestFrameworks",
          icon: Shield,
          details: {
            objective: "agents.obj.evaluateTestTools",
            agents: ["agents.agent.research"],
            sources: ["Jest", "Vitest", "Testing Library", "Cypress"],
            effects: ["agents.eff.testingStackSelected", "agents.eff.setupPlanCreated"],
          }
        },
      ],
      metrics: [
        { label: "agents.metric.targetCoverage", value: "85%" },
        { label: "agents.metric.testTypes", value: "3" },
      ],
    },
    {
      title: "agents.phase.deploymentPlanning",
      description: "agents.phase.deploymentPlanningDesc",
      icon: FileText,
      data: [
        {
          text: "agents.step.researchDeployOptions",
          icon: Server,
          details: {
            objective: "agents.obj.evaluateHosting",
            agents: ["agents.agent.research"],
            sources: ["Vercel", "Netlify", "AWS", "GitHub Actions"],
            effects: ["agents.eff.platformSelected", "agents.eff.deploymentDrafted"],
          }
        },
        {
          text: "agents.step.planObservability",
          icon: Zap,
          details: {
            objective: "agents.obj.defineObservability",
            agents: ["agents.agent.research"],
            effects: ["agents.eff.monitoringPlan", "agents.eff.toolsSelected"],
          }
        },
      ],
      metrics: [
        { label: "agents.metric.services", value: "4" },
        { label: "agents.metric.environments", value: "3" },
      ],
    },
  ];

  // Development phases - actual implementation
  const developmentPhases = [
    {
      title: "agents.phase.projectSetup",
      description: "agents.phase.projectSetupDesc",
      icon: FileText,
      data: [
        {
          text: "agents.step.setupProjectStructure",
          icon: FileText,
          details: {
            objective: "agents.obj.initRepo",
            agents: ["agents.agent.devops"],
            files: ["package.json", "tsconfig.json", "vite.config.ts"],
            effects: ["agents.eff.repoCreated", "agents.eff.dependenciesInstalled", "agents.eff.buildConfigured"],
          }
        },
        {
          text: "agents.step.configureDevEnv",
          icon: Server,
          details: {
            objective: "agents.obj.setupTooling",
            agents: ["agents.agent.devops"],
            files: [".eslintrc", ".prettierrc", ".env.example"],
            effects: ["agents.eff.eslintConfigured", "agents.eff.prettierConfigured", "agents.eff.gitHooksAdded"],
          }
        },
      ],
      metrics: [
        { label: "agents.metric.filesCreated", value: "12" },
        { label: "agents.metric.dependencies", value: "24" },
      ],
    },
    {
      title: "agents.phase.coreImplementation",
      description: "agents.phase.coreImplementationDesc",
      icon: Code,
      data: [
        {
          text: "agents.step.implementAuth",
          icon: Shield,
          details: {
            objective: "agents.obj.buildAuth",
            agents: ["agents.agent.implAgent"],
            files: ["auth.service.ts", "auth.controller.ts", "auth.middleware.ts"],
            effects: ["agents.eff.authEndpoints", "agents.eff.tokenValidation", "agents.eff.protectedRoutes"],
            metrics: [
              { label: "agents.metric.endpoints", value: "4" },
              { label: "agents.metric.loc", value: "287" },
            ]
          }
        },
        {
          text: "agents.step.buildRestApi",
          icon: Server,
          details: {
            objective: "agents.obj.crudOperations",
            agents: ["agents.agent.implAgent"],
            files: ["users.controller.ts", "posts.controller.ts", "api.routes.ts"],
            effects: ["agents.eff.endpointsImplemented", "agents.eff.requestValidation", "agents.eff.errorHandling"],
            metrics: [
              { label: "agents.metric.endpoints", value: "8" },
              { label: "agents.metric.loc", value: "456" },
            ]
          }
        },
        {
          text: "agents.step.integrateDb",
          icon: Server,
          details: {
            objective: "agents.obj.connectPostgres",
            agents: ["agents.agent.implAgent"],
            files: ["database.config.ts", "user.model.ts", "post.model.ts"],
            effects: ["agents.eff.ormConfigured", "agents.eff.queriesOptimized", "agents.eff.migrationsCreated"],
            metrics: [
              { label: "agents.metric.models", value: "5" },
              { label: "agents.metric.loc", value: "504" },
            ]
          }
        },
      ],
      metrics: [
        { label: "agents.metric.files", value: "42" },
        { label: "agents.metric.totalLoc", value: "1,247" },
      ],
    },
    {
      title: "agents.phase.testingQuality",
      description: "agents.phase.testingQualityDesc",
      icon: TestTube,
      data: [
        {
          text: "agents.step.writeUnitTests",
          icon: TestTube,
          details: {
            objective: "agents.obj.testCoverage",
            agents: ["agents.agent.testAgent"],
            files: ["auth.test.ts", "api.test.ts", "database.test.ts"],
            effects: ["agents.eff.coverageAchieved", "agents.eff.edgeCasesCovered", "agents.eff.mockDataCreated"],
            metrics: [
              { label: "agents.metric.testFiles", value: "12" },
              { label: "agents.metric.tests", value: "124" },
            ]
          }
        },
        {
          text: "agents.step.runSecurityAnalysis",
          icon: Shield,
          details: {
            objective: "agents.obj.scanVulnerabilities",
            agents: ["agents.agent.reviewAgent"],
            effects: ["agents.eff.zeroCritical", "agents.eff.twoMinorWarnings", "agents.eff.securityReport"],
          }
        },
        {
          text: "agents.step.codeReview",
          icon: FileCheck,
          details: {
            objective: "agents.obj.reviewBestPractices",
            agents: ["agents.agent.reviewAgent"],
            effects: ["agents.eff.codeApproved", "agents.eff.refactoringSuggested", "agents.eff.documentationUpdated"],
          }
        },
      ],
      metrics: [
        { label: "agents.metric.tests", value: "124" },
        { label: "agents.review.coverage", value: "87%" },
      ],
    },
    {
      title: "agents.agent.docs",
      description: "agents.phase.documentationDesc",
      icon: FileText,
      data: [
        {
          text: "agents.step.generateApiDocs",
          icon: FileText,
          details: {
            objective: "agents.obj.createApiDocs",
            agents: ["agents.agent.docsAgent"],
            files: ["openapi.yaml", "README.md", "API.md"],
            effects: ["agents.eff.openapiGenerated", "agents.eff.usageExamplesAdded", "agents.eff.endpointDocsComplete"],
          }
        },
        {
          text: "agents.step.writeDevGuides",
          icon: Code,
          details: {
            objective: "agents.obj.documentProcesses",
            agents: ["agents.agent.docsAgent"],
            files: ["CONTRIBUTING.md", "DEPLOYMENT.md", "ARCHITECTURE.md"],
            effects: ["agents.eff.setupGuideWritten", "agents.eff.architectureDocumented", "agents.eff.contributionGuidelines"],
          }
        },
      ],
      metrics: [
        { label: "agents.metric.documents", value: "8" },
        { label: "agents.metric.pages", value: "24" },
      ],
    },
    {
      title: "agents.actions.deploy",
      description: "agents.phase.deployDesc",
      icon: Zap,
      data: [
        {
          text: "agents.step.setupCiCd",
          icon: Zap,
          details: {
            objective: "agents.obj.configureAutomation",
            agents: ["agents.agent.devops"],
            files: [".github/workflows/ci.yml", ".github/workflows/deploy.yml"],
            effects: ["agents.eff.githubActions", "agents.eff.autoDeploy", "agents.eff.envSecrets"],
          }
        },
        {
          text: "agents.step.deployProduction",
          icon: Server,
          details: {
            objective: "agents.obj.launchApp",
            agents: ["agents.agent.devops"],
            effects: ["agents.eff.appDeployed", "agents.eff.monitoringActive", "agents.eff.healthChecks"],
            metrics: [
              { label: "agents.activity.uptime", value: "99.9%" },
              { label: "agents.metric.responseTime", value: "< 200ms" },
            ]
          }
        },
      ],
      metrics: [
        { label: "agents.metric.environments", value: "3" },
        { label: "agents.activity.status", value: "agents.value.live" },
      ],
    },
  ];

  // Translates i18n keys stored in the phase arrays into the current language
  // before they are passed down to AgentStep / DevelopmentStep.
  const translatePhase = (phase: any): any => {
    const data = (phase.data ?? []).map((item: any) => ({
      ...item,
      text: t(item.text),
      details: item.details
        ? {
            ...item.details,
            objective: t(item.details.objective),
            agents: item.details.agents?.map((a: string) => t(a)),
            effects: item.details.effects?.map((e: string) => t(e)),
            sources: item.details.sources?.map((s: string) => t(s)),
            metrics: item.details.metrics?.map((m: any) => ({ ...m, label: t(m.label), value: t(m.value) })),
          }
        : undefined,
    }));
    return {
      ...phase,
      title: t(phase.title),
      description: t(phase.description),
      data,
      metrics: phase.metrics?.map((m: any) => ({ ...m, label: t(m.label), value: t(m.value) })),
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-500 to-blue-500 bg-clip-text text-transparent">
              {t('agents.title')}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('agents.subtitle')}
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
                  {t('agents.goal.title')}
                </CardTitle>
                <CardDescription>{t('agents.goal.description')}</CardDescription>
              </div>
              <AdvancedSettingsModal />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder={t('agents.goal.placeholder')}
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
                {isPlanGenerated && !isRunning ? t('agents.goal.regenerate') : t('agents.goal.generate')}
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
                stateGaps={stateGaps.map((gap) => t(gap))}
                primaryColor="#a855f7"
                accentColor="#3b82f6"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 animate-fade-in">
                  <Bot className="w-5 h-5 text-purple-500" />
                  {t('agents.research.progress')}
                </h3>
                {isRunning && (
                  <Badge variant="outline" className="animate-pulse bg-purple-500/10 text-purple-400 border-purple-500/50">
                    <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mr-2 animate-pulse"></span>
                    {t('agents.research.researching')}
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

                {researchPhases.map((phase, index) => {
                  const tp = translatePhase(phase);
                  return shouldShowPhase(index) ? (
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
                        title={tp.title}
                        description={tp.description}
                        icon={phase.icon}
                        status={getPhaseStatus(index)}
                        data={tp.data}
                        metrics={tp.metrics}
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
                  ) : null;
                })}
              </div>
            </div>
          </div>
        )}

        {/* Review Phase */}
        {workflowStage === "review" && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('agents.review.title')}</h3>
              {devPhase > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setWorkflowStage("development")}
                  className="flex items-center gap-2"
                >
                  <Code className="w-4 h-4" />
                  {t('agents.review.backToDev')}
                </Button>
              )}
            </div>

            {/* Tabs visible during review */}
            <Tabs defaultValue="dashboard" className="space-y-4">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="dashboard">{t('agents.tab.dashboard')}</TabsTrigger>
                <TabsTrigger value="tasks">{t('agents.tab.tasks')}</TabsTrigger>
                <TabsTrigger value="execution">{t('agents.tab.execution')}</TabsTrigger>
                <TabsTrigger value="quality">{t('agents.tab.quality')}</TabsTrigger>
                <TabsTrigger value="logs">{t('agents.tab.logs')}</TabsTrigger>
              </TabsList>

              <TabsContent value="dashboard" className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      {t('agents.review.summary')}
                    </h3>
                    <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/50">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {t('agents.complete')}
                    </Badge>
                  </div>

                  <div className="space-y-4 relative">
                    <div className="absolute left-2 top-6 bottom-6 w-0.5 bg-gradient-to-b from-purple-500/50 via-blue-500/50 to-green-500/50" />

                    {researchPhases.map((phase, index) => {
                      const tp = translatePhase(phase);
                      return (
                        <div key={index} className="animate-fade-in">
                          <AgentStep
                            title={tp.title}
                            description={tp.description}
                            icon={phase.icon}
                            status="completed"
                            data={tp.data}
                            metrics={tp.metrics}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="tasks">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-primary" />
                        {t('agents.review.taskFlow')}
                      </CardTitle>
                      <CardDescription>
                        {t('agents.review.taskFlowDesc')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DependencyGraph />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>{t('agents.review.taskBreakdown')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {researchPhases.map((phase, index) => (
                          <div key={index} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold mb-1">{t(phase.title)}</h4>
                              <p className="text-sm text-muted-foreground mb-2">{t(phase.description)}</p>
                              <div className="flex gap-2">
                                {phase.metrics?.map((metric, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {t(metric.label)}: {t(metric.value)}
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
                    <TabsTrigger value="plan">{t('agents.review.plan')}</TabsTrigger>
                    <TabsTrigger value="activity">{t('agents.exec.activity')}</TabsTrigger>
                    <TabsTrigger value="events">{t('agents.review.eventTimeline')}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="plan" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Network className="w-5 h-5 text-primary" />
                          {t('agents.review.executionPlan')}
                        </CardTitle>
                        <CardDescription>
                          {t('agents.review.phasesSummary', { count: researchPhases.length, goal })}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <PlanVisualization
                          actions={researchPhases.map((phase, idx) => ({
                            id: String(idx + 1),
                            name: t(phase.title),
                            cost: 2 + idx,
                            description: t(phase.description)
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
                        { id: 'research', name: t('agents.agent.research'), status: 'idle', type: t('agents.type.specialist') }
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
                        data: { step: t(phase.title), phase: idx + 1 }
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
                        {t('agents.review.qualityMetrics')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                          <div>
                            <h4 className="font-semibold">{t('agents.review.completeness')}</h4>
                            <p className="text-sm text-muted-foreground">{t('agents.review.completenessDesc')}</p>
                          </div>
                          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50">
                            100%
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                          <div>
                            <h4 className="font-semibold">{t('agents.review.coverage')}</h4>
                            <p className="text-sm text-muted-foreground">{t('agents.review.coverageDesc')}</p>
                          </div>
                          <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                            {t('agents.complete')}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                          <div>
                            <h4 className="font-semibold">{t('agents.review.readiness')}</h4>
                            <p className="text-sm text-muted-foreground">{t('agents.review.readinessDesc')}</p>
                          </div>
                          <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/50">
                            {t('agents.review.ready')}
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
                      {t('agents.review.executionLogs')}
                    </CardTitle>
                    <CardDescription>
                      {t('agents.review.executionLogsDesc')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-2 font-mono text-xs">
                        {researchPhases.flatMap((phase, phaseIdx) => [
                          <div key={`phase-${phaseIdx}-start`} className="text-blue-400">
                            [{new Date(Date.now() - (researchPhases.length - phaseIdx) * 8000).toLocaleTimeString()}] ▶ {t('agents.review.startPhase', { phase: phaseIdx + 1, title: t(phase.title) })}
                          </div>,
                          ...phase.data.map((item, itemIdx) => (
                            <div key={`phase-${phaseIdx}-item-${itemIdx}`} className="ml-4 text-muted-foreground">
                              [{new Date(Date.now() - (researchPhases.length - phaseIdx) * 8000 + itemIdx * 1000).toLocaleTimeString()}] • {t(item.text)}
                            </div>
                          )),
                          ...phase.metrics.map((metric, metricIdx) => (
                            <div key={`phase-${phaseIdx}-metric-${metricIdx}`} className="ml-4 text-green-400">
                              [{new Date(Date.now() - (researchPhases.length - phaseIdx) * 8000 + phase.data.length * 1000).toLocaleTimeString()}] ✓ {t(metric.label)}: {t(metric.value)}
                            </div>
                          )),
                          <div key={`phase-${phaseIdx}-complete`} className="text-green-500 font-semibold">
                            [{new Date(Date.now() - (researchPhases.length - phaseIdx - 1) * 8000).toLocaleTimeString()}] ✓ {t('agents.review.phaseComplete', { phase: phaseIdx + 1 })}
                          </div>,
                          <div key={`phase-${phaseIdx}-spacer`} className="h-2" />
                        ])}
                        <div className="text-green-500 font-bold mt-4">
                          [{new Date().toLocaleTimeString()}] ✓ {t('agents.review.allComplete')}
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
              <h3 className="text-lg font-semibold">{t('agents.dev.title')}</h3>
              <Button
                variant="outline"
                onClick={() => setWorkflowStage("review")}
                className="flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                {t('agents.dev.viewResearch')}
              </Button>
            </div>

            <Tabs defaultValue="dashboard" className="space-y-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="dashboard">{t('agents.tab.dashboard')}</TabsTrigger>
              <TabsTrigger value="tasks">{t('agents.tab.tasks')}</TabsTrigger>
              <TabsTrigger value="execution">{t('agents.tab.execution')}</TabsTrigger>
              <TabsTrigger value="quality">{t('agents.tab.quality')}</TabsTrigger>
              <TabsTrigger value="logs">{t('agents.tab.logs')}</TabsTrigger>
            </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 animate-fade-in">
                  <Code className="w-5 h-5 text-blue-500" />
                  {t('agents.dev.progress')}
                </h3>
                {isRunning && (
                  <Badge variant="outline" className="animate-pulse bg-blue-500/10 text-blue-400 border-blue-500/50">
                    <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
                    {t('agents.dev.building')}
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

                {developmentPhases.map((phase, index) => {
                  const tp = translatePhase(phase);
                  return index <= devPhase ? (
                    <div
                      key={index}
                      className="animate-fade-in opacity-0"
                      style={{
                        animationDelay: `${(index * 200) + 300}ms`,
                        animationFillMode: "forwards"
                      }}
                    >
                      <DevelopmentStep
                        title={tp.title}
                        description={tp.description}
                        icon={phase.icon}
                        status={index < devPhase ? "completed" : index === devPhase && isRunning ? "active" : index === devPhase ? "completed" : "pending"}
                        data={tp.data}
                        metrics={tp.metrics}
                      />
                    </div>
                  ) : null;
                })}
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
                    {t('agents.tasksDependencies')}
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
                <TabsTrigger value="plan">{t('agents.exec.plan')}</TabsTrigger>
                <TabsTrigger value="current">{t('agents.exec.currentStep')}</TabsTrigger>
                <TabsTrigger value="activity">{t('agents.exec.activity')}</TabsTrigger>
                <TabsTrigger value="events">{t('agents.exec.eventLog')}</TabsTrigger>
              </TabsList>

              {/* Execution Plan */}
              <TabsContent value="plan" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Network className="w-5 h-5 text-primary" />
                          {t('agents.exec.plan')}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {t('agents.exec.planSummary')}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">{t('agents.exec.graphView')}</Button>
                        <Button variant="outline" size="sm">{t('agents.exec.timelineView')}</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PlanVisualization
                      actions={[
                        { id: '1', name: t('agents.actions.setupArchitecture'), cost: 3, description: t('agents.actions.setupArchitectureDesc') },
                        { id: '2', name: t('agents.actions.designApi'), cost: 2, description: t('agents.actions.designApiDesc') },
                        { id: '3', name: t('agents.actions.implementBackend'), cost: 5, description: t('agents.actions.implementBackendDesc') },
                        { id: '4', name: t('agents.actions.writeTests'), cost: 4, description: t('agents.actions.writeTestsDesc') },
                        { id: '5', name: t('agents.actions.deploy'), cost: 1, description: t('agents.actions.deployDesc') }
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
                            <CardTitle>{t('agents.exec.currentStep')}</CardTitle>
                            <CardDescription>
                              {t(researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.title ?? 'agents.exec.planning')}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={handleStartSwarm} disabled={isRunning}>
                              <Play className="w-4 h-4 mr-1" />
                              {t('agents.exec.resume')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setCurrentPhase(Math.min(currentPhase + 1, researchPhases.length))}>
                              <SkipForward className="w-4 h-4 mr-1" />
                              {t('agents.exec.skip')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => {
                              setCurrentPhase(Math.max(0, currentPhase - 1));
                              setIsRunning(true);
                            }}>
                              <RotateCw className="w-4 h-4 mr-1" />
                              {t('agents.exec.retry')}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <h3 className="font-semibold mb-2">
                              {t(researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.title ?? 'agents.exec.planning')}
                            </h3>
                            <p className="text-sm text-muted-foreground mb-2">
                              {t('agents.exec.cost', { value: t(researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.data?.[0]?.details?.objective ?? '') })}
                            </p>
                            <p className="text-sm">
                              {t(researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.description ?? '')}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold">{t('agents.exec.preconditions')}</h4>
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
                              <h4 className="text-sm font-semibold">{t('agents.exec.effects')}</h4>
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
                            <h4 className="text-sm font-semibold">{t('agents.exec.log')}</h4>
                            <ScrollArea className="h-[120px] rounded border bg-muted/50 p-3">
                              <div className="space-y-1 font-mono text-xs">
                                <div>[2:49:25 PM] {t('agents.exec.log1')}</div>
                                <div>[2:49:25 PM] {t('agents.exec.log2')}</div>
                                <div>[2:49:25 PM] {t('agents.exec.log3')}</div>
                              </div>
                            </ScrollArea>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <StepExecutionPanel
                    currentAction={{
                      name: t(researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.title ?? 'agents.exec.planning'),
                      description: t(researchPhases[Math.min(currentPhase - 1, researchPhases.length - 1)]?.description ?? ''),
                      cost: 3,
                      preconditions: { initialized: true, requirements_clear: true },
                      effects: { architecture_defined: true, api_designed: true }
                    }}
                    assignedAgent={{
                      name: t(agents[Math.min(currentPhase - 1, agents.length - 1)]?.name ?? 'agents.agent.archAgent'),
                      type: t('agents.type.specialist'),
                      status: isRunning ? 'working' : 'idle'
                    }}
                    progress={isRunning ? 65 : 0}
                    logs={[
                      t('agents.exec.log1'),
                      t('agents.exec.log2'),
                      t('agents.exec.log3')
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
                  agents={agents.map(a => ({ ...a, name: t(a.name), type: t('agents.type.specialist') }))}
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
                {t('agents.placeholder.title')}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('agents.placeholder.desc')}
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>{t('agents.placeholder.example1')}</p>
                <p>{t('agents.placeholder.example2')}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
