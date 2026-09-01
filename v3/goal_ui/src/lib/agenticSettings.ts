/**
 * AdvancedSettings 共享类型、默认值与持久化加载。
 *
 * AdvancedSettingsModal（UI 编辑）与各消费点（Agents.tsx 的 swarm 模拟、
 * Index.tsx 的 GOAP 规划与 modelRouter 传参）共同依赖这里，保证所有消费点
 * 读取的是同一个 settings 对象，且 schema 变更时只有一处需要更新。
 */

export const AGENTICFLOW_SETTINGS_KEY = "agenticflow-settings";

export type SwarmTopology = "mesh" | "hierarchical" | "ring" | "star";
export type SwarmStrategy = "balanced" | "specialized" | "adaptive";
export type GoapAlgorithm = "a-star" | "greedy" | "dijkstra" | "bfs" | "dfs";
export type GoapHeuristic = "manhattan" | "euclidean" | "hamming" | "custom";
export type GoapCostMethod = "uniform" | "time" | "resources" | "tokens" | "hybrid";
export type ModelProvider = "anthropic" | "openrouter" | "gemini" | "local";
export type RouterStrategy = "cost" | "speed" | "quality" | "privacy" | "balanced";

export interface AdvancedSettings {
  // Swarm Configuration
  swarm: {
    topology: SwarmTopology;
    maxAgents: number;
    strategy: SwarmStrategy;
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
    algorithm: GoapAlgorithm;
    heuristic: GoapHeuristic;
    costMethod: GoapCostMethod;
    optimization: {
      enabled: boolean;
      detectParallel: boolean;
      removeRedundant: boolean;
    };
  };

  // Execution Configuration
  execution: {
    strategy: "sequential" | "parallel" | "hybrid" | "adaptive";
    maxParallelTasks: number;
    timeout: number;
    enableQualityGates: boolean;
  };

  // Model Router Configuration
  modelRouter: {
    primaryProvider: ModelProvider;
    strategy: RouterStrategy;
    maxCostPerRequest: number;
    enableFallback: boolean;
  };
}

export const defaultSettings: AdvancedSettings = {
  swarm: {
    topology: "hierarchical",
    maxAgents: 10,
    strategy: "adaptive",
    autoScaling: {
      enabled: true,
      minAgents: 2,
      maxAgents: 20,
      scaleUpThreshold: 80,
      scaleDownThreshold: 20,
    },
  },
  goap: {
    algorithm: "a-star",
    heuristic: "manhattan",
    costMethod: "hybrid",
    optimization: {
      enabled: true,
      detectParallel: true,
      removeRedundant: true,
    },
  },
  execution: {
    strategy: "adaptive",
    maxParallelTasks: 5,
    timeout: 300000,
    enableQualityGates: true,
  },
  modelRouter: {
    primaryProvider: "anthropic",
    strategy: "balanced",
    maxCostPerRequest: 1.0,
    enableFallback: true,
  },
};

/** localStorage 里是否已保存过设置（区别于"从未保存、落到默认值"） */
export function hasSavedAdvancedSettings(): boolean {
  try {
    return localStorage.getItem(AGENTICFLOW_SETTINGS_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * 读取并校验持久化的设置；缺失/损坏字段回退到默认值，而不是让消费点崩掉。
 * 返回的永远是结构完整的 AdvancedSettings——消费点无需逐字段判空。
 */
export function loadAdvancedSettings(): AdvancedSettings {
  try {
    const raw = localStorage.getItem(AGENTICFLOW_SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<AdvancedSettings>;

    return {
      swarm: {
        topology: parsed.swarm?.topology ?? defaultSettings.swarm.topology,
        maxAgents: typeof parsed.swarm?.maxAgents === "number" ? parsed.swarm.maxAgents : defaultSettings.swarm.maxAgents,
        strategy: parsed.swarm?.strategy ?? defaultSettings.swarm.strategy,
        autoScaling: {
          enabled: parsed.swarm?.autoScaling?.enabled ?? defaultSettings.swarm.autoScaling.enabled,
          minAgents: typeof parsed.swarm?.autoScaling?.minAgents === "number" ? parsed.swarm.autoScaling.minAgents : defaultSettings.swarm.autoScaling.minAgents,
          maxAgents: typeof parsed.swarm?.autoScaling?.maxAgents === "number" ? parsed.swarm.autoScaling.maxAgents : defaultSettings.swarm.autoScaling.maxAgents,
          scaleUpThreshold: typeof parsed.swarm?.autoScaling?.scaleUpThreshold === "number" ? parsed.swarm.autoScaling.scaleUpThreshold : defaultSettings.swarm.autoScaling.scaleUpThreshold,
          scaleDownThreshold: typeof parsed.swarm?.autoScaling?.scaleDownThreshold === "number" ? parsed.swarm.autoScaling.scaleDownThreshold : defaultSettings.swarm.autoScaling.scaleDownThreshold,
        },
      },
      goap: {
        algorithm: parsed.goap?.algorithm ?? defaultSettings.goap.algorithm,
        heuristic: parsed.goap?.heuristic ?? defaultSettings.goap.heuristic,
        costMethod: parsed.goap?.costMethod ?? defaultSettings.goap.costMethod,
        optimization: {
          enabled: parsed.goap?.optimization?.enabled ?? defaultSettings.goap.optimization.enabled,
          detectParallel: parsed.goap?.optimization?.detectParallel ?? defaultSettings.goap.optimization.detectParallel,
          removeRedundant: parsed.goap?.optimization?.removeRedundant ?? defaultSettings.goap.optimization.removeRedundant,
        },
      },
      execution: {
        strategy: parsed.execution?.strategy ?? defaultSettings.execution.strategy,
        maxParallelTasks: typeof parsed.execution?.maxParallelTasks === "number" ? parsed.execution.maxParallelTasks : defaultSettings.execution.maxParallelTasks,
        timeout: typeof parsed.execution?.timeout === "number" ? parsed.execution.timeout : defaultSettings.execution.timeout,
        enableQualityGates: parsed.execution?.enableQualityGates ?? defaultSettings.execution.enableQualityGates,
      },
      modelRouter: {
        primaryProvider: parsed.modelRouter?.primaryProvider ?? defaultSettings.modelRouter.primaryProvider,
        strategy: parsed.modelRouter?.strategy ?? defaultSettings.modelRouter.strategy,
        maxCostPerRequest: typeof parsed.modelRouter?.maxCostPerRequest === "number" ? parsed.modelRouter.maxCostPerRequest : defaultSettings.modelRouter.maxCostPerRequest,
        enableFallback: parsed.modelRouter?.enableFallback ?? defaultSettings.modelRouter.enableFallback,
      },
    };
  } catch {
    // 损坏的持久化数据回退到默认配置，而不是让应用崩溃
    return defaultSettings;
  }
}
