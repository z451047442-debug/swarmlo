import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Settings2, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdvancedSettings {
  // Swarm Configuration
  swarm: {
    topology: 'mesh' | 'hierarchical' | 'ring' | 'star';
    maxAgents: number;
    strategy: 'balanced' | 'specialized' | 'adaptive';
    autoScaling: {
      enabled: boolean;
      minAgents: number;
      maxAgents: number;
      scaleUpThreshold: number;
      scaleDownThreshold: number;
    };
  };
  
  // GOAP Configuration
  goap: {
    algorithm: 'a-star' | 'greedy' | 'dijkstra' | 'bfs' | 'dfs';
    heuristic: 'manhattan' | 'euclidean' | 'hamming' | 'custom';
    costMethod: 'uniform' | 'time' | 'resources' | 'tokens' | 'hybrid';
    optimization: {
      enabled: boolean;
      detectParallel: boolean;
      removeRedundant: boolean;
    };
  };
  
  // Execution Configuration
  execution: {
    strategy: 'sequential' | 'parallel' | 'hybrid' | 'adaptive';
    maxParallelTasks: number;
    timeout: number;
    enableQualityGates: boolean;
  };
  
  // Model Router Configuration
  modelRouter: {
    primaryProvider: 'anthropic' | 'openrouter' | 'gemini' | 'local';
    strategy: 'cost' | 'speed' | 'quality' | 'privacy' | 'balanced';
    maxCostPerRequest: number;
    enableFallback: boolean;
  };
}

const defaultSettings: AdvancedSettings = {
  swarm: {
    topology: 'hierarchical',
    maxAgents: 10,
    strategy: 'adaptive',
    autoScaling: {
      enabled: true,
      minAgents: 2,
      maxAgents: 20,
      scaleUpThreshold: 80,
      scaleDownThreshold: 20,
    },
  },
  goap: {
    algorithm: 'a-star',
    heuristic: 'manhattan',
    costMethod: 'hybrid',
    optimization: {
      enabled: true,
      detectParallel: true,
      removeRedundant: true,
    },
  },
  execution: {
    strategy: 'adaptive',
    maxParallelTasks: 5,
    timeout: 300000,
    enableQualityGates: true,
  },
  modelRouter: {
    primaryProvider: 'anthropic',
    strategy: 'balanced',
    maxCostPerRequest: 1.0,
    enableFallback: true,
  },
};

const presets = {
  development: {
    name: '开发',
    description: '快速迭代，详细日志',
    badge: 'default' as const,
  },
  production: {
    name: '生产',
    description: '优化性能，严格校验',
    badge: 'default' as const,
  },
  budget: {
    name: '预算',
    description: '成本优化，执行较慢',
    badge: 'secondary' as const,
  },
  quality: {
    name: '质量',
    description: '最高质量，成本较高',
    badge: 'destructive' as const,
  },
};

export function AdvancedSettingsModal() {
  const [settings, setSettings] = useState<AdvancedSettings>(() => {
    const saved = localStorage.getItem('agenticflow-settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleSave = () => {
    localStorage.setItem('agenticflow-settings', JSON.stringify(settings));
    toast({
      title: "设置已保存",
      description: "你的高级配置已保存。",
    });
    setOpen(false);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    toast({
      title: "设置已重置",
      description: "配置已恢复为默认值。",
    });
  };

  const applyPreset = (presetName: keyof typeof presets) => {
    const presetConfigs: Record<keyof typeof presets, Partial<AdvancedSettings>> = {
      development: {
        swarm: { ...settings.swarm, maxAgents: 5, strategy: 'balanced' },
        execution: { ...settings.execution, strategy: 'sequential', enableQualityGates: false },
        modelRouter: { ...settings.modelRouter, strategy: 'speed' },
      },
      production: {
        swarm: { ...settings.swarm, maxAgents: 15, strategy: 'adaptive' },
        execution: { ...settings.execution, strategy: 'adaptive', enableQualityGates: true },
        modelRouter: { ...settings.modelRouter, strategy: 'balanced' },
      },
      budget: {
        swarm: { ...settings.swarm, maxAgents: 3, strategy: 'specialized' },
        execution: { ...settings.execution, strategy: 'sequential', maxParallelTasks: 2 },
        modelRouter: { ...settings.modelRouter, primaryProvider: 'openrouter', strategy: 'cost' },
      },
      quality: {
        swarm: { ...settings.swarm, maxAgents: 20, strategy: 'adaptive' },
        execution: { ...settings.execution, strategy: 'parallel', enableQualityGates: true },
        modelRouter: { ...settings.modelRouter, primaryProvider: 'anthropic', strategy: 'quality' },
      },
    };

    setSettings({ ...settings, ...presetConfigs[presetName] });
    toast({
      title: `${presets[presetName].name} 预设已应用`,
      description: presets[presetName].description,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" />
          高级设置
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-500" />
            高级 Agent 配置
          </DialogTitle>
          <DialogDescription>
            配置集群拓扑、GOAP 规划、执行策略与模型路由
          </DialogDescription>
        </DialogHeader>

        {/* Presets */}
        <div className="space-y-2">
          <Label>快捷预设</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(presets).map(([key, preset]) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(key as keyof typeof presets)}
                className="flex flex-col h-auto py-3 items-start"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">{preset.name}</span>
                  <Badge variant={preset.badge} className="text-xs">
                    {key === 'development' ? '开发' : key === 'production' ? '生产' : key === 'budget' ? '预算' : '质量'}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  {preset.description}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <Tabs defaultValue="swarm" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="swarm">集群</TabsTrigger>
            <TabsTrigger value="goap">GOAP</TabsTrigger>
            <TabsTrigger value="execution">执行</TabsTrigger>
            <TabsTrigger value="model">模型</TabsTrigger>
          </TabsList>

          {/* Swarm Configuration */}
          <TabsContent value="swarm" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="topology">拓扑</Label>
              <Select
                value={settings.swarm.topology}
                onValueChange={(value: AdvancedSettings['swarm']['topology']) =>
                  setSettings({ ...settings, swarm: { ...settings.swarm, topology: value } })
                }
              >
                <SelectTrigger id="topology">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mesh">Mesh - 全连接、点对点</SelectItem>
                  <SelectItem value="hierarchical">Hierarchical - 带协调器的树状结构</SelectItem>
                  <SelectItem value="ring">Ring - 环形通信</SelectItem>
                  <SelectItem value="star">Star - 集中式协调器</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxAgents">最大 Agent 数量：{settings.swarm.maxAgents}</Label>
              <Slider
                id="maxAgents"
                min={1}
                max={50}
                step={1}
                value={[settings.swarm.maxAgents]}
                onValueChange={([value]) =>
                  setSettings({ ...settings, swarm: { ...settings.swarm, maxAgents: value } })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="strategy">分发策略</Label>
              <Select
                value={settings.swarm.strategy}
                onValueChange={(value: AdvancedSettings['swarm']['strategy']) =>
                  setSettings({ ...settings, swarm: { ...settings.swarm, strategy: value } })
                }
              >
                <SelectTrigger id="strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">Balanced - 均衡分配任务</SelectItem>
                  <SelectItem value="specialized">Specialized - 按能力分配</SelectItem>
                  <SelectItem value="adaptive">Adaptive - 根据负载动态调整</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label htmlFor="autoScaling">自动伸缩</Label>
                <Switch
                  id="autoScaling"
                  checked={settings.swarm.autoScaling.enabled}
                  onCheckedChange={(enabled) =>
                    setSettings({
                      ...settings,
                      swarm: {
                        ...settings.swarm,
                        autoScaling: { ...settings.swarm.autoScaling, enabled },
                      },
                    })
                  }
                />
              </div>

              {settings.swarm.autoScaling.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>最小 Agent 数</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.swarm.autoScaling.minAgents}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            swarm: {
                              ...settings.swarm,
                              autoScaling: {
                                ...settings.swarm.autoScaling,
                                minAgents: parseInt(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>最大 Agent 数</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.swarm.autoScaling.maxAgents}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            swarm: {
                              ...settings.swarm,
                              autoScaling: {
                                ...settings.swarm.autoScaling,
                                maxAgents: parseInt(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>扩容阈值（%）：{settings.swarm.autoScaling.scaleUpThreshold}</Label>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[settings.swarm.autoScaling.scaleUpThreshold]}
                      onValueChange={([value]) =>
                        setSettings({
                          ...settings,
                          swarm: {
                            ...settings.swarm,
                            autoScaling: { ...settings.swarm.autoScaling, scaleUpThreshold: value },
                          },
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>缩容阈值（%）：{settings.swarm.autoScaling.scaleDownThreshold}</Label>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[settings.swarm.autoScaling.scaleDownThreshold]}
                      onValueChange={([value]) =>
                        setSettings({
                          ...settings,
                          swarm: {
                            ...settings.swarm,
                            autoScaling: { ...settings.swarm.autoScaling, scaleDownThreshold: value },
                          },
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* GOAP Configuration */}
          <TabsContent value="goap" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="algorithm">规划算法</Label>
              <Select
                value={settings.goap.algorithm}
                onValueChange={(value: AdvancedSettings['goap']['algorithm']) =>
                  setSettings({ ...settings, goap: { ...settings.goap, algorithm: value } })
                }
              >
                <SelectTrigger id="algorithm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a-star">A* - 最优路径规划</SelectItem>
                  <SelectItem value="greedy">Greedy - 快速，非最优</SelectItem>
                  <SelectItem value="dijkstra">Dijkstra - 保证最优</SelectItem>
                  <SelectItem value="bfs">BFS - 广度优先搜索</SelectItem>
                  <SelectItem value="dfs">DFS - 深度优先搜索</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="heuristic">启发函数</Label>
              <Select
                value={settings.goap.heuristic}
                onValueChange={(value: AdvancedSettings['goap']['heuristic']) =>
                  setSettings({ ...settings, goap: { ...settings.goap, heuristic: value } })
                }
              >
                <SelectTrigger id="heuristic">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manhattan">曼哈顿距离</SelectItem>
                  <SelectItem value="euclidean">欧几里得距离</SelectItem>
                  <SelectItem value="hamming">汉明距离</SelectItem>
                  <SelectItem value="custom">自定义启发函数</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="costMethod">成本计算方法</Label>
              <Select
                value={settings.goap.costMethod}
                onValueChange={(value: AdvancedSettings['goap']['costMethod']) =>
                  setSettings({ ...settings, goap: { ...settings.goap, costMethod: value } })
                }
              >
                <SelectTrigger id="costMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uniform">Uniform - 所有操作成本相同</SelectItem>
                  <SelectItem value="time">Time - 按执行时间</SelectItem>
                  <SelectItem value="resources">Resources - 按资源占用</SelectItem>
                  <SelectItem value="tokens">Tokens - 按 Token 消耗</SelectItem>
                  <SelectItem value="hybrid">Hybrid - 多因素组合</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <Label>优化选项</Label>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>启用优化</Label>
                  <p className="text-xs text-muted-foreground">优化生成的计划</p>
                </div>
                <Switch
                  checked={settings.goap.optimization.enabled}
                  onCheckedChange={(enabled) =>
                    setSettings({
                      ...settings,
                      goap: { ...settings.goap, optimization: { ...settings.goap.optimization, enabled } },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>检测并行操作</Label>
                  <p className="text-xs text-muted-foreground">查找可并发执行的操作</p>
                </div>
                <Switch
                  checked={settings.goap.optimization.detectParallel}
                  onCheckedChange={(detectParallel) =>
                    setSettings({
                      ...settings,
                      goap: { ...settings.goap, optimization: { ...settings.goap.optimization, detectParallel } },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>移除冗余操作</Label>
                  <p className="text-xs text-muted-foreground">消除不必要的步骤</p>
                </div>
                <Switch
                  checked={settings.goap.optimization.removeRedundant}
                  onCheckedChange={(removeRedundant) =>
                    setSettings({
                      ...settings,
                      goap: { ...settings.goap, optimization: { ...settings.goap.optimization, removeRedundant } },
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* Execution Configuration */}
          <TabsContent value="execution" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="execStrategy">执行策略</Label>
              <Select
                value={settings.execution.strategy}
                onValueChange={(value: AdvancedSettings['execution']['strategy']) =>
                  setSettings({ ...settings, execution: { ...settings.execution, strategy: value } })
                }
              >
                <SelectTrigger id="execStrategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential - 一次一个任务</SelectItem>
                  <SelectItem value="parallel">Parallel - 最大并发</SelectItem>
                  <SelectItem value="hybrid">Hybrid - 混合方式</SelectItem>
                  <SelectItem value="adaptive">Adaptive - 根据负载动态调整</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxParallelTasks">最大并行任务数：{settings.execution.maxParallelTasks}</Label>
              <Slider
                id="maxParallelTasks"
                min={1}
                max={20}
                step={1}
                value={[settings.execution.maxParallelTasks]}
                onValueChange={([value]) =>
                  setSettings({ ...settings, execution: { ...settings.execution, maxParallelTasks: value } })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeout">超时时间（秒）：{settings.execution.timeout / 1000}</Label>
              <Slider
                id="timeout"
                min={30000}
                max={900000}
                step={30000}
                value={[settings.execution.timeout]}
                onValueChange={([value]) =>
                  setSettings({ ...settings, execution: { ...settings.execution, timeout: value } })
                }
              />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-4 bg-muted/30">
              <div className="space-y-0.5">
                <Label>启用质量门禁</Label>
                <p className="text-xs text-muted-foreground">
                  运行编译检查、测试覆盖率、代码质量与安全扫描
                </p>
              </div>
              <Switch
                checked={settings.execution.enableQualityGates}
                onCheckedChange={(enableQualityGates) =>
                  setSettings({ ...settings, execution: { ...settings.execution, enableQualityGates } })
                }
              />
            </div>
          </TabsContent>

          {/* Model Router Configuration */}
          <TabsContent value="model" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="provider">首选 Provider</Label>
              <Select
                value={settings.modelRouter.primaryProvider}
                onValueChange={(value: AdvancedSettings['modelRouter']['primaryProvider']) =>
                  setSettings({ ...settings, modelRouter: { ...settings.modelRouter, primaryProvider: value } })
                }
              >
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic - 最高质量</SelectItem>
                  <SelectItem value="openrouter">OpenRouter - 节省 99% 成本</SelectItem>
                  <SelectItem value="gemini">Gemini - 速度优先</SelectItem>
                  <SelectItem value="local">Local - 注重隐私（ONNX）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="routingStrategy">路由策略</Label>
              <Select
                value={settings.modelRouter.strategy}
                onValueChange={(value: AdvancedSettings['modelRouter']['strategy']) =>
                  setSettings({ ...settings, modelRouter: { ...settings.modelRouter, strategy: value } })
                }
              >
                <SelectTrigger id="routingStrategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cost">Cost - 优先选择最便宜的模型</SelectItem>
                  <SelectItem value="speed">Speed - 优先选择最快的模型</SelectItem>
                  <SelectItem value="quality">Quality - 优先选择质量最高的模型</SelectItem>
                  <SelectItem value="privacy">Privacy - 仅使用本地模型</SelectItem>
                  <SelectItem value="balanced">Balanced - 综合优化所有因素</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxCost">单次请求最大成本（$）：{settings.modelRouter.maxCostPerRequest.toFixed(2)}</Label>
              <Slider
                id="maxCost"
                min={0.01}
                max={5.0}
                step={0.01}
                value={[settings.modelRouter.maxCostPerRequest]}
                onValueChange={([value]) =>
                  setSettings({ ...settings, modelRouter: { ...settings.modelRouter, maxCostPerRequest: value } })
                }
              />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-4 bg-muted/30">
              <div className="space-y-0.5">
                <Label>启用回退</Label>
                <p className="text-xs text-muted-foreground">
                  失败时自动回退到其他 Provider
                </p>
              </div>
              <Switch
                checked={settings.modelRouter.enableFallback}
                onCheckedChange={(enableFallback) =>
                  setSettings({ ...settings, modelRouter: { ...settings.modelRouter, enableFallback } })
                }
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            恢复默认设置
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            保存配置
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
