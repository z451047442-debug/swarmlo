import { useState, useEffect, useRef } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Brain,
  Search,
  FileSearch,
  GitBranch,
  Lightbulb,
  CheckCircle2,
  Target,
  FileText,
  Link,
  Workflow,
  Database,
  TrendingUp,
  Filter,
  Zap,
  Shield,
  Sparkles,
  Clock,
  Network,
  Settings,
  ChevronRight,
  RotateCcw,
  ExternalLink,
  Code,
  Play,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AgentStep, StepStatus } from "@/components/AgentStep";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoalInput } from "@/components/GoalInput";
import { WidgetCustomizer } from "@/components/WidgetCustomizer";
import { ResearchReportModal } from "@/components/ResearchReportModal";
import { ReviseResearchForm, type ResearchConfig } from "@/components/ReviseResearchForm";
import { StateAssessmentCard } from "@/components/StateAssessmentCard";
import { GOAPConfigDisplay } from "@/components/GOAPConfigDisplay";
import { GOAPPlanner, parseGoal, type Step, type DataItem } from "@/lib/goapPlanner";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";

interface WidgetConfig {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardBackgroundColor: string;
  cardBorderColor: string;
  textColor: string;
  secondaryTextColor: string;
  successColor: string;
  title: string;
  description: string;
  brandName: string;
  defaultGoal: string;
  fontFamily: string;
  borderRadius: string;
  animationSpeed: string;
  cardSpacing: string;
  showMetrics: boolean;
  showStats: boolean;
  compactMode: boolean;
  enableAI: boolean;
  aiModel: string;
}

const defaultResearchConfig: ResearchConfig = {
  goal: "",
  stateDefinition: {
    currentState: { goalDefined: true, informationGathered: false },
    goalState: { verified: true, insightsGenerated: true },
    stateGaps: ["需要收集信息", "需要进行分析", "需要生成洞察"],
  },
  researchGuidance: {
    focusAreas: [],
    excludeTopics: [],
    depth: "moderate",
    perspective: "technical",
    timeframe: "recent",
  },
  prompts: {
    systemPrompt: `你是一名专注于 GOAP（目标导向行动规划）研究工作流的资深研究助理。
你的职责是为每个研究步骤提供精确、基于证据的信息。
请将回答格式化为结构化的数据点，以便用于后续的研究步骤。
始终包含来源、置信度等级和时间戳（如有）。
所有回答请用简体中文撰写。`,
    searchQueryTemplate: "{topic} 最新进展 {year} 研究 site:arxiv.org OR site:scholar.google.com OR site:ieee.org",
    analysisPrompt: `请分析以下内容并提取：
1. 关键发现与方法论
2. 可执行的洞察与建议
3. 技术细节与规格说明
4. 来源与引用
5. 基于来源质量的置信度等级（0-100%）
请用简体中文输出分析结果。`,
    synthesisPrompt: `请将研究结果综合为：
1. 关键发现的一致性摘要
2. 不同来源之间的联系
3. 实用的建议
4. 数据中发现的缺口或矛盾
5. 总体置信度评估
请用简体中文撰写综合结果。`,
  },
  goapConfig: {
    executionMode: "closed",
    enableReplanning: true,
    replanningTriggers: ["动作失败", "低置信度结果", "缺少前置条件"],
    costOptimization: true,
    parallelExecution: true,
  },
  actionConfig: {
    maxActionCost: 5,
    enableFallbacks: true,
    validatePreconditions: true,
    trackEffects: true,
  },
  parameters: {
    maxSources: 15,
    minConfidence: 85,
    maxSteps: 7,
    parallelAgents: 3,
    timeout: 120,
  },
  filters: {
    dateRange: "past-year",
    sourceTypes: ["academic", "technical", "industry"],
    languages: ["en"],
    excludeDomains: [],
  },
};

const RESEARCH_SESSION_KEY = "swarmlo-research-session-v1";

interface PersistedResearchSession {
  userGoal: string;
  steps: Step[];
  finalRecommendations: unknown[];
  researchConfig: ResearchConfig;
  currentGOAPState: Record<string, boolean | string | number>;
  visibleSteps: number;
  planGenerated: boolean;
  showFinalAnalysis: boolean;
}

// Step icons are lucide components (functions) — JSON.stringify drops them, so
// re-attach by step id when restoring. Step ids come from createGOAPActions.
const STEP_ICONS: Record<string, LucideIcon> = {
  "1": Target,
  "2": Brain,
  "3": Search,
  "4": FileSearch,
  "5": GitBranch,
  "6": Lightbulb,
  "7": CheckCircle2,
};

let cachedRestoredSession: PersistedResearchSession | null | undefined;

function getRestoredSession(): PersistedResearchSession | null {
  if (cachedRestoredSession !== undefined) return cachedRestoredSession;
  try {
    const raw = localStorage.getItem(RESEARCH_SESSION_KEY);
    if (!raw) {
      cachedRestoredSession = null;
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedResearchSession> & { v?: number; steps?: Step[] };
    if (parsed.v !== 3 || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      // v1 sessions predate the Chinese UI translation and would restore English
      // template copy — discard them (v1 was never released, so nothing real is lost).
      // v2 sessions hard-coded Chinese template copy — discarded for the same reason
      // (v3 persists the i18n-aware session).
      try {
        localStorage.removeItem(RESEARCH_SESSION_KEY);
      } catch (cleanupErr) {
        console.warn("Failed to clear stale session:", cleanupErr);
      }
      cachedRestoredSession = null;
      return null;
    }
    cachedRestoredSession = {
      userGoal: parsed.userGoal ?? "",
      steps: parsed.steps.map((step) => ({
        ...step,
        icon: STEP_ICONS[step.id] ?? CheckCircle2,
        // A run interrupted by a refresh can't be resumed; show the step as pending again.
        status: step.status === "active" ? "pending" : step.status,
        // Persisted icons are unusable: lucide components survive JSON.stringify as
        // empty objects ({}), so always re-attach a real component by content shape.
        data: step.data?.map((item) => {
          const details = item.details as (DataItem["details"] & { timestamp?: string; source?: string; confidence?: number }) | undefined;
          return { ...item, icon: details?.timestamp || details?.source || details?.confidence ? Sparkles : FileText };
        }),
      })),
      finalRecommendations: parsed.finalRecommendations ?? [],
      researchConfig: parsed.researchConfig ?? defaultResearchConfig,
      currentGOAPState: parsed.currentGOAPState ?? defaultResearchConfig.stateDefinition.currentState,
      visibleSteps: parsed.visibleSteps ?? 1,
      planGenerated: parsed.planGenerated ?? true,
      showFinalAnalysis: parsed.showFinalAnalysis ?? false,
    };
    return cachedRestoredSession;
  } catch (err) {
    console.warn("Failed to restore research session, starting fresh:", err);
    try {
      localStorage.removeItem(RESEARCH_SESSION_KEY);
    } catch (cleanupErr) {
      console.warn("Failed to clear corrupted session:", cleanupErr);
    }
    cachedRestoredSession = null;
    return null;
  }
}

const Index = () => {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  // defaultResearchConfig.stateGaps / replanningTriggers are stored as raw
  // strings; translate them at render time so persisted sessions (any schema
  // version) display in the active language.
  const gapKeys: Record<string, string> = {
    "需要收集信息": "main.stateGapGather",
    "需要进行分析": "main.stateGapAnalyze",
    "需要生成洞察": "main.stateGapInsights",
  };
  const triggerKeys: Record<string, string> = {
    "动作失败": "main.triggerActionFailure",
    "低置信度结果": "main.triggerLowConfidence",
    "缺少前置条件": "main.triggerMissingPreconditions",
  };
  const translateGap = (gap: string) => (gapKeys[gap] ? t(gapKeys[gap]) : gap);
  const translateTrigger = (trigger: string) => (triggerKeys[trigger] ? t(triggerKeys[trigger]) : trigger);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>({
    primaryColor: "#8b5cf6",
    accentColor: "#22c55e",
    backgroundColor: "#1a1a1a",
    cardBackgroundColor: "#262626",
    cardBorderColor: "#404040",
    textColor: "#ffffff",
    secondaryTextColor: "#a3a3a3",
    successColor: "#22c55e",
    title: t("main.widgetDefaultTitle"),
    description: t("main.widgetDefaultDescription"),
    brandName: "",
    defaultGoal: t("main.widgetDefaultGoal"),
    fontFamily: "system-ui",
    borderRadius: "0.5rem",
    animationSpeed: "normal",
    cardSpacing: "1rem",
    showMetrics: true,
    showStats: true,
    compactMode: false,
    enableAI: true,
    aiModel: import.meta.env.VITE_AI_MODEL || "google/gemini-2.5-flash",
  });
  const [showCustomizer, setShowCustomizer] = useState(false);
  const restored = getRestoredSession();
  const [userGoal, setUserGoal] = useState<string>(restored?.userGoal ?? "");
  const [isPlanning, setIsPlanning] = useState(false);
  const [planGenerated, setPlanGenerated] = useState(restored?.planGenerated ?? false);
  const [steps, setSteps] = useState<Step[]>(restored?.steps ?? []);
  const [isRunning, setIsRunning] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState<number>(restored?.visibleSteps ?? 1);
  const [showFinalAnalysis, setShowFinalAnalysis] = useState(restored?.showFinalAnalysis ?? false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showReviseForm, setShowReviseForm] = useState(false);
  const [finalRecommendations, setFinalRecommendations] = useState<any[]>(restored?.finalRecommendations ?? []);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [researchConfig, setResearchConfig] = useState<ResearchConfig>(restored?.researchConfig ?? defaultResearchConfig);
  const [currentGOAPState, setCurrentGOAPState] = useState<Record<string, boolean | string | number>>(restored?.currentGOAPState ?? defaultResearchConfig.stateDefinition.currentState);
  const [showGOAPCards, setShowGOAPCards] = useState(restored ? restored.steps.some((s) => s.status === "completed") : false);
  const activeStepRef = useRef<HTMLDivElement>(null);
  const goapCardsRef = useRef<HTMLDivElement>(null);
  const objectiveRef = useRef<HTMLDivElement>(null);
  const finalAnalysisRef = useRef<HTMLDivElement>(null);

  // GOAP Action definitions
  const createGOAPActions = (goal: string) => {
    const { domain, action, keywords } = parseGoal(goal);
    const keywordStr = keywords.join(", ");

    return [
      {
        name: "analyzeGoal",
        cost: 1,
        preconditions: { goalDefined: true },
        effects: { goalParsed: true },
        stepGenerator: (userGoal: string) => ({
          id: "1",
          title: t("main.stepGoalAnalysisTitle"),
          description: t("main.stepGoalAnalysisDesc", { goal: userGoal.slice(0, 60) }),
          icon: Target,
          status: "pending" as StepStatus,
          data: [
            {
              text: t("main.parseObjective"),
              icon: FileText,
              details: {
                objective: t("main.parseObjectiveDetail"),
                preconditions: [t("main.precUserInputReceived"), t("main.precNlpInitialized")],
                effects: [t("main.effectGoalObjectCreated"), t("main.effectSubGoalsIdentified")],
                agents: [t("main.agentParser"), t("main.agentNlp")],
              }
            },
            {
              text: t("main.identifyDependencies"),
              icon: Link,
              details: {
                objective: t("main.identifyDependenciesDetail"),
                preconditions: [t("main.precGoalParsed"), t("main.precActionLibLoaded")],
                effects: [t("main.effectDependencyGraph"), t("main.effectCriticalPath")],
                agents: [t("main.agentDependencyAnalyzer"), t("main.agentGraphBuilder")],
                sources: [t("main.sourceActionRegistry"), t("main.sourceStateDefinitions")]
              }
            },
            {
              text: t("main.mapStateTransitions"),
              icon: Workflow,
              details: {
                objective: t("main.mapStateTransitionsDetail"),
                preconditions: [t("main.precDepsMapped"), t("main.precStateSpaceDefined")],
                effects: [t("main.effectTransitionMatrix"), t("main.effectReachability")],
                agents: [t("main.agentStateMapper"), t("main.agentValidator")],
                citations: ["GOAP: Goal-Oriented Action Planning - Orkin, J. (2006)"]
              }
            },
          ],
          metrics: [{ label: t("main.metricSubGoals"), value: "3" }, { label: t("main.metricActions"), value: "7" }],
        }),
      },
      {
        name: "assessState",
        cost: 1,
        preconditions: { goalParsed: true },
        effects: { stateAssessed: true },
        stepGenerator: () => ({
          id: "2",
          title: t("main.stepStateAssessmentTitle"),
          description: t("main.stepStateAssessmentDesc", { domain }),
          icon: Brain,
          status: "pending" as StepStatus,
          data: [
            {
              text: t("main.assessingCurrentState"),
              icon: Database,
              details: {
                objective: t("main.assessingCurrentStateDetail", { goal }),
                effects: [t("main.effectBaseline"), t("main.effectGapsIdentified")],
                agents: [t("main.agentStateAssessor")],
              }
            },
            {
              text: t("main.definingSuccessCriteria"),
              icon: CheckCircle2,
              details: {
                objective: t("main.definingSuccessCriteriaDetail", { domain }),
                preconditions: [t("main.precGoalsDefined")],
                effects: [t("main.effectValidationCriteria"), t("main.effectAcceptanceTests")],
              }
            },
            {
              text: t("main.analyzingGaps"),
              icon: TrendingUp,
              details: {
                objective: t("main.analyzingGapsDetail", { domain, action }),
                effects: [t("main.effectPriorityList"), t("main.effectResourceNeeds")],
                agents: [t("main.agentGapAnalyzer"), t("main.agentPriorityRanker")],
              }
            },
          ],
          metrics: [],
        }),
      },
      {
        name: "gatherInformation",
        cost: 2,
        preconditions: { stateAssessed: true },
        effects: { informationGathered: true },
        stepGenerator: () => ({
          id: "3",
          title: t("main.stepWebSearchTitle"),
          description: t("main.stepWebSearchDesc", { keywords: keywordStr }),
          icon: Search,
          status: "pending" as StepStatus,
          data: [
            {
              text: t("main.searchingFor", { action, method: keywords[0] || t("main.methods") }),
              icon: Search,
              details: {
                objective: t("main.searchingForDetail", { goal }),
                sources: ["arXiv.org", "Google Scholar", "ACM Digital Library"],
                agents: [t("main.agentSearch"), t("main.agentQueryOptimizer")],
              }
            },
            {
              text: t("main.gatheringSources"),
              icon: Database,
              details: {
                objective: t("main.gatheringSourcesDetail", { domain }),
                effects: [t("main.effectSourceDbPopulated"), t("main.effectRelevanceScores")],
              }
            },
            {
              text: t("main.calculatingRelevance"),
              icon: TrendingUp,
              details: {
                objective: t("main.calculatingRelevanceDetail", { keywords: keywordStr }),
                agents: [t("main.agentRelevanceScorer"), t("main.agentMlClassifier")],
                citations: ["Information Retrieval Metrics - Manning et al."]
              }
            },
          ],
          metrics: [],
        }),
      },
      {
        name: "analyzeDocuments",
        cost: 2,
        preconditions: { informationGathered: true },
        effects: { documentsAnalyzed: true },
        stepGenerator: () => ({
          id: "4",
          title: t("main.stepDocumentAnalysisTitle"),
          description: t("main.stepDocumentAnalysisDesc", { domain }),
          icon: FileSearch,
          status: "pending" as StepStatus,
          data: [
            {
              text: t("main.parsingDocuments"),
              icon: FileText,
              details: {
                objective: t("main.parsingDocumentsDetail", { domain, goal }),
                preconditions: [t("main.precDocsRetrieved"), t("main.precParserLoaded")],
                effects: [t("main.effectContentExtracted"), t("main.effectMetadataCatalogued")],
                agents: [t("main.agentDocumentParser"), t("main.agentTextExtractor")],
                sources: [t("main.sourcePdfParser"), t("main.sourceHtmlScraper"), t("main.sourceApiResponses")]
              }
            },
            {
              text: t("main.extractingInsights"),
              icon: Lightbulb,
              details: {
                objective: t("main.extractingInsightsDetail", { keywords: keywordStr }),
                preconditions: [t("main.precDocsParsed"), t("main.precNlpReady")],
                effects: [t("main.effectInsightsDb"), t("main.effectKeyPoints")],
                agents: [t("main.agentInsightExtractor"), t("main.agentNlpAnalyzer"), t("main.agentPatternRecognizer")],
                citations: ["Named Entity Recognition - Nadeau & Sekine"]
              }
            },
            {
              text: t("main.validatingClaims"),
              icon: Shield,
              details: {
                objective: t("main.validatingClaimsDetail", { domain, action }),
                preconditions: [t("main.precInsightsExtracted"), t("main.precValidationRules")],
                effects: [t("main.effectAccuracyScores"), t("main.effectUnreliableFlagged")],
                agents: [t("main.agentFactChecker"), t("main.agentSourceValidator"), t("main.agentCrossReferencer")],
                sources: [t("main.sourceFactCheckApis"), t("main.sourceCitationDatabases")]
              }
            },
          ],
          metrics: [],
        }),
      },
      {
        name: "synthesizeKnowledge",
        cost: 2,
        preconditions: { documentsAnalyzed: true },
        effects: { knowledgeSynthesized: true },
        stepGenerator: () => ({
          id: "5",
          title: t("main.stepKnowledgeSynthesisTitle"),
          description: t("main.stepKnowledgeSynthesisDesc", { domain }),
          icon: GitBranch,
          status: "pending" as StepStatus,
          data: [
            {
              text: t("main.crossReferencingSources"),
              icon: Link,
              details: {
                objective: t("main.crossReferencingSourcesDetail", { goal, domain }),
                preconditions: [t("main.precSourcesValidated"), t("main.precCorrelationRules")],
                effects: [t("main.effectSourceConnections"), t("main.effectConfidenceAdjusted")],
                agents: [t("main.agentCrossReferencer"), t("main.agentCorrelationAnalyzer")],
                sources: [t("main.sourceAcademicPapers"), t("main.sourceIndustryReports"), t("main.sourceTechnicalDocs")]
              }
            },
            {
              text: t("main.mergingConcepts"),
              icon: GitBranch,
              details: {
                objective: t("main.mergingConceptsDetail", { keywords: keywordStr }),
                preconditions: [t("main.precConceptsIdentified"), t("main.precRelationshipsDefined")],
                effects: [t("main.effectKnowledgeGraph"), t("main.effectTaxonomyRefined")],
                agents: [t("main.agentConceptMerger"), t("main.agentOntologyBuilder"), t("main.agentSemanticAnalyzer")],
                citations: ["Knowledge Graphs - Hogan et al. (2021)"]
              }
            },
            {
              text: t("main.resolvingConflicts"),
              icon: CheckCircle2,
              details: {
                objective: t("main.resolvingConflictsDetail", { domain, action }),
                preconditions: [t("main.precConflictsDetected"), t("main.precResolutionStrategies")],
                effects: [t("main.effectConsensusReached"), t("main.effectConflictLogged")],
                agents: [t("main.agentConflictResolver"), t("main.agentEvidenceWeigher"), t("main.agentDecisionMaker")],
                sources: [t("main.sourceCredibilityScores"), t("main.sourceTemporalData"), t("main.sourceExpertSystems")]
              }
            },
          ],
          metrics: [{ label: t("main.metricSources"), value: "18" }, { label: t("main.metricConcepts"), value: "12" }],
        }),
      },
      {
        name: "generateInsights",
        cost: 2,
        preconditions: { knowledgeSynthesized: true },
        effects: { insightsGenerated: true },
        stepGenerator: () => ({
          id: "6",
          title: t("main.stepInsightGenerationTitle"),
          description: t("main.stepInsightGenerationDesc", { domain }),
          icon: Lightbulb,
          status: "pending" as StepStatus,
          data: [
            {
              text: t("main.generatingInsights"),
              icon: Zap,
              details: {
                objective: t("main.generatingInsightsDetail", { goal, domain }),
                preconditions: [t("main.precKnowledgeSynthesized"), t("main.precAnalysisComplete")],
                effects: [t("main.effectActionableInsights"), t("main.effectRecommendations")],
                agents: [t("main.agentInsightGenerator"), t("main.agentRecommendationEngine"), t("main.agentInferenceAgent")],
                citations: ["Automated Reasoning - Robinson (1965)", "AI Planning - Ghallab et al."]
              }
            },
            {
              text: t("main.prioritizingByImpact"),
              icon: TrendingUp,
              details: {
                objective: t("main.prioritizingByImpactDetail", { keywords: keywordStr }),
                preconditions: [t("main.precInsightsGenerated"), t("main.precImpactMetrics")],
                effects: [t("main.effectPriorityScores"), t("main.effectImplementationOrder")],
                agents: [t("main.agentPriorityRanker"), t("main.agentImpactAnalyzer"), t("main.agentRoiCalculator")],
                sources: [t("main.sourceBusinessMetrics"), t("main.sourceHistoricalOutcomes"), t("main.sourceExpertHeuristics")]
              }
            },
            {
              text: t("main.validatingFeasibility"),
              icon: CheckCircle2,
              details: {
                objective: t("main.validatingFeasibilityDetail", { domain, action }),
                preconditions: [t("main.precInsightsPrioritized"), t("main.precConstraintDb")],
                effects: [t("main.effectFeasibilityScores"), t("main.effectResourcesEstimated")],
                agents: [t("main.agentFeasibilityValidator"), t("main.agentResourcePlanner"), t("main.agentConstraintChecker")],
                sources: [t("main.sourceAvailableResources"), t("main.sourceTechnicalConstraints"), t("main.sourceTimelineRequirements")]
              }
            },
          ],
          metrics: [],
        }),
      },
      {
        name: "verify",
        cost: 1,
        preconditions: { insightsGenerated: true },
        effects: { verified: true },
        stepGenerator: () => ({
          id: "7",
          title: t("main.stepVerificationTitle"),
          description: t("main.stepVerificationDesc"),
          icon: CheckCircle2,
          status: "pending" as StepStatus,
          data: [
            {
              text: t("main.verifyingInsights"),
              icon: Shield,
              details: {
                objective: t("main.verifyingInsightsDetail", { goal, domain }),
                preconditions: [t("main.precInsightsValidated"), t("main.precVerificationCriteria")],
                effects: [t("main.effectQualityConfirmed"), t("main.effectErrorsCorrected")],
                agents: [t("main.agentQaAgent"), t("main.agentVerificationBot"), t("main.agentAuditAgent")],
                sources: [t("main.sourceQualityStandards"), t("main.sourceBestPractices"), t("main.sourceValidationProtocols")]
              }
            },
            {
              text: t("main.checkingSources"),
              icon: Filter,
              details: {
                objective: t("main.checkingSourcesDetail", { keywords: keywordStr }),
                preconditions: [t("main.precSourcesCatalogued"), t("main.precVerificationComplete")],
                effects: [t("main.effectSourceReliability"), t("main.effectCitationsVerified")],
                agents: [t("main.agentSourceChecker"), t("main.agentCitationValidator"), t("main.agentProvenanceTracker")],
                citations: ["Information Provenance - Buneman et al. (2001)"]
              }
            },
            {
              text: t("main.calculatingConfidence"),
              icon: TrendingUp,
              details: {
                objective: t("main.calculatingConfidenceDetail", { action }),
                preconditions: [t("main.precAllChecksComplete"), t("main.precConfidenceModel")],
                effects: [t("main.effectConfidenceScore"), t("main.effectReportReady")],
                agents: [t("main.agentConfidenceCalculator"), t("main.agentStatisticalAnalyzer"), t("main.agentMetaEvaluator")],
                sources: [t("main.sourceValidationResults"), t("main.sourceQualityScores"), t("main.sourceCrossReferenceMatches")]
              }
            },
          ],
          metrics: [],
        }),
      },
    ];
  };

  // Handle goal submission and planning
  const handleGoalSubmit = async (goal: string) => {
    setUserGoal(goal);
    setIsPlanning(true);
    setShowFinalAnalysis(false);
    setShowGOAPCards(false);

    // Simulate planning phase
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Reset GOAP state to initial
    setCurrentGOAPState(researchConfig.stateDefinition.currentState);

    // Create GOAP planner
    const actions = createGOAPActions(goal);
    const planner = new GOAPPlanner(actions);

    // Calculate adaptive metrics based on goal complexity and GOAP config
    const goalComplexity = goal.split(' ').length;
    const adaptiveSubGoals = Math.min(
      Math.max(2, Math.ceil(goalComplexity / 10)), // 2-5 sub-goals based on word count
      researchConfig.parameters.maxSteps
    );
    
    const adaptiveActions = researchConfig.goapConfig.executionMode === "open" 
      ? researchConfig.parameters.maxSteps + 3 // More actions in open mode
      : researchConfig.goapConfig.executionMode === "focused"
      ? Math.min(5, researchConfig.parameters.maxSteps) // Fewer actions in focused mode
      : researchConfig.parameters.maxSteps; // Normal for closed mode

    // Define current and goal states
    const currentState = {
      goalDefined: true,
      goalParsed: false,
      stateAssessed: false,
      informationGathered: false,
      documentsAnalyzed: false,
      knowledgeSynthesized: false,
      insightsGenerated: false,
      verified: false,
    };

    const goalState = {
      goalDefined: true,
      goalParsed: true,
      stateAssessed: true,
      informationGathered: true,
      documentsAnalyzed: true,
      knowledgeSynthesized: true,
      insightsGenerated: true,
      verified: true,
    };

    // Generate plan
    const plan = planner.plan(currentState, goalState, goal);

    if (plan.length === 0) {
      toast({
        title: t("main.toastPlanningFailed"),
        description: t("main.toastPlanningFailedDesc"),
        variant: "destructive",
      });
      setIsPlanning(false);
      return;
    }

    // Update Goal Analysis step with adaptive metrics
    if (plan[0]) {
      plan[0].metrics = [
        { label: t("main.metricSubGoals"), value: String(adaptiveSubGoals) },
        { label: t("main.metricActions"), value: String(adaptiveActions) }
      ];
    }

    toast({
      title: t("main.toastPlanGenerated"),
      description: t("main.toastPlanGeneratedDesc", { count: plan.length }),
    });

    setSteps(plan);
    setIsPlanning(false);
    setPlanGenerated(true);
    setVisibleSteps(1);
    // Issue #1694: do NOT auto-execute. Wait for the user to click
    // "Start Research" so the planning step is observable and reversible.
  };

  // Execute research plan
  const executeResearch = async (stepsToExecute?: Step[], researchGoal?: string) => {
    const initialSteps = stepsToExecute || steps;
    console.log('executeResearch started, steps:', initialSteps.length);
    console.log('GOAP Config:', {
      executionMode: researchConfig.goapConfig.executionMode,
      enableReplanning: researchConfig.goapConfig.enableReplanning,
      costOptimization: researchConfig.goapConfig.costOptimization,
      parallelExecution: researchConfig.goapConfig.parallelExecution,
    });
    
    setIsRunning(true);
    setShowFinalAnalysis(false);
    
    // Animate GOAP cards in
    setTimeout(() => setShowGOAPCards(true), 300);
    
    // Wait for GOAP cards animation to complete (4 seconds total)
    // State Assessment: 2s, Config: 1.5s delay + 2.5s = 4s total
    await new Promise(resolve => setTimeout(resolve, 4500));

    // Keep a working copy that we update with AI data
    let workingSteps = [...initialSteps];

    // Process each step sequentially
    for (let i = 0; i < workingSteps.length; i++) {
      console.log(`\n=== Processing step ${i}: ${workingSteps[i].title} ===`);
      
      // Update GOAP state based on step progression
      const stateUpdates: Record<string, boolean> = {
        goalParsed: i >= 0,
        stateAssessed: i >= 1,
        informationGathered: i >= 2,
        documentsAnalyzed: i >= 3,
        knowledgeSynthesized: i >= 4,
        insightsGenerated: i >= 5,
        verified: i >= 6,
      };
      
      setCurrentGOAPState(prev => ({ ...prev, ...stateUpdates }));
      console.log('GOAP State Updated:', stateUpdates);
      
      // Show and activate current step
      setVisibleSteps(i + 1);
      setSteps((prev) => {
        const newSteps = [...prev];
        newSteps[i].status = "active";
        return newSteps;
      });

      // Wait a moment for UI to update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Call edge function to get real research data from Gemini
      if (widgetConfig.enableAI) {
        try {
          const currentStep = workingSteps[i];
          
          // Build context from all previous completed steps (with their AI data)
          const previousStepsData = workingSteps.slice(0, i).map(step => ({
            stepTitle: step.title,
            data: step.data.map(item => {
              const details = item.details as any;
              return {
                id: '',
                title: item.text,
                content: details?.objective || item.text,
                source: details?.source || (Array.isArray(details?.sources) ? details.sources[0] : undefined),
                confidence: details?.confidence,
                timestamp: details?.timestamp || new Date().toISOString(),
              };
            })
          }));
          
          console.log(`📤 Calling Gemini API for step ${i}`);
          console.log(`   Context: ${previousStepsData.length} previous steps with ${previousStepsData.reduce((sum, s) => sum + s.data.length, 0)} total data items`);
          
          const { data, error } = await supabase.functions.invoke('research-step', {
            body: {
              goal: researchGoal || userGoal,
              language: lang,
              stepTitle: currentStep.title,
              stepDescription: currentStep.description,
              stepType: currentStep.id,
              aiModel: widgetConfig.aiModel,
              config: {
                researchGuidance: researchConfig.researchGuidance,
                prompts: researchConfig.prompts,
                parameters: researchConfig.parameters,
                filters: researchConfig.filters,
              },
              previousStepsData: previousStepsData,
            },
          });

          if (error) {
            console.error('❌ Error fetching research data:', error);

            // Check if replanning is enabled
            if (researchConfig.goapConfig.enableReplanning) {
              console.log('🔄 Replanning enabled - checking triggers');
              const shouldReplan = researchConfig.goapConfig.replanningTriggers
                .map(translateTrigger)
                .includes(t("main.triggerActionFailure"));

              if (shouldReplan) {
                console.log('🔄 Replanning triggered due to action failure');
                toast({
                  title: t("main.toastReplanningTriggered"),
                  description: t("main.toastReplanningTriggeredDesc"),
                });
              }
            }

            toast({
              title: t("main.toastAiResearchError"),
              description: error.message || t("main.toastAiResearchErrorDesc"),
              variant: "destructive",
            });
          } else if (data && Array.isArray(data)) {
            console.log(`✅ Gemini returned ${data.length} items for step ${i}`);
            
            // Transform AI data into step data format
            const aiData = data.map((item: any) => ({
              text: item.title,
              icon: Sparkles,
              details: {
                objective: item.content,
                source: item.source,
                confidence: item.confidence,
                timestamp: item.timestamp,
              }
            }));
            
            // Update working copy with AI data (THIS is what gets passed to next step)
            workingSteps[i].data = aiData;
            console.log(`💾 Updated working copy of step ${i} - will be used as context for step ${i + 1}`);
            
            // Also update UI state
            setSteps((prev) => {
              const newSteps = [...prev];
              if (newSteps[i]) {
                newSteps[i].data = aiData;
              }
              return newSteps;
            });
          }
        } catch (err) {
          console.error('Exception calling research-step:', err);
          toast({
            title: t("main.toastAiResearchError"),
            description: t("main.toastAiConnectErrorDesc"),
            variant: "destructive",
          });
        }
      }

      // Wait for research to complete (simulate processing time)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Complete current step
      workingSteps[i].status = "completed";
      setSteps((prev) => {
        const newSteps = [...prev];
        newSteps[i].status = "completed";
        console.log(`✓ Completed step ${i}: ${newSteps[i].title}`);
        return newSteps;
      });

      // Wait before moving to next step
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log(`=== Step ${i} complete. Moving to next step ===\n`);
    }

    // All steps complete
    setIsRunning(false);
    
    // Generate final research report with all context
    if (widgetConfig.enableAI) {
      try {
        // Build comprehensive context from all completed steps
        const allResearchContext = workingSteps.map(step => ({
          stepTitle: step.title,
          data: step.data.map(item => {
            const details = item.details as any;
            return {
              id: '',
              title: item.text,
              content: details?.objective || item.text,
              source: details?.source || (Array.isArray(details?.sources) ? details.sources[0] : undefined),
              confidence: details?.confidence,
              timestamp: details?.timestamp || new Date().toISOString(),
            };
          })
        }));

        const { data, error } = await supabase.functions.invoke('research-step', {
          body: {
            goal: researchGoal || userGoal,
            language: lang,
            stepTitle: "Final Recommendations",
            stepDescription: `Based on all research findings, provide specific, actionable recommendations that directly answer: "${researchGoal || userGoal}". Include concrete suggestions with supporting data from the research.`,
            stepType: "final-report",
            aiModel: widgetConfig.aiModel,
            previousStepsData: allResearchContext,
          },
        });

        if (!error && data && Array.isArray(data)) {
          console.log('Final report recommendations generated:', data.length, 'items');
          setFinalRecommendations(data);
        }
      } catch (err) {
        console.error('Error generating final report:', err);
      }
    }
    
    setTimeout(() => {
      setShowFinalAnalysis(true);
    }, 1000);
  };

  const resetAll = () => {
    setUserGoal("");
    setPlanGenerated(false);
    setSteps([]);
    setIsRunning(false);
    setShowFinalAnalysis(false);
    setShowReportModal(false);
    setShowReviseForm(false);
    setShowAdvancedSettings(false);
    setShowGOAPCards(false);
    setFinalRecommendations([]);
    setResearchConfig(defaultResearchConfig);
    setCurrentGOAPState(defaultResearchConfig.stateDefinition.currentState);
    setVisibleSteps(1);
    try {
      localStorage.removeItem(RESEARCH_SESSION_KEY);
    } catch (err) {
      console.warn("Failed to clear persisted research session:", err);
    }
  };

  const handleReviseSubmit = (config: ResearchConfig) => {
    console.log("Revised research config:", config);
    setResearchConfig(config);
    setShowReviseForm(false);
    setUserGoal(config.goal);
    handleGoalSubmit(config.goal);
    toast({
      title: t("main.toastResearchRevised"),
      description: t("main.toastResearchRevisedDesc"),
    });
  };

  const handleAdvancedSettingsSubmit = (config: ResearchConfig) => {
    console.log("Advanced research config:", config);
    setResearchConfig(config);
    setShowAdvancedSettings(false);
    
    // If there's a goal in the config, update it
    if (config.goal && config.goal !== userGoal) {
      setUserGoal(config.goal);
    }
    
    toast({
      title: t("main.toastAdvancedSettingsApplied"),
      description: t("main.toastAdvancedSettingsAppliedDesc"),
    });
  };

  const handleGenerateWidget = () => {
    toast({
      title: t("main.toastWidgetCodeGenerated"),
      description: t("main.toastWidgetCodeGeneratedDesc"),
    });
  };

  // Auto-scroll effects
  useEffect(() => {
    if (activeStepRef.current && isRunning) {
      activeStepRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [visibleSteps, isRunning]);

  useEffect(() => {
    if (goapCardsRef.current && showGOAPCards) {
      setTimeout(() => {
        goapCardsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 200);
      
      // After GOAP Configuration completes (1.5s delay + 2.5s animation = 4s), scroll to objective
      setTimeout(() => {
        objectiveRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 4200);
    }
  }, [showGOAPCards]);

  useEffect(() => {
    if (finalAnalysisRef.current && showFinalAnalysis) {
      setTimeout(() => {
        finalAnalysisRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 300);
    }
  }, [showFinalAnalysis]);

  // Persist the research session so a refresh restores goal, plan, findings and report.
  useEffect(() => {
    if (!planGenerated || steps.length === 0) return;
    try {
      localStorage.setItem(RESEARCH_SESSION_KEY, JSON.stringify({
        v: 3,
        userGoal,
        steps,
        finalRecommendations,
        researchConfig,
        currentGOAPState,
        visibleSteps,
        planGenerated,
        showFinalAnalysis,
      }));
    } catch (err) {
      console.warn("Failed to persist research session:", err);
    }
  }, [userGoal, steps, finalRecommendations, researchConfig, currentGOAPState, visibleSteps, planGenerated, showFinalAnalysis]);

  return (
    <div 
      className="min-h-screen transition-colors duration-300"
      style={{ 
        backgroundColor: widgetConfig.backgroundColor,
        fontFamily: widgetConfig.fontFamily,
      }}
    >
      {/* Hero Section */}
      <div className="border-b" style={{ borderColor: `${widgetConfig.primaryColor}40` }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="text-center animate-fade-in">
            <div 
              className="inline-flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded border text-xs sm:text-sm mb-3 sm:mb-4"
              style={{ 
                backgroundColor: `${widgetConfig.primaryColor}20`,
                borderColor: `${widgetConfig.primaryColor}40`,
                color: widgetConfig.primaryColor
              }}
            >
              <Network className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">{widgetConfig.brandName || t("main.heroBrandFallback")}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-2 sm:mb-3 px-2" style={{ color: "#f5f5f5" }}>
              {widgetConfig.title}
            </h1>
            <p className="text-xs sm:text-sm max-w-xl mx-auto px-4 mb-3" style={{ color: "#a3a3a3" }}>
              {widgetConfig.description}
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {planGenerated && (
                <Button
                  onClick={resetAll}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs sm:text-sm"
                >
                  <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
                  {t("main.newResearch")}
                </Button>
              )}
              <RouterLink to="/demo">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs sm:text-sm"
                >
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{t("main.widgetDemo")}</span>
                  <span className="sm:hidden">{t("main.demoShort")}</span>
                </Button>
              </RouterLink>
              <RouterLink to="/agents">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs sm:text-sm"
                >
                  <Code className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{t("main.agentSwarm")}</span>
                  <span className="sm:hidden">{t("main.agentsShort")}</span>
                </Button>
              </RouterLink>
              <Button
                onClick={() => setShowCustomizer(!showCustomizer)}
                variant="outline"
                size="sm"
                className="gap-2 text-xs sm:text-sm"
              >
                <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{showCustomizer ? t("main.close") : t("main.createWidget")}</span>
                <span className="sm:hidden">{showCustomizer ? t("main.close") : t("main.widgetShort")}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Widget Customization Modal */}
        <Dialog open={showCustomizer} onOpenChange={setShowCustomizer}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{t("main.widgetCustomizationTitle")}</DialogTitle>
            </DialogHeader>
            <WidgetCustomizer
              config={widgetConfig}
              onConfigChange={setWidgetConfig}
              onGenerate={handleGenerateWidget}
            />
          </DialogContent>
        </Dialog>

        {/* Goal Input */}
        {!planGenerated && (
          <div 
            style={{ 
              '--card-bg': widgetConfig.backgroundColor,
              '--border-color': `${widgetConfig.primaryColor}40`
            } as React.CSSProperties}
          >
          <GoalInput
            onSubmit={handleGoalSubmit}
            isPlanning={isPlanning}
            onAdvancedSettings={() => setShowAdvancedSettings(true)}
            onConfigUpdate={(optimizedConfig) => {
              setResearchConfig(prev => ({
                ...prev,
                researchGuidance: {
                  ...prev.researchGuidance,
                  ...optimizedConfig.researchGuidance
                },
                prompts: {
                  ...prev.prompts,
                  ...optimizedConfig.prompts
                },
                parameters: {
                  ...prev.parameters,
                  ...optimizedConfig.parameters
                },
                filters: {
                  ...prev.filters,
                  ...optimizedConfig.filters
                },
                goapConfig: {
                  ...prev.goapConfig,
                  ...optimizedConfig.goapConfig
                }
              }));
            }}
          />
          </div>
        )}

        {/* Planning Status */}
        {isPlanning && (
          <div 
            className="mt-8 border rounded-lg p-6 animate-pulse"
            style={{ 
              backgroundColor: `${widgetConfig.backgroundColor}dd`,
              borderColor: `${widgetConfig.primaryColor}40`
            }}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 animate-spin" style={{ color: widgetConfig.primaryColor }} />
              <div>
                <h3 className="font-medium" style={{ color: "#f5f5f5" }}>{t("main.planningWorkflow")}</h3>
                <p className="text-sm" style={{ color: "#a3a3a3" }}>
                  {t("main.planningWorkflowDesc")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Research Execution */}
        {planGenerated && steps.length > 0 && (
          <>
            {/* GOAP Configuration and State Assessment - Animated */}
            {showGOAPCards && (
              <div ref={goapCardsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div 
                  className="opacity-0"
                  style={{ 
                    animation: 'fade-in 2s ease-out forwards',
                    animationDelay: '0ms' 
                  }}
                >
                  <StateAssessmentCard
                    currentState={currentGOAPState}
                    goalState={researchConfig.stateDefinition.goalState}
                    stateGaps={researchConfig.stateDefinition.stateGaps.map(translateGap)}
                    primaryColor={widgetConfig.primaryColor}
                    accentColor={widgetConfig.accentColor}
                  />
                </div>
                <div 
                  className="opacity-0"
                  style={{ 
                    animation: 'fade-in 2.5s ease-out forwards',
                    animationDelay: '1500ms' 
                  }}
                >
                  <GOAPConfigDisplay
                    executionMode={researchConfig.goapConfig.executionMode}
                    enableReplanning={researchConfig.goapConfig.enableReplanning}
                    replanningTriggers={researchConfig.goapConfig.replanningTriggers.map(translateTrigger)}
                    costOptimization={researchConfig.goapConfig.costOptimization}
                    parallelExecution={researchConfig.goapConfig.parallelExecution}
                    maxActionCost={researchConfig.actionConfig.maxActionCost}
                    primaryColor={widgetConfig.primaryColor}
                  />
                </div>
              </div>
            )}

            {/* Control Button */}
            <div ref={objectiveRef} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-6 sm:mb-8">
              <Button
                onClick={resetAll}
                variant="outline"
                size="sm"
                disabled={isRunning}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                {t("main.newResearch")}
              </Button>
              <div className="text-xs sm:text-sm flex-1 min-w-0 text-center px-4" style={{ color: "#a3a3a3" }}>
                <span className="font-medium" style={{ color: "#f5f5f5" }}>{t("main.objectiveLabel")}</span> <span className="break-words">{userGoal}</span>
              </div>
              {/* Issue #1694: explicit "Start Research" gate so the plan is reviewable before execution. */}
              {!isRunning && visibleSteps <= 1 ? (
                <Button
                  onClick={() => executeResearch(steps, userGoal)}
                  size="sm"
                  className="gap-2"
                  style={{ backgroundColor: widgetConfig.primaryColor, color: "#fff" }}
                >
                  <Play className="w-4 h-4" />
                  {t("main.startResearch")}
                </Button>
              ) : (
                <div className="w-[120px]" />
              )}
            </div>

              {/* Timeline */}
              <div className="relative">
                {/* Vertical line */}
                <div 
                  className="absolute left-0 sm:left-0 top-0 bottom-0 w-px ml-1.5 sm:ml-2.5"
                  style={{ backgroundColor: `${widgetConfig.primaryColor}40` }}
                />

                {/* Steps */}
                <div 
                  className="pl-6 sm:pl-10"
                  style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    gap: widgetConfig.cardSpacing
                  }}
                >
                {steps.slice(0, visibleSteps).map((step, index) => (
                  <div
                    key={step.id}
                    ref={index === visibleSteps - 1 ? activeStepRef : null}
                  >
                    <AgentStep
                      title={step.title}
                      description={step.description}
                      icon={step.icon}
                      status={step.status}
                      delay={0}
                      data={step.data}
                      metrics={widgetConfig.showMetrics ? step.metrics : undefined}
                      primaryColor={widgetConfig.primaryColor}
                      accentColor={widgetConfig.accentColor}
                      cardBackgroundColor={widgetConfig.cardBackgroundColor}
                      cardBorderColor={widgetConfig.cardBorderColor}
                      textColor={widgetConfig.textColor}
                      secondaryTextColor={widgetConfig.secondaryTextColor}
                      successColor={widgetConfig.successColor}
                      borderRadius={widgetConfig.borderRadius}
                      animationSpeed={widgetConfig.animationSpeed}
                      compactMode={widgetConfig.compactMode}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            {widgetConfig.showStats && (
              <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div 
                  className="border p-4 text-center"
                  style={{ 
                    backgroundColor: `${widgetConfig.backgroundColor}dd`,
                    borderColor: `${widgetConfig.primaryColor}40`,
                    borderRadius: widgetConfig.borderRadius,
                  }}
                >
                  <div className="text-2xl font-semibold mb-1" style={{ color: widgetConfig.primaryColor }}>
                    {steps.filter((s) => s.status === "completed").length}
                  </div>
                  <div className="text-xs" style={{ color: "#a3a3a3" }}>{t("main.statCompleted")}</div>
                </div>
                <div
                  className="border p-4 text-center"
                  style={{
                    backgroundColor: `${widgetConfig.backgroundColor}dd`,
                    borderColor: `${widgetConfig.primaryColor}40`,
                    borderRadius: widgetConfig.borderRadius,
                  }}
                >
                  <div className="text-2xl font-semibold mb-1" style={{ color: widgetConfig.primaryColor }}>
                    {steps.filter((s) => s.status === "active").length}
                  </div>
                  <div className="text-xs" style={{ color: "#a3a3a3" }}>{t("main.statActive")}</div>
                </div>
                <div 
                  className="border p-4 text-center"
                  style={{ 
                    backgroundColor: `${widgetConfig.backgroundColor}dd`,
                    borderColor: `${widgetConfig.primaryColor}40`,
                    borderRadius: widgetConfig.borderRadius,
                  }}
                >
                  <div className="text-2xl font-semibold mb-1" style={{ color: "#737373" }}>
                    {steps.filter((s) => s.status === "pending").length}
                  </div>
                  <div className="text-xs" style={{ color: "#a3a3a3" }}>{t("main.statPending")}</div>
                </div>
              </div>
            )}

            {/* Final Research Report */}
            {showFinalAnalysis && (
              <div 
                ref={finalAnalysisRef}
                className="mt-8 space-y-6 animate-scale-in"
              >
                {/* Header */}
                <div 
                  className="rounded-lg p-6"
                  style={{
                    background: `linear-gradient(to bottom right, ${widgetConfig.accentColor}1a, ${widgetConfig.accentColor}0d)`,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: `${widgetConfig.accentColor}4d`
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div 
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: `${widgetConfig.accentColor}33` }}
                    >
                      <FileText className="w-6 h-6" style={{ color: widgetConfig.accentColor }} />
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-2 flex items-center gap-2" style={{ color: widgetConfig.accentColor }}>
                        {t("main.reportFinalTitle")}
                        <CheckCircle2 className="w-5 h-5" />
                      </h3>
                      <p className="text-sm mb-4" style={{ color: "#a3a3a3" }}>
                        {t("main.reportFinalSubtitle")}
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                        <div className="rounded p-3" style={{ backgroundColor: `${widgetConfig.backgroundColor}80` }}>
                          <div className="text-xs mb-1" style={{ color: "#a3a3a3" }}>{t("main.reportTotalSteps")}</div>
                          <div className="text-xl font-semibold" style={{ color: "#f5f5f5" }}>{steps.length}</div>
                        </div>
                        <div className="rounded p-3" style={{ backgroundColor: `${widgetConfig.backgroundColor}80` }}>
                          <div className="text-xs mb-1" style={{ color: "#a3a3a3" }}>{t("main.reportDataPoints")}</div>
                          <div className="text-xl font-semibold" style={{ color: "#f5f5f5" }}>
                            {steps.reduce((acc, step) => acc + (step.data?.length || 0), 0)}
                          </div>
                        </div>
                        <div className="rounded p-3" style={{ backgroundColor: `${widgetConfig.backgroundColor}80` }}>
                          <div className="text-xs mb-1" style={{ color: "#a3a3a3" }}>{t("main.reportConfidence")}</div>
                          <div className="text-xl font-semibold" style={{ color: widgetConfig.accentColor }}>94%</div>
                        </div>
                        <div className="rounded p-3" style={{ backgroundColor: `${widgetConfig.backgroundColor}80` }}>
                          <div className="text-xs mb-1 flex items-center gap-1" style={{ color: "#a3a3a3" }}>
                            <Clock className="w-3 h-3" />
                            {t("main.reportDuration")}
                          </div>
                          <div className="text-xl font-semibold" style={{ color: "#f5f5f5" }}>
                            {Math.round(steps.length * 3.5)}s
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <div 
                  className="rounded-lg p-6"
                  style={{
                    backgroundColor: widgetConfig.cardBackgroundColor,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: widgetConfig.cardBorderColor
                  }}
                >
                  <h4 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: widgetConfig.textColor }}>
                    <Target className="w-5 h-5" style={{ color: widgetConfig.primaryColor }} />
                    {t("main.reportExecutiveSummary")}
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: widgetConfig.secondaryTextColor }}>
                    {t("main.reportExecutiveSummaryBody", { goal: userGoal, count: steps.length })}
                  </p>
                </div>

                {/* Tabbed Report Sections */}
                <Tabs defaultValue="direct-answer" className="w-full">
                  <TabsList 
                    className="w-full grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-2 h-auto p-1"
                    style={{
                      backgroundColor: widgetConfig.cardBackgroundColor,
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: widgetConfig.cardBorderColor
                    }}
                  >
                    <TabsTrigger 
                      value="direct-answer"
                      className="text-xs md:text-sm py-2 md:py-2.5"
                      style={{
                        color: widgetConfig.secondaryTextColor,
                      }}
                    >
                      <Sparkles className="w-4 h-4 mr-1 md:mr-2" />
                      <span className="hidden sm:inline">{t("main.tabDirectAnswer")}</span>
                      <span className="sm:hidden">{t("main.tabAnswerShort")}</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="key-findings"
                      className="text-xs md:text-sm py-2 md:py-2.5"
                      style={{
                        color: widgetConfig.secondaryTextColor,
                      }}
                    >
                      <Lightbulb className="w-4 h-4 mr-1 md:mr-2" />
                      <span className="hidden sm:inline">{t("main.tabKeyFindings")}</span>
                      <span className="sm:hidden">{t("main.tabFindingsShort")}</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="methodology"
                      className="text-xs md:text-sm py-2 md:py-2.5"
                      style={{
                        color: widgetConfig.secondaryTextColor,
                      }}
                    >
                      <Workflow className="w-4 h-4 mr-1 md:mr-2" />
                      <span className="hidden sm:inline">{t("main.tabMethodology")}</span>
                      <span className="sm:hidden">{t("main.tabMethodShort")}</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="next-steps"
                      className="text-xs md:text-sm py-2 md:py-2.5"
                      style={{
                        color: widgetConfig.secondaryTextColor,
                      }}
                    >
                      <TrendingUp className="w-4 h-4 mr-1 md:mr-2" />
                      <span className="hidden sm:inline">{t("main.tabNextSteps")}</span>
                      <span className="sm:hidden">{t("main.tabStepsShort")}</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Direct Answer Tab */}
                  <TabsContent value="direct-answer" className="mt-4">
                    {finalRecommendations.length > 0 ? (
                      <div 
                        className="rounded-lg p-6"
                        style={{
                          backgroundColor: widgetConfig.cardBackgroundColor,
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          borderColor: widgetConfig.cardBorderColor
                        }}
                      >
                        <div className="space-y-4">
                          {finalRecommendations.slice(0, 4).map((rec: any, idx: number) => (
                            <div key={idx} className="rounded p-4" style={{ backgroundColor: `${widgetConfig.accentColor}0d` }}>
                              <div className="font-medium mb-1" style={{ color: widgetConfig.textColor }}>{rec.title}</div>
                              <p className="text-sm" style={{ color: widgetConfig.secondaryTextColor }}>{rec.content}</p>
                              {rec.source && (
                                <div className="mt-2 text-xs" style={{ color: widgetConfig.accentColor }}>{t("main.reportSourceLabel", { source: rec.source })}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="rounded-lg p-6 text-center"
                        style={{
                          backgroundColor: widgetConfig.cardBackgroundColor,
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          borderColor: widgetConfig.cardBorderColor
                        }}
                      >
                        <p className="text-sm" style={{ color: widgetConfig.secondaryTextColor }}>
                          {t("main.reportNoDirectAnswer")}
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Key Findings Tab */}
                  <TabsContent value="key-findings" className="mt-4">
                    <div 
                      className="rounded-lg p-6"
                      style={{
                        backgroundColor: widgetConfig.cardBackgroundColor,
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: widgetConfig.cardBorderColor
                      }}
                    >
                      <div className="space-y-3">
                        {steps.slice(0, 3).map((step, idx) => (
                          <div 
                            key={idx}
                            className="rounded p-4"
                            style={{ backgroundColor: `${widgetConfig.primaryColor}0d` }}
                          >
                            <div className="flex items-start gap-3">
                              <div 
                                className="p-1.5 rounded"
                                style={{ backgroundColor: `${widgetConfig.primaryColor}1a` }}
                              >
                                {step.icon && <step.icon className="w-4 h-4" style={{ color: widgetConfig.primaryColor }} />}
                              </div>
                              <div className="flex-1">
                                <h5 className="font-medium text-sm mb-1" style={{ color: widgetConfig.textColor }}>
                                  {step.title}
                                </h5>
                                <p className="text-xs" style={{ color: widgetConfig.secondaryTextColor }}>
                                  {step.description}
                                </p>
                                {step.data && step.data.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {step.data.slice(0, 3).map((item, i) => (
                                      <span 
                                        key={i}
                                        className="text-xs px-2 py-1 rounded"
                                        style={{ 
                                          backgroundColor: `${widgetConfig.accentColor}1a`,
                                          color: widgetConfig.accentColor 
                                        }}
                                      >
                                        {item.text}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Methodology Tab */}
                  <TabsContent value="methodology" className="mt-4">
                    <div 
                      className="rounded-lg p-6"
                      style={{
                        backgroundColor: widgetConfig.cardBackgroundColor,
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: widgetConfig.cardBorderColor
                      }}
                    >
                      <div className="space-y-2">
                        {steps.map((step, idx) => (
                          <div 
                            key={idx}
                            className="flex items-center gap-3 text-sm"
                          >
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                              style={{ 
                                backgroundColor: `${widgetConfig.successColor}33`,
                                color: widgetConfig.successColor 
                              }}
                            >
                              {idx + 1}
                            </div>
                            <span style={{ color: widgetConfig.secondaryTextColor }}>
                              {step.title}
                            </span>
                            <div className="flex-1 h-px" style={{ backgroundColor: widgetConfig.cardBorderColor }} />
                            <CheckCircle2 className="w-4 h-4" style={{ color: widgetConfig.successColor }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Next Steps Tab */}
                  <TabsContent value="next-steps" className="mt-4">
                    <div 
                      className="rounded-lg p-6"
                      style={{
                        backgroundColor: widgetConfig.cardBackgroundColor,
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: widgetConfig.cardBorderColor
                      }}
                    >
                      <ul className="space-y-2">
                        {[
                          t("main.reportNextStep1"),
                          t("main.reportNextStep2"),
                          t("main.reportNextStep3"),
                          t("main.reportNextStep4")
                        ].map((rec, idx) => (
                          <li 
                            key={idx}
                            className="flex items-start gap-2 text-sm"
                            style={{ color: widgetConfig.secondaryTextColor }}
                          >
                            <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: widgetConfig.accentColor }} />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Footer */}
                <div 
                  className="rounded-lg p-4 flex items-center justify-between"
                  style={{
                    backgroundColor: `${widgetConfig.successColor}0d`,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: `${widgetConfig.successColor}4d`
                  }}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4" style={{ color: widgetConfig.successColor }} />
                    <span style={{ color: widgetConfig.successColor, fontWeight: 500 }}>
                      {t("main.reportAllChecksPassed")}
                    </span>
                  </div>
                  <Button
                    onClick={resetAll}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t("main.newResearch")}
                  </Button>
                  <Button
                    onClick={() => setShowReportModal(true)}
                    size="sm"
                    className="gap-2"
                    style={{
                      backgroundColor: widgetConfig.accentColor,
                      color: '#fff'
                    }}
                  >
                    <FileText className="w-4 h-4" />
                    {t("main.reportViewFull")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Research Report Modal */}
      <ResearchReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        userGoal={userGoal}
        steps={steps}
        onRevise={() => {
          setShowReportModal(false);
          setShowReviseForm(true);
        }}
        primaryColor={widgetConfig.primaryColor}
        accentColor={widgetConfig.accentColor}
        successColor={widgetConfig.successColor}
      />

      {/* Revise Research Form Modal */}
      <Dialog open={showReviseForm} onOpenChange={setShowReviseForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              {t("main.reviseConfigTitle")}
            </DialogTitle>
          </DialogHeader>
          <ReviseResearchForm
            currentGoal={userGoal}
            onSubmit={handleReviseSubmit}
            onCancel={() => setShowReviseForm(false)}
            primaryColor={widgetConfig.primaryColor}
            accentColor={widgetConfig.accentColor}
            backgroundColor={widgetConfig.backgroundColor}
          />
        </DialogContent>
      </Dialog>

      {/* Advanced Settings Modal */}
      <Dialog open={showAdvancedSettings} onOpenChange={setShowAdvancedSettings}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {t("main.advancedSettingsTitle")}
            </DialogTitle>
          </DialogHeader>
          <ReviseResearchForm
            currentGoal={userGoal || researchConfig.goal}
            onSubmit={handleAdvancedSettingsSubmit}
            onCancel={() => setShowAdvancedSettings(false)}
            initialConfig={researchConfig}
            primaryColor={widgetConfig.primaryColor}
            accentColor={widgetConfig.accentColor}
            backgroundColor={widgetConfig.backgroundColor}
          />
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t mt-16 py-6" style={{ borderColor: `${widgetConfig.primaryColor}20` }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm" style={{ color: widgetConfig.secondaryTextColor }}>
            Created with <span style={{ color: widgetConfig.accentColor }}>❤️</span> by{" "}
            <a 
              href="https://ruv.io" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium hover:underline transition-colors"
              style={{ color: widgetConfig.primaryColor }}
            >
              rUv.io
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
