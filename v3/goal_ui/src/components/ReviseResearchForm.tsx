import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { 
  Settings, 
  FileText, 
  Sliders, 
  Database,
  Sparkles,
  Target,
  Clock,
  Filter,
  RotateCcw,
  Workflow,
  Zap,
  TrendingUp,
  Building2,
  FlaskConical,
  LineChart,
  Shield,
  Rocket
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";

interface ReviseResearchFormProps {
  currentGoal: string;
  onSubmit: (config: ResearchConfig) => void;
  onCancel: () => void;
  initialConfig?: ResearchConfig;
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
}

export interface ResearchConfig {
  goal: string;
  // GOAP State Definition
  stateDefinition: {
    currentState: Record<string, boolean | string | number>;
    goalState: Record<string, boolean | string | number>;
    stateGaps: string[];
  };
  // Research Guidance
  researchGuidance: {
    focusAreas: string[];
    excludeTopics: string[];
    depth: "surface" | "moderate" | "deep";
    perspective: string;
    timeframe: string;
  };
  // AI Prompts
  prompts: {
    systemPrompt: string;
    searchQueryTemplate: string;
    analysisPrompt: string;
    synthesisPrompt: string;
  };
  // GOAP Planning Parameters
  goapConfig: {
    executionMode: "focused" | "closed" | "open";
    enableReplanning: boolean;
    replanningTriggers: string[];
    costOptimization: boolean;
    parallelExecution: boolean;
  };
  // Action Configuration
  actionConfig: {
    maxActionCost: number;
    enableFallbacks: boolean;
    validatePreconditions: boolean;
    trackEffects: boolean;
  };
  // Execution Parameters
  parameters: {
    maxSources: number;
    minConfidence: number;
    maxSteps: number;
    parallelAgents: number;
    timeout: number;
  };
  // Source Filters
  filters: {
    dateRange: string;
    sourceTypes: string[];
    languages: string[];
    excludeDomains: string[];
  };
}

export const ReviseResearchForm = ({ currentGoal, onSubmit, onCancel, initialConfig, primaryColor = "#8b5cf6", accentColor = "#22c55e", backgroundColor = "#1a1a1a" }: ReviseResearchFormProps) => {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const [config, setConfig] = useState<ResearchConfig>(
    initialConfig || {
      goal: currentGoal,
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
    }
  );

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [focusAreaInput, setFocusAreaInput] = useState("");
  const [excludeTopicInput, setExcludeTopicInput] = useState("");
  const [excludeDomainInput, setExcludeDomainInput] = useState("");

  // Preset labels/descriptions are i18n keys, translated at render time.
  const presets = [
    { id: 'academic-deep', labelKey: 'report.form.preset.academicDeep', icon: FlaskConical, color: '#3b82f6', descKey: 'report.form.preset.academicDeepDesc' },
    { id: 'industry-quick', labelKey: 'report.form.preset.industryQuick', icon: Zap, color: '#f59e0b', descKey: 'report.form.preset.industryQuickDesc' },
    { id: 'competitive-analysis', labelKey: 'report.form.preset.competitiveAnalysis', icon: TrendingUp, color: '#ef4444', descKey: 'report.form.preset.competitiveAnalysisDesc' },
    { id: 'technical-feasibility', labelKey: 'report.form.preset.technicalFeasibility', icon: Settings, color: '#8b5cf6', descKey: 'report.form.preset.technicalFeasibilityDesc' },
    { id: 'market-trends', labelKey: 'report.form.preset.marketTrends', icon: LineChart, color: '#10b981', descKey: 'report.form.preset.marketTrendsDesc' },
    { id: 'medical-clinical', labelKey: 'report.form.preset.medicalClinical', icon: Shield, color: '#ec4899', descKey: 'report.form.preset.medicalClinicalDesc' },
    { id: 'startup-validation', labelKey: 'report.form.preset.startupValidation', icon: Rocket, color: '#06b6d4', descKey: 'report.form.preset.startupValidationDesc' },
    { id: 'policy-regulatory', labelKey: 'report.form.preset.policyRegulatory', icon: Building2, color: '#84cc16', descKey: 'report.form.preset.policyRegulatoryDesc' },
  ];

  // Replanning trigger checkbox options: value stays the server-side literal,
  // label is an i18n key.
  const replanningTriggerOptions = [
    { value: "动作失败", key: "report.form.trigger.actionFailure" },
    { value: "低置信度结果", key: "report.form.trigger.lowConfidence" },
    { value: "缺少前置条件", key: "report.form.trigger.missingPreconditions" },
    { value: "超时", key: "report.form.trigger.timeout" },
    { value: "状态不匹配", key: "report.form.trigger.stateMismatch" },
  ];

  const languageOptions = [
    { code: "en", key: "report.form.lang.en" },
    { code: "es", key: "report.form.lang.es" },
    { code: "fr", key: "report.form.lang.fr" },
    { code: "de", key: "report.form.lang.de" },
    { code: "zh", key: "report.form.lang.zh" },
    { code: "ja", key: "report.form.lang.ja" },
  ];

  const optimizeConfig = async (preset: string) => {
    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('optimize-research-config', {
        body: { preset, currentGoal: config.goal, language: lang }
      });

      if (error) throw error;

      if (data?.config) {
        setConfig({
          ...config,
          researchGuidance: {
            ...config.researchGuidance,
            ...data.config.researchGuidance
          },
          prompts: {
            ...config.prompts,
            ...data.config.prompts
          },
          parameters: {
            ...config.parameters,
            ...data.config.parameters
          },
          filters: {
            ...config.filters,
            ...data.config.filters
          },
          goapConfig: {
            ...config.goapConfig,
            ...data.config.goapConfig
          }
        });
        
        toast({
          title: t("report.form.toast.optimized"),
          description: t("report.form.toast.optimizedDesc", { preset: preset.replace(/-/g, ' ') }),
        });
      }
    } catch (error) {
      console.error('Error optimizing config:', error);
      toast({
        title: t("report.form.toast.failed"),
        description: t("report.form.toast.failedDesc"),
        variant: "destructive",
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const addFocusArea = () => {
    if (focusAreaInput.trim()) {
      setConfig({
        ...config,
        researchGuidance: {
          ...config.researchGuidance,
          focusAreas: [...config.researchGuidance.focusAreas, focusAreaInput.trim()],
        },
      });
      setFocusAreaInput("");
    }
  };

  const removeFocusArea = (index: number) => {
    setConfig({
      ...config,
      researchGuidance: {
        ...config.researchGuidance,
        focusAreas: config.researchGuidance.focusAreas.filter((_, i) => i !== index),
      },
    });
  };

  const addExcludeTopic = () => {
    if (excludeTopicInput.trim()) {
      setConfig({
        ...config,
        researchGuidance: {
          ...config.researchGuidance,
          excludeTopics: [...config.researchGuidance.excludeTopics, excludeTopicInput.trim()],
        },
      });
      setExcludeTopicInput("");
    }
  };

  const removeExcludeTopic = (index: number) => {
    setConfig({
      ...config,
      researchGuidance: {
        ...config.researchGuidance,
        excludeTopics: config.researchGuidance.excludeTopics.filter((_, i) => i !== index),
      },
    });
  };

  const addExcludeDomain = () => {
    if (excludeDomainInput.trim()) {
      setConfig({
        ...config,
        filters: {
          ...config.filters,
          excludeDomains: [...config.filters.excludeDomains, excludeDomainInput.trim()],
        },
      });
      setExcludeDomainInput("");
    }
  };

  const removeExcludeDomain = (index: number) => {
    setConfig({
      ...config,
      filters: {
        ...config.filters,
        excludeDomains: config.filters.excludeDomains.filter((_, i) => i !== index),
      },
    });
  };

  const handleSubmit = () => {
    onSubmit(config);
  };

  return (
    <div className="space-y-4">
      {/* AI Optimization Presets */}
      <div 
        className="p-4 rounded-lg border space-y-3"
        style={{
          backgroundColor: `${primaryColor}0d`,
          borderColor: `${primaryColor}33`
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: primaryColor }} />
          <span className="text-sm font-medium" style={{ color: primaryColor }}>
            {t("report.form.aiOptimizeTitle")}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => optimizeConfig(preset.id)}
              disabled={isOptimizing}
              className="flex flex-col items-start gap-1 px-3 py-2 rounded-md transition-all text-xs border hover:shadow-sm"
              style={{
                borderColor: isOptimizing ? preset.color : '#404040',
                backgroundColor: '#262626',
              }}
              title={t(preset.descKey)}
            >
              <div className="flex items-center gap-1.5 w-full">
                <preset.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: preset.color }} />
                <span className="font-medium text-foreground text-left leading-tight">{t(preset.labelKey)}</span>
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight">{t(preset.descKey)}</span>
            </button>
          ))}
        </div>
        {isOptimizing && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: primaryColor }}>
            <Sparkles className="w-3 h-3 animate-spin" />
            {t("report.form.optimizing")}
          </p>
        )}
      </div>

      {/* Description Header */}
      <div 
        className="p-4 rounded-lg border"
        style={{
          backgroundColor: `${primaryColor}0d`,
          borderColor: `${primaryColor}33`
        }}
      >
        <p className="text-sm text-muted-foreground">
          {t("report.form.description")}
        </p>
      </div>

      <Tabs defaultValue="guidance" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-1 h-auto p-1 bg-muted/50">
          <TabsTrigger value="guidance" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Target className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("report.form.tab.guidance")}</span>
            <span className="sm:hidden">{t("report.form.tab.guidanceShort")}</span>
          </TabsTrigger>
          <TabsTrigger value="goap" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Workflow className="w-3.5 h-3.5" />
            <span>GOAP</span>
          </TabsTrigger>
          <TabsTrigger value="prompts" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("report.form.tab.prompts")}</span>
            <span className="sm:hidden">AI</span>
          </TabsTrigger>
          <TabsTrigger value="parameters" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("report.form.tab.parameters")}</span>
            <span className="sm:hidden">{t("report.form.tab.parametersShort")}</span>
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("report.form.tab.actions")}</span>
            <span className="sm:hidden">{t("report.form.tab.actionsShort")}</span>
          </TabsTrigger>
          <TabsTrigger value="filters" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("report.form.tab.filters")}</span>
            <span className="sm:hidden">{t("report.form.tab.filtersShort")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guidance" className="space-y-3 mt-4">
          <Card className="border-muted">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="w-4 h-4" style={{ color: primaryColor }} />
                {t("report.form.guidance.title")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("report.form.guidance.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="goal" className="text-xs font-medium">{t("report.form.goal")}</Label>
                <Textarea
                  id="goal"
                  value={config.goal}
                  onChange={(e) => setConfig({ ...config, goal: e.target.value })}
                  placeholder={t("report.form.goalPlaceholder")}
                  className="min-h-[70px] text-sm resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("report.form.focusAreas")} <span className="text-muted-foreground font-normal">{t("report.form.focusAreasHint")}</span></Label>
                <div className="flex gap-2">
                  <Input
                    value={focusAreaInput}
                    onChange={(e) => setFocusAreaInput(e.target.value)}
                    placeholder={t("report.form.focusAreasPlaceholder")}
                    onKeyPress={(e) => e.key === "Enter" && addFocusArea()}
                    className="text-sm h-9"
                  />
                  <Button onClick={addFocusArea} size="sm" className="h-9 px-3 text-xs">{t("report.form.add")}</Button>
                </div>
                {config.researchGuidance.focusAreas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {config.researchGuidance.focusAreas.map((area, index) => (
                      <span
                        key={index}
                        className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 transition-colors"
                        style={{
                          backgroundColor: `${primaryColor}1a`,
                          color: primaryColor
                        }}
                      >
                        {area}
                        <button
                          onClick={() => removeFocusArea(index)}
                          className="hover:opacity-70 transition-opacity"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("report.form.excludeTopics")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={excludeTopicInput}
                    onChange={(e) => setExcludeTopicInput(e.target.value)}
                    placeholder={t("report.form.excludeTopicsPlaceholder")}
                    onKeyPress={(e) => e.key === "Enter" && addExcludeTopic()}
                    className="text-sm h-9"
                  />
                  <Button onClick={addExcludeTopic} size="sm" variant="outline" className="h-9 px-3 text-xs">{t("report.form.add")}</Button>
                </div>
                {config.researchGuidance.excludeTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {config.researchGuidance.excludeTopics.map((topic, index) => (
                      <span
                        key={index}
                        className="bg-destructive/10 text-destructive px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
                      >
                        {topic}
                        <button
                          onClick={() => removeExcludeTopic(index)}
                          className="hover:opacity-70"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t("report.form.depth")}</Label>
                  <Select
                    value={config.researchGuidance.depth}
                    onValueChange={(value: "surface" | "moderate" | "deep") =>
                      setConfig({
                        ...config,
                        researchGuidance: { ...config.researchGuidance, depth: value },
                      })
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="surface">{t("report.form.depth.surface")}</SelectItem>
                      <SelectItem value="moderate">{t("report.form.depth.moderate")}</SelectItem>
                      <SelectItem value="deep">{t("report.form.depth.deep")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t("report.form.perspective")}</Label>
                  <Select
                    value={config.researchGuidance.perspective}
                    onValueChange={(value) =>
                      setConfig({
                        ...config,
                        researchGuidance: { ...config.researchGuidance, perspective: value },
                      })
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">{t("report.form.perspective.technical")}</SelectItem>
                      <SelectItem value="business">{t("report.form.perspective.business")}</SelectItem>
                      <SelectItem value="academic">{t("report.form.perspective.academic")}</SelectItem>
                      <SelectItem value="practical">{t("report.form.perspective.practical")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("report.form.timeframe")}</Label>
                <Select
                  value={config.researchGuidance.timeframe}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      researchGuidance: { ...config.researchGuidance, timeframe: value },
                    })
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">{t("report.form.timeframe.recent")}</SelectItem>
                    <SelectItem value="current-year">{t("report.form.timeframe.currentYear")}</SelectItem>
                    <SelectItem value="past-year">{t("report.form.timeframe.pastYear")}</SelectItem>
                    <SelectItem value="past-2-years">{t("report.form.timeframe.past2Years")}</SelectItem>
                    <SelectItem value="all-time">{t("report.form.timeframe.allTime")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goap" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="w-5 h-5" />
                {t("report.form.goap.title")}
              </CardTitle>
              <CardDescription>
                {t("report.form.goap.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("report.form.executionMode")}</Label>
                <Select
                  value={config.goapConfig.executionMode}
                  onValueChange={(value: "focused" | "closed" | "open") =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, executionMode: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="focused">{t("report.form.executionMode.focused")}</SelectItem>
                    <SelectItem value="closed">{t("report.form.executionMode.closed")}</SelectItem>
                    <SelectItem value="open">{t("report.form.executionMode.open")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {config.goapConfig.executionMode === "focused" && t("report.form.executionMode.focusedHint")}
                  {config.goapConfig.executionMode === "closed" && t("report.form.executionMode.closedHint")}
                  {config.goapConfig.executionMode === "open" && t("report.form.executionMode.openHint")}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("report.form.enableReplanning")}</Label>
                  <p className="text-xs text-muted-foreground">{t("report.form.enableReplanningHint")}</p>
                </div>
                <Switch
                  checked={config.goapConfig.enableReplanning}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, enableReplanning: checked },
                    })
                  }
                  style={{ '--primary': primaryColor } as React.CSSProperties}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("report.form.costOptimization")}</Label>
                  <p className="text-xs text-muted-foreground">{t("report.form.costOptimizationHint")}</p>
                </div>
                <Switch
                  checked={config.goapConfig.costOptimization}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, costOptimization: checked },
                    })
                  }
                  style={{ '--primary': primaryColor } as React.CSSProperties}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("report.form.parallelExecution")}</Label>
                  <p className="text-xs text-muted-foreground">{t("report.form.parallelExecutionHint")}</p>
                </div>
                <Switch
                  checked={config.goapConfig.parallelExecution}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, parallelExecution: checked },
                    })
                  }
                  style={{ '--primary': primaryColor } as React.CSSProperties}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("report.form.replanningTriggers")}</Label>
                <div className="space-y-2">
                  {replanningTriggerOptions.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Switch
                        id={option.value}
                        checked={config.goapConfig.replanningTriggers.includes(option.value)}
                        onCheckedChange={(checked) => {
                          const newTriggers = checked
                            ? [...config.goapConfig.replanningTriggers, option.value]
                            : config.goapConfig.replanningTriggers.filter((tr) => tr !== option.value);
                          setConfig({
                            ...config,
                            goapConfig: { ...config.goapConfig, replanningTriggers: newTriggers },
                          });
                        }}
                        style={{ '--primary': primaryColor } as React.CSSProperties}
                      />
                      <Label htmlFor={option.value} className="cursor-pointer text-sm">
                        {t(option.key)}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                {t("report.form.prompts.title")}
              </CardTitle>
              <CardDescription>
                {t("report.form.prompts.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="systemPrompt">{t("report.form.systemPrompt")}</Label>
                <Textarea
                  id="systemPrompt"
                  value={config.prompts.systemPrompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, systemPrompt: e.target.value },
                    })
                  }
                  placeholder={t("report.form.systemPromptPlaceholder")}
                  className="min-h-[100px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="searchQuery">{t("report.form.searchQuery")}</Label>
                <Textarea
                  id="searchQuery"
                  value={config.prompts.searchQueryTemplate}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, searchQueryTemplate: e.target.value },
                    })
                  }
                  placeholder={t("report.form.searchQueryPlaceholder")}
                  className="min-h-[80px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t("report.form.availableVariables")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="analysisPrompt">{t("report.form.analysisPrompt")}</Label>
                <Textarea
                  id="analysisPrompt"
                  value={config.prompts.analysisPrompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, analysisPrompt: e.target.value },
                    })
                  }
                  placeholder={t("report.form.analysisPromptPlaceholder")}
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="synthesisPrompt">{t("report.form.synthesisPrompt")}</Label>
                <Textarea
                  id="synthesisPrompt"
                  value={config.prompts.synthesisPrompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, synthesisPrompt: e.target.value },
                    })
                  }
                  placeholder={t("report.form.synthesisPromptPlaceholder")}
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parameters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="w-5 h-5" />
                {t("report.form.parameters.title")}
              </CardTitle>
              <CardDescription>
                {t("report.form.parameters.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>{t("report.form.maxSources")}</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.maxSources}</span>
                </div>
                <Slider
                  value={[config.parameters.maxSources]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, maxSources: value[0] },
                    })
                  }
                  min={5}
                  max={50}
                  step={5}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>{t("report.form.minConfidence")}</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.minConfidence}%</span>
                </div>
                <Slider
                  value={[config.parameters.minConfidence]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, minConfidence: value[0] },
                    })
                  }
                  min={50}
                  max={99}
                  step={5}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>{t("report.form.maxSteps")}</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.maxSteps}</span>
                </div>
                <Slider
                  value={[config.parameters.maxSteps]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, maxSteps: value[0] },
                    })
                  }
                  min={3}
                  max={15}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>{t("report.form.parallelAgents")}</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.parallelAgents}</span>
                </div>
                <Slider
                  value={[config.parameters.parallelAgents]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, parallelAgents: value[0] },
                    })
                  }
                  min={1}
                  max={10}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>{t("report.form.timeout")}</Label>
                  <span className="text-sm text-muted-foreground">{config.parameters.timeout}s</span>
                </div>
                <Slider
                  value={[config.parameters.timeout]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      parameters: { ...config.parameters, timeout: value[0] },
                    })
                  }
                  min={30}
                  max={300}
                  step={30}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                {t("report.form.actions.title")}
              </CardTitle>
              <CardDescription>
                {t("report.form.actions.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>{t("report.form.maxActionCost")}</Label>
                  <span className="text-sm text-muted-foreground">{config.actionConfig.maxActionCost}</span>
                </div>
                <Slider
                  value={[config.actionConfig.maxActionCost]}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, maxActionCost: value[0] },
                    })
                  }
                  min={1}
                  max={10}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  {t("report.form.maxActionCostHint")}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("report.form.enableFallbacks")}</Label>
                  <p className="text-xs text-muted-foreground">{t("report.form.enableFallbacksHint")}</p>
                </div>
                <Switch
                  checked={config.actionConfig.enableFallbacks}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, enableFallbacks: checked },
                    })
                  }
                  style={{ '--primary': primaryColor } as React.CSSProperties}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("report.form.validatePreconditions")}</Label>
                  <p className="text-xs text-muted-foreground">{t("report.form.validatePreconditionsHint")}</p>
                </div>
                <Switch
                  checked={config.actionConfig.validatePreconditions}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, validatePreconditions: checked },
                    })
                  }
                  style={{ '--primary': primaryColor } as React.CSSProperties}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("report.form.trackEffects")}</Label>
                  <p className="text-xs text-muted-foreground">{t("report.form.trackEffectsHint")}</p>
                </div>
                <Switch
                  checked={config.actionConfig.trackEffects}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, trackEffects: checked },
                    })
                  }
                  style={{ '--primary': primaryColor } as React.CSSProperties}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                {t("report.form.filters.title")}
              </CardTitle>
              <CardDescription>
                {t("report.form.filters.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("report.form.dateRange")}</Label>
                <Select
                  value={config.filters.dateRange}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      filters: { ...config.filters, dateRange: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="past-week">{t("report.form.dateRange.pastWeek")}</SelectItem>
                    <SelectItem value="past-month">{t("report.form.dateRange.pastMonth")}</SelectItem>
                    <SelectItem value="past-3-months">{t("report.form.dateRange.past3Months")}</SelectItem>
                    <SelectItem value="past-6-months">{t("report.form.dateRange.past6Months")}</SelectItem>
                    <SelectItem value="past-year">{t("report.form.dateRange.pastYear")}</SelectItem>
                    <SelectItem value="past-2-years">{t("report.form.dateRange.past2Years")}</SelectItem>
                    <SelectItem value="all">{t("report.form.dateRange.all")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("report.form.sourceTypes")}</Label>
                <div className="space-y-2">
                  {["academic", "technical", "industry", "news", "blogs", "documentation"].map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Switch
                        id={type}
                        checked={config.filters.sourceTypes.includes(type)}
                        onCheckedChange={(checked) => {
                          const newTypes = checked
                            ? [...config.filters.sourceTypes, type]
                            : config.filters.sourceTypes.filter((t) => t !== type);
                          setConfig({
                            ...config,
                            filters: { ...config.filters, sourceTypes: newTypes },
                          });
                        }}
                      />
                      <Label htmlFor={type} className="capitalize cursor-pointer">
                        {t(`report.form.sourceType.${type}`)}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("report.form.excludeDomains")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={excludeDomainInput}
                    onChange={(e) => setExcludeDomainInput(e.target.value)}
                    placeholder={t("report.form.excludeDomainsPlaceholder")}
                    onKeyPress={(e) => e.key === "Enter" && addExcludeDomain()}
                  />
                  <Button onClick={addExcludeDomain} size="sm">{t("report.form.add")}</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {config.filters.excludeDomains.map((domain, index) => (
                    <span
                      key={index}
                      className="bg-muted px-3 py-1 rounded-full text-sm flex items-center gap-2"
                    >
                      {domain}
                      <button
                        onClick={() => removeExcludeDomain(index)}
                        className="hover:text-destructive"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("report.form.languages")}</Label>
                <div className="space-y-2">
                  {languageOptions.map(({ code, key }) => (
                    <div key={code} className="flex items-center space-x-2">
                      <Switch
                        id={code}
                        checked={config.filters.languages.includes(code)}
                        onCheckedChange={(checked) => {
                          const newLangs = checked
                            ? [...config.filters.languages, code]
                            : config.filters.languages.filter((l) => l !== code);
                          setConfig({
                            ...config,
                            filters: { ...config.filters, languages: newLangs },
                          });
                        }}
                      />
                      <Label htmlFor={code} className="cursor-pointer">
                        {t(key)}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          {t("report.form.cancel")}
        </Button>
        <Button onClick={handleSubmit} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          {t("report.form.submit")}
        </Button>
      </div>
    </div>
  );
};