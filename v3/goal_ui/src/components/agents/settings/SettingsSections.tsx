/**
 * AdvancedSettingsModal 的四个配置区（swarm/goap/execution/modelRouter）。
 * 各自独立的受控表单段：消费点（Agents.tsx / Index.tsx / research-step edge
 * function）读取的是同一个 AdvancedSettings 对象——这里改的是持久化源。
 */
import type { Dispatch, SetStateAction } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/i18n";
import type { AdvancedSettings } from "@/lib/agenticSettings";

interface SectionProps {
  settings: AdvancedSettings;
  setSettings: Dispatch<SetStateAction<AdvancedSettings>>;
}

/* ---------------- Swarm ---------------- */

export const SwarmSettingsSection = ({ settings, setSettings }: SectionProps) => {
  const { t } = useI18n();
  const swarm = settings.swarm;
  const update = (patch: Partial<AdvancedSettings["swarm"]>) =>
    setSettings((s) => ({ ...s, swarm: { ...s.swarm, ...patch } }));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="topology">{t('agents.settings.swarm.topology')}</Label>
        <Select
          value={swarm.topology}
          onValueChange={(value: AdvancedSettings['swarm']['topology']) => update({ topology: value })}
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
        <Label htmlFor="maxAgents">{t('agents.settings.swarm.maxAgents', { count: swarm.maxAgents })}</Label>
        <Slider
          id="maxAgents"
          min={1}
          max={50}
          step={1}
          value={[swarm.maxAgents]}
          onValueChange={([value]) => update({ maxAgents: value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="strategy">{t('agents.settings.swarm.strategy')}</Label>
        <Select
          value={swarm.strategy}
          onValueChange={(value: AdvancedSettings['swarm']['strategy']) => update({ strategy: value })}
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
            checked={swarm.autoScaling.enabled}
            onCheckedChange={(enabled) =>
              setSettings((s) => ({
                ...s,
                swarm: { ...s.swarm, autoScaling: { ...s.swarm.autoScaling, enabled } },
              }))
            }
          />
        </div>

        {swarm.autoScaling.enabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('agents.settings.swarm.minAgents')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={swarm.autoScaling.minAgents}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      swarm: {
                        ...s.swarm,
                        autoScaling: { ...s.swarm.autoScaling, minAgents: parseInt(e.target.value) },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t('agents.settings.swarm.maxAgentsNum')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={swarm.autoScaling.maxAgents}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      swarm: {
                        ...s.swarm,
                        autoScaling: { ...s.swarm.autoScaling, maxAgents: parseInt(e.target.value) },
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('agents.settings.swarm.scaleUp', { value: swarm.autoScaling.scaleUpThreshold })}</Label>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[swarm.autoScaling.scaleUpThreshold]}
                onValueChange={([value]) =>
                  setSettings((s) => ({
                    ...s,
                    swarm: {
                      ...s.swarm,
                      autoScaling: { ...s.swarm.autoScaling, scaleUpThreshold: value },
                    },
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t('agents.settings.swarm.scaleDown', { value: swarm.autoScaling.scaleDownThreshold })}</Label>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[swarm.autoScaling.scaleDownThreshold]}
                onValueChange={([value]) =>
                  setSettings((s) => ({
                    ...s,
                    swarm: {
                      ...s.swarm,
                      autoScaling: { ...s.swarm.autoScaling, scaleDownThreshold: value },
                    },
                  }))
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ---------------- GOAP ---------------- */

export const GoapSettingsSection = ({ settings, setSettings }: SectionProps) => {
  const { t } = useI18n();
  const goap = settings.goap;
  const update = (patch: Partial<AdvancedSettings["goap"]>) =>
    setSettings((s) => ({ ...s, goap: { ...s.goap, ...patch } }));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="algorithm">{t('agents.settings.goap.algorithm')}</Label>
        <Select
          value={goap.algorithm}
          onValueChange={(value: AdvancedSettings['goap']['algorithm']) => update({ algorithm: value })}
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
          value={goap.heuristic}
          onValueChange={(value: AdvancedSettings['goap']['heuristic']) => update({ heuristic: value })}
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
          value={goap.costMethod}
          onValueChange={(value: AdvancedSettings['goap']['costMethod']) => update({ costMethod: value })}
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
            checked={goap.optimization.enabled}
            onCheckedChange={(enabled) =>
              setSettings((s) => ({
                ...s,
                goap: { ...s.goap, optimization: { ...s.goap.optimization, enabled } },
              }))
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t('agents.settings.goap.detectParallel')}</Label>
            <p className="text-xs text-muted-foreground">{t('agents.settings.goap.detectParallelDesc')}</p>
          </div>
          <Switch
            checked={goap.optimization.detectParallel}
            onCheckedChange={(detectParallel) =>
              setSettings((s) => ({
                ...s,
                goap: { ...s.goap, optimization: { ...s.goap.optimization, detectParallel } },
              }))
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t('agents.settings.goap.removeRedundant')}</Label>
            <p className="text-xs text-muted-foreground">{t('agents.settings.goap.removeRedundantDesc')}</p>
          </div>
          <Switch
            checked={goap.optimization.removeRedundant}
            onCheckedChange={(removeRedundant) =>
              setSettings((s) => ({
                ...s,
                goap: { ...s.goap, optimization: { ...s.goap.optimization, removeRedundant } },
              }))
            }
          />
        </div>
      </div>
    </div>
  );
};

/* ---------------- Execution ---------------- */

export const ExecutionSettingsSection = ({ settings, setSettings }: SectionProps) => {
  const { t } = useI18n();
  const execution = settings.execution;
  const update = (patch: Partial<AdvancedSettings["execution"]>) =>
    setSettings((s) => ({ ...s, execution: { ...s.execution, ...patch } }));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="execStrategy">{t('agents.settings.exec.strategy')}</Label>
        <Select
          value={execution.strategy}
          onValueChange={(value: AdvancedSettings['execution']['strategy']) => update({ strategy: value })}
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
        <Label htmlFor="maxParallelTasks">{t('agents.settings.exec.maxParallel', { count: execution.maxParallelTasks })}</Label>
        <Slider
          id="maxParallelTasks"
          min={1}
          max={20}
          step={1}
          value={[execution.maxParallelTasks]}
          onValueChange={([value]) => update({ maxParallelTasks: value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="timeout">{t('agents.settings.exec.timeout', { seconds: execution.timeout / 1000 })}</Label>
        <Slider
          id="timeout"
          min={30000}
          max={900000}
          step={30000}
          value={[execution.timeout]}
          onValueChange={([value]) => update({ timeout: value })}
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
          checked={execution.enableQualityGates}
          onCheckedChange={(enableQualityGates) => update({ enableQualityGates })}
        />
      </div>
    </div>
  );
};

/* ---------------- Model Router ---------------- */

export const ModelRouterSettingsSection = ({ settings, setSettings }: SectionProps) => {
  const { t } = useI18n();
  const modelRouter = settings.modelRouter;
  const update = (patch: Partial<AdvancedSettings["modelRouter"]>) =>
    setSettings((s) => ({ ...s, modelRouter: { ...s.modelRouter, ...patch } }));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="provider">{t('agents.settings.model.provider')}</Label>
        <Select
          value={modelRouter.primaryProvider}
          onValueChange={(value: AdvancedSettings['modelRouter']['primaryProvider']) => update({ primaryProvider: value })}
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
          value={modelRouter.strategy}
          onValueChange={(value: AdvancedSettings['modelRouter']['strategy']) => update({ strategy: value })}
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
        <Label htmlFor="maxCost">{t('agents.settings.model.maxCost', { cost: modelRouter.maxCostPerRequest.toFixed(2) })}</Label>
        <Slider
          id="maxCost"
          min={0.01}
          max={5.0}
          step={0.01}
          value={[modelRouter.maxCostPerRequest]}
          onValueChange={([value]) => update({ maxCostPerRequest: value })}
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
          checked={modelRouter.enableFallback}
          onCheckedChange={(enableFallback) => update({ enableFallback })}
        />
      </div>
    </div>
  );
};
