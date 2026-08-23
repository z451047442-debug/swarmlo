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

  const presets = [
    { id: 'academic-deep', label: '学术研究', icon: FlaskConical, color: '#3b82f6', desc: '深入严谨的学术分析' },
    { id: 'industry-quick', label: '行业快速扫描', icon: Zap, color: '#f59e0b', desc: '快速的商业洞察' },
    { id: 'competitive-analysis', label: '竞争情报', icon: TrendingUp, color: '#ef4444', desc: '市场与竞品分析' },
    { id: 'technical-feasibility', label: '技术研究', icon: Settings, color: '#8b5cf6', desc: '工程可行性' },
    { id: 'market-trends', label: '市场趋势', icon: LineChart, color: '#10b981', desc: '趋势分析与预测' },
    { id: 'medical-clinical', label: '医疗/临床', icon: Shield, color: '#ec4899', desc: '循证医学研究' },
    { id: 'startup-validation', label: '创业验证', icon: Rocket, color: '#06b6d4', desc: '商业创意验证' },
    { id: 'policy-regulatory', label: '政策与法规', icon: Building2, color: '#84cc16', desc: '合规与法律研究' },
  ];

  const optimizeConfig = async (preset: string) => {
    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('optimize-research-config', {
        body: { preset, currentGoal: config.goal }
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
          title: "配置已优化",
          description: `已针对 ${preset.replace(/-/g, ' ')} 优化设置`,
        });
      }
    } catch (error) {
      console.error('Error optimizing config:', error);
      toast({
        title: "优化失败",
        description: "无法优化设置，请重试。",
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
            按研究类型 AI 优化设置：
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
              title={preset.desc}
            >
              <div className="flex items-center gap-1.5 w-full">
                <preset.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: preset.color }} />
                <span className="font-medium text-foreground text-left leading-tight">{preset.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight">{preset.desc}</span>
            </button>
          ))}
        </div>
        {isOptimizing && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: primaryColor }}>
            <Sparkles className="w-3 h-3 animate-spin" />
            正在优化研究配置...
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
          通过配置 GOAP 规划参数、AI 提示词、执行设置和来源过滤器，精细调整 AI 的研究方式。
        </p>
      </div>

      <Tabs defaultValue="guidance" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-1 h-auto p-1 bg-muted/50">
          <TabsTrigger value="guidance" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Target className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">研究引导</span>
            <span className="sm:hidden">引导</span>
          </TabsTrigger>
          <TabsTrigger value="goap" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Workflow className="w-3.5 h-3.5" />
            <span>GOAP</span>
          </TabsTrigger>
          <TabsTrigger value="prompts" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">提示词</span>
            <span className="sm:hidden">AI</span>
          </TabsTrigger>
          <TabsTrigger value="parameters" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">参数</span>
            <span className="sm:hidden">参数</span>
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">动作</span>
            <span className="sm:hidden">动作</span>
          </TabsTrigger>
          <TabsTrigger value="filters" className="text-xs py-2.5 gap-1 data-[state=active]:bg-background">
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">过滤器</span>
            <span className="sm:hidden">过滤</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guidance" className="space-y-3 mt-4">
          <Card className="border-muted">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="w-4 h-4" style={{ color: primaryColor }} />
                研究引导
              </CardTitle>
              <CardDescription className="text-xs">
                定义研究范围与方向
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="goal" className="text-xs font-medium">研究目标</Label>
                <Textarea
                  id="goal"
                  value={config.goal}
                  onChange={(e) => setConfig({ ...config, goal: e.target.value })}
                  placeholder="输入你的研究目标..."
                  className="min-h-[70px] text-sm resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">重点关注领域 <span className="text-muted-foreground font-normal">（需要重点关注的特定主题）</span></Label>
                <div className="flex gap-2">
                  <Input
                    value={focusAreaInput}
                    onChange={(e) => setFocusAreaInput(e.target.value)}
                    placeholder="例如：量子算法、纠错"
                    onKeyPress={(e) => e.key === "Enter" && addFocusArea()}
                    className="text-sm h-9"
                  />
                  <Button onClick={addFocusArea} size="sm" className="h-9 px-3 text-xs">添加</Button>
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
                <Label className="text-xs font-medium">排除主题</Label>
                <div className="flex gap-2">
                  <Input
                    value={excludeTopicInput}
                    onChange={(e) => setExcludeTopicInput(e.target.value)}
                    placeholder="例如：仅理论、消费类产品"
                    onKeyPress={(e) => e.key === "Enter" && addExcludeTopic()}
                    className="text-sm h-9"
                  />
                  <Button onClick={addExcludeTopic} size="sm" variant="outline" className="h-9 px-3 text-xs">添加</Button>
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
                  <Label className="text-xs font-medium">研究深度</Label>
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
                      <SelectItem value="surface">浅层（快速概览）</SelectItem>
                      <SelectItem value="moderate">中等（标准深度）</SelectItem>
                      <SelectItem value="deep">深入（全面分析）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">视角</Label>
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
                      <SelectItem value="technical">技术/科学</SelectItem>
                      <SelectItem value="business">商业/商务</SelectItem>
                      <SelectItem value="academic">学术/研究</SelectItem>
                      <SelectItem value="practical">实践/应用</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">时间范围</Label>
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
                    <SelectItem value="recent">近期（最近 6 个月）</SelectItem>
                    <SelectItem value="current-year">本年度</SelectItem>
                    <SelectItem value="past-year">过去一年</SelectItem>
                    <SelectItem value="past-2-years">过去两年</SelectItem>
                    <SelectItem value="all-time">全部时间</SelectItem>
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
                GOAP 配置
              </CardTitle>
              <CardDescription>
                配置目标导向行动规划（GOAP）参数
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>执行模式</Label>
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
                    <SelectItem value="focused">聚焦（直接执行）</SelectItem>
                    <SelectItem value="closed">封闭（单领域规划）</SelectItem>
                    <SelectItem value="open">开放（创造性问题求解）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {config.goapConfig.executionMode === "focused" && "执行具体动作并进行前置条件检查"}
                  {config.goapConfig.executionMode === "closed" && "在既定动作集合内规划，具备类型安全"}
                  {config.goapConfig.executionMode === "open" && "探索所有动作并发现新的组合"}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>启用重新规划</Label>
                  <p className="text-xs text-muted-foreground">动作失败时调整计划</p>
                </div>
                <Switch
                  checked={config.goapConfig.enableReplanning}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, enableReplanning: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>成本优化</Label>
                  <p className="text-xs text-muted-foreground">寻找最高效的动作路径</p>
                </div>
                <Switch
                  checked={config.goapConfig.costOptimization}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, costOptimization: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>并行执行</Label>
                  <p className="text-xs text-muted-foreground">同时运行独立动作</p>
                </div>
                <Switch
                  checked={config.goapConfig.parallelExecution}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      goapConfig: { ...config.goapConfig, parallelExecution: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>重新规划触发器</Label>
                <div className="space-y-2">
                  {["动作失败", "低置信度结果", "缺少前置条件", "超时", "状态不匹配"].map((trigger) => (
                    <div key={trigger} className="flex items-center space-x-2">
                      <Switch
                        id={trigger}
                        checked={config.goapConfig.replanningTriggers.includes(trigger)}
                        onCheckedChange={(checked) => {
                          const newTriggers = checked
                            ? [...config.goapConfig.replanningTriggers, trigger]
                            : config.goapConfig.replanningTriggers.filter((t) => t !== trigger);
                          setConfig({
                            ...config,
                            goapConfig: { ...config.goapConfig, replanningTriggers: newTriggers },
                          });
                        }}
                        style={{
                          ['--primary' as any]: primaryColor,
                        }}
                      />
                      <Label htmlFor={trigger} className="cursor-pointer text-sm">
                        {trigger}
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
                AI 提示词配置
              </CardTitle>
              <CardDescription>
                自定义研究过程中使用的 AI 提示词
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="systemPrompt">系统提示词</Label>
                <Textarea
                  id="systemPrompt"
                  value={config.prompts.systemPrompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, systemPrompt: e.target.value },
                    })
                  }
                  placeholder="定义 AI 的角色与行为..."
                  className="min-h-[100px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="searchQuery">搜索查询模板</Label>
                <Textarea
                  id="searchQuery"
                  value={config.prompts.searchQueryTemplate}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, searchQueryTemplate: e.target.value },
                    })
                  }
                  placeholder="使用 {topic} 和 {year} 占位符..."
                  className="min-h-[80px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  可用变量：{"{topic}"}、{"{year}"}、{"{keywords}"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="analysisPrompt">文档分析提示词</Label>
                <Textarea
                  id="analysisPrompt"
                  value={config.prompts.analysisPrompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, analysisPrompt: e.target.value },
                    })
                  }
                  placeholder="分析文档的指令..."
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="synthesisPrompt">综合提示词</Label>
                <Textarea
                  id="synthesisPrompt"
                  value={config.prompts.synthesisPrompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prompts: { ...config.prompts, synthesisPrompt: e.target.value },
                    })
                  }
                  placeholder="综合研究结果的指令..."
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
                研究参数
              </CardTitle>
              <CardDescription>
                精细调整研究执行设置
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>最大来源数</Label>
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
                  <Label>最低置信度 (%)</Label>
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
                  <Label>最大研究步骤数</Label>
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
                  <Label>并行 Agent 数</Label>
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
                  <Label>超时（秒）</Label>
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
                动作配置
              </CardTitle>
              <CardDescription>
                配置动作的验证与执行方式
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>最大动作成本</Label>
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
                  限制计划中单个动作的复杂度
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>启用后备动作</Label>
                  <p className="text-xs text-muted-foreground">主动作失败时使用备选动作</p>
                </div>
                <Switch
                  checked={config.actionConfig.enableFallbacks}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, enableFallbacks: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>验证前置条件</Label>
                  <p className="text-xs text-muted-foreground">执行动作前检查所有要求</p>
                </div>
                <Switch
                  checked={config.actionConfig.validatePreconditions}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, validatePreconditions: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>跟踪效果</Label>
                  <p className="text-xs text-muted-foreground">监控每个动作引起的状态变化</p>
                </div>
                <Switch
                  checked={config.actionConfig.trackEffects}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      actionConfig: { ...config.actionConfig, trackEffects: checked },
                    })
                  }
                  style={{
                    ['--primary' as any]: primaryColor,
                  }}
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
                来源过滤器
              </CardTitle>
              <CardDescription>
                控制研究中包含哪些来源
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>日期范围</Label>
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
                    <SelectItem value="past-week">过去一周</SelectItem>
                    <SelectItem value="past-month">过去一个月</SelectItem>
                    <SelectItem value="past-3-months">过去 3 个月</SelectItem>
                    <SelectItem value="past-6-months">过去 6 个月</SelectItem>
                    <SelectItem value="past-year">过去一年</SelectItem>
                    <SelectItem value="past-2-years">过去两年</SelectItem>
                    <SelectItem value="all">全部时间</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>来源类型</Label>
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
                        {type}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>排除域名</Label>
                <div className="flex gap-2">
                  <Input
                    value={excludeDomainInput}
                    onChange={(e) => setExcludeDomainInput(e.target.value)}
                    placeholder="例如：example.com"
                    onKeyPress={(e) => e.key === "Enter" && addExcludeDomain()}
                  />
                  <Button onClick={addExcludeDomain} size="sm">添加</Button>
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
                <Label>语言</Label>
                <div className="space-y-2">
                  {[
                    { code: "en", label: "英语" },
                    { code: "es", label: "西班牙语" },
                    { code: "fr", label: "法语" },
                    { code: "de", label: "德语" },
                    { code: "zh", label: "中文" },
                    { code: "ja", label: "日语" },
                  ].map(({ code, label }) => (
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
                        {label}
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
          取消
        </Button>
        <Button onClick={handleSubmit} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          开始修订后的研究
        </Button>
      </div>
    </div>
  );
};