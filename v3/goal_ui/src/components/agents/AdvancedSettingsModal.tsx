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
import { useI18n } from "@/i18n";

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
    name: 'agents.settings.preset.dev',
    description: 'agents.settings.preset.devDesc',
    badge: 'default' as const,
  },
  production: {
    name: 'agents.settings.preset.prod',
    description: 'agents.settings.preset.prodDesc',
    badge: 'default' as const,
  },
  budget: {
    name: 'agents.settings.preset.budget',
    description: 'agents.settings.preset.budgetDesc',
    badge: 'secondary' as const,
  },
  quality: {
    name: 'agents.tab.quality',
    description: 'agents.settings.preset.qualityDesc',
    badge: 'destructive' as const,
  },
};

export function AdvancedSettingsModal() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AdvancedSettings>(() => {
    const saved = localStorage.getItem('agenticflow-settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleSave = () => {
    localStorage.setItem('agenticflow-settings', JSON.stringify(settings));
    toast({
      title: t('agents.settings.saved'),
      description: t('agents.settings.savedDesc'),
    });
    setOpen(false);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    toast({
      title: t('agents.settings.reset'),
      description: t('agents.settings.resetDesc'),
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
      title: t('agents.settings.presetApplied', { name: t(presets[presetName].name) }),
      description: t(presets[presetName].description),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" />
          {t('agents.settings.trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-500" />
            {t('agents.settings.title')}
          </DialogTitle>
          <DialogDescription>
            {t('agents.settings.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Presets */}
        <div className="space-y-2">
          <Label>{t('agents.settings.presets')}</Label>
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
                  <span className="font-semibold">{t(preset.name)}</span>
                  <Badge variant={preset.badge} className="text-xs">
                    {t(preset.name)}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  {t(preset.description)}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <Tabs defaultValue="swarm" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="swarm">{t('agents.settings.tab.swarm')}</TabsTrigger>
            <TabsTrigger value="goap">{t('agents.settings.tab.goap')}</TabsTrigger>
            <TabsTrigger value="execution">{t('agents.tab.execution')}</TabsTrigger>
            <TabsTrigger value="model">{t('agents.settings.tab.model')}</TabsTrigger>
          </TabsList>

          {/* Swarm Configuration */}
          <TabsContent value="swarm" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="topology">{t('agents.settings.swarm.topology')}</Label>
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
                  <SelectItem value="mesh">{t('agents.settings.swarm.topology.mesh')}</SelectItem>
                  <SelectItem value="hierarchical">{t('agents.settings.swarm.topology.hierarchical')}</SelectItem>
                  <SelectItem value="ring">{t('agents.settings.swarm.topology.ring')}</SelectItem>
                  <SelectItem value="star">{t('agents.settings.swarm.topology.star')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxAgents">{t('agents.settings.swarm.maxAgents', { count: settings.swarm.maxAgents })}</Label>
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
              <Label htmlFor="strategy">{t('agents.settings.swarm.strategy')}</Label>
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
                  <SelectItem value="balanced">{t('agents.settings.swarm.strategy.balanced')}</SelectItem>
                  <SelectItem value="specialized">{t('agents.settings.swarm.strategy.specialized')}</SelectItem>
                  <SelectItem value="adaptive">{t('agents.settings.strategy.adaptive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label htmlFor="autoScaling">{t('agents.settings.swarm.autoScaling')}</Label>
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
                      <Label>{t('agents.settings.swarm.minAgents')}</Label>
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
                      <Label>{t('agents.settings.swarm.maxAgentsNum')}</Label>
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
                    <Label>{t('agents.settings.swarm.scaleUp', { value: settings.swarm.autoScaling.scaleUpThreshold })}</Label>
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
                    <Label>{t('agents.settings.swarm.scaleDown', { value: settings.swarm.autoScaling.scaleDownThreshold })}</Label>
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
              <Label htmlFor="algorithm">{t('agents.settings.goap.algorithm')}</Label>
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
                  <SelectItem value="a-star">{t('agents.settings.goap.algorithm.astar')}</SelectItem>
                  <SelectItem value="greedy">{t('agents.settings.goap.algorithm.greedy')}</SelectItem>
                  <SelectItem value="dijkstra">{t('agents.settings.goap.algorithm.dijkstra')}</SelectItem>
                  <SelectItem value="bfs">{t('agents.settings.goap.algorithm.bfs')}</SelectItem>
                  <SelectItem value="dfs">{t('agents.settings.goap.algorithm.dfs')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="heuristic">{t('agents.settings.goap.heuristic')}</Label>
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
                  <SelectItem value="manhattan">{t('agents.settings.goap.heuristic.manhattan')}</SelectItem>
                  <SelectItem value="euclidean">{t('agents.settings.goap.heuristic.euclidean')}</SelectItem>
                  <SelectItem value="hamming">{t('agents.settings.goap.heuristic.hamming')}</SelectItem>
                  <SelectItem value="custom">{t('agents.settings.goap.heuristic.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="costMethod">{t('agents.settings.goap.costMethod')}</Label>
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
                  <SelectItem value="uniform">{t('agents.settings.goap.costMethod.uniform')}</SelectItem>
                  <SelectItem value="time">{t('agents.settings.goap.costMethod.time')}</SelectItem>
                  <SelectItem value="resources">{t('agents.settings.goap.costMethod.resources')}</SelectItem>
                  <SelectItem value="tokens">{t('agents.settings.goap.costMethod.tokens')}</SelectItem>
                  <SelectItem value="hybrid">{t('agents.settings.goap.costMethod.hybrid')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <Label>{t('agents.settings.goap.optimization')}</Label>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('agents.settings.goap.enableOptimization')}</Label>
                  <p className="text-xs text-muted-foreground">{t('agents.settings.goap.enableOptimizationDesc')}</p>
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
                  <Label>{t('agents.settings.goap.detectParallel')}</Label>
                  <p className="text-xs text-muted-foreground">{t('agents.settings.goap.detectParallelDesc')}</p>
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
                  <Label>{t('agents.settings.goap.removeRedundant')}</Label>
                  <p className="text-xs text-muted-foreground">{t('agents.settings.goap.removeRedundantDesc')}</p>
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
              <Label htmlFor="execStrategy">{t('agents.settings.exec.strategy')}</Label>
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
                  <SelectItem value="sequential">{t('agents.settings.exec.strategy.sequential')}</SelectItem>
                  <SelectItem value="parallel">{t('agents.settings.exec.strategy.parallel')}</SelectItem>
                  <SelectItem value="hybrid">{t('agents.settings.exec.strategy.hybrid')}</SelectItem>
                  <SelectItem value="adaptive">{t('agents.settings.strategy.adaptive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxParallelTasks">{t('agents.settings.exec.maxParallel', { count: settings.execution.maxParallelTasks })}</Label>
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
              <Label htmlFor="timeout">{t('agents.settings.exec.timeout', { seconds: settings.execution.timeout / 1000 })}</Label>
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
                <Label>{t('agents.settings.exec.qualityGates')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('agents.settings.exec.qualityGatesDesc')}
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
              <Label htmlFor="provider">{t('agents.settings.model.provider')}</Label>
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
                  <SelectItem value="anthropic">{t('agents.settings.model.provider.anthropic')}</SelectItem>
                  <SelectItem value="openrouter">{t('agents.settings.model.provider.openrouter')}</SelectItem>
                  <SelectItem value="gemini">{t('agents.settings.model.provider.gemini')}</SelectItem>
                  <SelectItem value="local">{t('agents.settings.model.provider.local')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="routingStrategy">{t('agents.settings.model.strategy')}</Label>
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
                  <SelectItem value="cost">{t('agents.settings.model.strategy.cost')}</SelectItem>
                  <SelectItem value="speed">{t('agents.settings.model.strategy.speed')}</SelectItem>
                  <SelectItem value="quality">{t('agents.settings.model.strategy.quality')}</SelectItem>
                  <SelectItem value="privacy">{t('agents.settings.model.strategy.privacy')}</SelectItem>
                  <SelectItem value="balanced">{t('agents.settings.model.strategy.balanced')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxCost">{t('agents.settings.model.maxCost', { cost: settings.modelRouter.maxCostPerRequest.toFixed(2) })}</Label>
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
                <Label>{t('agents.settings.model.fallback')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('agents.settings.model.fallbackDesc')}
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
            {t('agents.settings.resetDefaults')}
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            {t('agents.settings.saveConfig')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
