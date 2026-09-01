import { LucideIcon } from "lucide-react";
import type { GoapAlgorithm, GoapCostMethod, GoapHeuristic } from "./agenticSettings";

export interface DataItem {
  text: string;
  icon?: LucideIcon;
  details?: {
    objective?: string;
    sources?: string[];
    citations?: string[];
    agents?: string[];
    preconditions?: string[];
    effects?: string[];
  };
}

/** GOAPPlanner 的可配置项，与 AdvancedSettings.goap 一一对应（由设置弹窗持久化） */
export interface GOAPPlannerOptions {
  algorithm?: GoapAlgorithm;
  heuristic?: GoapHeuristic;
  costMethod?: GoapCostMethod;
  optimization?: {
    enabled?: boolean;
    detectParallel?: boolean;
    removeRedundant?: boolean;
  };
}

/** 单次 plan() 的搜索统计，供调用方展示规划行为（算法选择/代价方法可观测） */
export interface PlanStats {
  planCost: number;
  nodesExpanded: number;
  parallelSteps: number;
  redundantRemoved: number;
}

/** 搜索树节点 */
interface SearchNode {
  state: WorldState;
  actions: Action[];
  cost: number;
  heuristic: number;
}

export interface Step {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  status: "pending" | "active" | "completed" | "error";
  data?: DataItem[];
  metrics?: { label: string; value: string }[];
}

interface WorldState {
  goalDefined: boolean;
  goalParsed: boolean;
  stateAssessed: boolean;
  informationGathered: boolean;
  documentsAnalyzed: boolean;
  knowledgeSynthesized: boolean;
  insightsGenerated: boolean;
  verified: boolean;
}

interface Action {
  name: string;
  cost: number;
  /** 分维度代价（costMethod 为 time/resources/tokens/hybrid 时读取），缺省回落 cost */
  costBreakdown?: Partial<Record<"time" | "resources" | "tokens", number>>;
  preconditions: Partial<WorldState>;
  effects: Partial<WorldState>;
  stepGenerator: (goal: string) => Step;
}

/**
 * GOAP (Goal-Oriented Action Planning) Planner
 * 默认使用 A* 搜索；可通过 options 切换算法/启发式/代价方法/优化项
 * （与 AdvancedSettingsModal 的 goap 配置区一一对应）。
 */
export class GOAPPlanner {
  private actions: Action[];
  private options: Required<GOAPPlannerOptions>;

  /** 最近一次 plan() 的搜索统计（调用方展示规划行为用） */
  public lastStats: PlanStats = { planCost: 0, nodesExpanded: 0, parallelSteps: 0, redundantRemoved: 0 };

  constructor(actions: Action[], options: GOAPPlannerOptions = {}) {
    this.actions = actions;
    this.options = {
      algorithm: options.algorithm ?? "a-star",
      heuristic: options.heuristic ?? "manhattan",
      costMethod: options.costMethod ?? "uniform",
      optimization: {
        enabled: options.optimization?.enabled ?? true,
        detectParallel: options.optimization?.detectParallel ?? false,
        removeRedundant: options.optimization?.removeRedundant ?? false,
      },
    };
  }

  /**
   * Calculate heuristic distance to goal. WorldState 是布尔向量，所以
   * 各启发式都是"未满足条件数"的变形——差别在权重与量纲，影响搜索排序。
   */
  private heuristic(state: WorldState, goal: WorldState): number {
    switch (this.options.heuristic) {
      case "euclidean":
        return Math.sqrt(this.unmetCount(state, goal));
      case "custom":
        // 自定义加权：越接近收尾的验证类条件权重越高，引导搜索优先满足它们
        return this.weightedUnmet(state, goal);
      case "hamming":
        // 对所有键（含 goal 中为 false 的键）逐位比较
        return this.hammingDistance(state, goal);
      case "manhattan":
      default:
        return this.unmetCount(state, goal);
    }
  }

  /** 目标条件中未满足的个数 */
  private unmetCount(state: WorldState, goal: WorldState): number {
    let distance = 0;
    for (const key in goal) {
      if (goal[key as keyof WorldState] && !state[key as keyof WorldState]) {
        distance++;
      }
    }
    return distance;
  }

  /** 加权未满足：verified/insightsGenerated 权重 2，其余 1 */
  private weightedUnmet(state: WorldState, goal: WorldState): number {
    const weights: Partial<Record<keyof WorldState, number>> = {
      verified: 2,
      insightsGenerated: 2,
      knowledgeSynthesized: 1.5,
    };
    let distance = 0;
    for (const key in goal) {
      if (goal[key as keyof WorldState] && !state[key as keyof WorldState]) {
        distance += weights[key as keyof WorldState] ?? 1;
      }
    }
    return distance;
  }

  /** 全键逐位比较（与布尔目标向量之间的汉明距离） */
  private hammingDistance(state: WorldState, goal: WorldState): number {
    const allKeys = new Set([...Object.keys(state), ...Object.keys(goal)]) as Set<keyof WorldState>;
    let distance = 0;
    for (const key of allKeys) {
      if (!!state[key] !== !!goal[key]) distance++;
    }
    return distance;
  }

  /**
   * 动作代价值。costMethod 决定读取哪个维度；costBreakdown 缺省的维度回落 base cost。
   */
  private actionCost(action: Action): number {
    const breakdown = action.costBreakdown ?? {};
    switch (this.options.costMethod) {
      case "uniform":
        return 1;
      case "time":
        return breakdown.time ?? action.cost;
      case "resources":
        return breakdown.resources ?? action.cost;
      case "tokens":
        return breakdown.tokens ?? action.cost;
      case "hybrid": {
        const dims = ["time", "resources", "tokens"] as const;
        const values = dims.map((d) => breakdown[d]).filter((v): v is number => typeof v === "number");
        if (values.length === 0) return action.cost;
        return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      }
      default:
        return action.cost;
    }
  }

  /**
   * Check if all preconditions are met
   */
  private preconditionsMet(state: WorldState, preconditions: Partial<WorldState>): boolean {
    for (const key in preconditions) {
      if (preconditions[key as keyof WorldState] && !state[key as keyof WorldState]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Apply action effects to state
   */
  private applyEffects(state: WorldState, effects: Partial<WorldState>): WorldState {
    return { ...state, ...effects };
  }

  /** 从 openList 取出下一个节点：按算法选择队列策略 */
  private popNext(openList: SearchNode[]): SearchNode {
    switch (this.options.algorithm) {
      case "dijkstra":
        // 只按已付出代价排序（无启发式，保证最优但扩展更多节点）
        openList.sort((a, b) => a.cost - b.cost);
        return openList.shift()!;
      case "greedy":
        // 只按启发式排序（最快逼近目标，不保证最优）
        openList.sort((a, b) => a.heuristic - b.heuristic);
        return openList.shift()!;
      case "bfs":
        // FIFO 队列——按层展开
        return openList.shift()!;
      case "dfs":
        // LIFO 栈——深度优先
        return openList.pop()!;
      case "a-star":
      default:
        // 总代价 = 已付出 + 启发式
        openList.sort((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));
        return openList.shift()!;
    }
  }

  /**
   * 优化：检测可并行执行的动作对——必须无传递依赖（Floyd-Warshall 传递闭包）。
   * 直接前置不重叠不够：A→B→C 时 A 与 C 虽然效果不直接重叠，仍存在依赖链，不能并行。
   */
  private detectParallelSteps(actions: Action[]): number {
    const n = actions.length;
    // 直接依赖矩阵：i -> j 当且仅当 j 的前置条件直接由 i 的效果满足
    const direct: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const depends = Object.keys(actions[j].preconditions).some(
          (k) => actions[i].effects[k as keyof WorldState] === true
        );
        if (depends) direct[i][j] = true;
      }
    }
    // 传递闭包
    const reach: boolean[][] = direct.map((row) => [...row]);
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (reach[i][k] && reach[k][j]) reach[i][j] = true;
        }
      }
    }
    // 无任何方向可达路径的动作对可并行
    let count = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!reach[i][j] && !reach[j][i]) count++;
      }
    }
    return count;
  }

  /**
   * 优化：删除冗余动作——其效果在更早动作的效果并集中已满足，
   * 且前置条件也已具备时，该动作不改变任何状态。
   */
  private removeRedundantActions(actions: Action[]): Action[] {
    const cumulative: Partial<WorldState> = {};
    return actions.filter((action) => {
      const redundant = this.preconditionsMet(cumulative as WorldState, action.preconditions)
        && Object.entries(action.effects).every(
          ([key, value]) => cumulative[key as keyof WorldState] === value
        );
      // 累积效果（无论是否冗余，效果都并入——保持与真实执行的语义一致）
      Object.assign(cumulative, action.effects);
      return !redundant;
    });
  }

  /**
   * Find optimal plan using configured search algorithm
   */
  public plan(currentState: WorldState, goalState: WorldState, userGoal: string): Step[] {
    const openList: SearchNode[] = [];
    const closedList: Set<string> = new Set();
    let nodesExpanded = 0;

    // Start node
    openList.push({
      state: currentState,
      actions: [],
      cost: 0,
      heuristic: this.heuristic(currentState, goalState),
    });

    let best: Action[] = [];

    while (openList.length > 0) {
      const current = this.popNext(openList);
      nodesExpanded++;
      const stateKey = JSON.stringify(current.state);

      // Check if goal reached
      if (this.heuristic(current.state, goalState) === 0) {
        best = current.actions;
        break;
      }

      if (closedList.has(stateKey)) continue;
      closedList.add(stateKey);

      // Try all applicable actions
      for (const action of this.actions) {
        if (this.preconditionsMet(current.state, action.preconditions)) {
          const newState = this.applyEffects(current.state, action.effects);
          const newStateKey = JSON.stringify(newState);

          if (!closedList.has(newStateKey)) {
            openList.push({
              state: newState,
              actions: [...current.actions, action],
              cost: current.cost + this.actionCost(action),
              heuristic: this.heuristic(newState, goalState),
            });
          }
        }
      }
    }

    const opt = this.options.optimization;
    let parallelSteps = 0;
    if (opt.enabled && opt.detectParallel) {
      parallelSteps = this.detectParallelSteps(best);
    }
    let redundantRemoved = 0;
    if (opt.enabled && opt.removeRedundant) {
      const before = best.length;
      best = this.removeRedundantActions(best);
      redundantRemoved = before - best.length;
    }

    this.lastStats = {
      planCost: best.reduce((sum, a) => sum + this.actionCost(a), 0),
      nodesExpanded,
      parallelSteps,
      redundantRemoved,
    };

    // Convert actions to steps
    return best.map(action => action.stepGenerator(userGoal));
  }
}

/**
 * Parse user goal to extract key information
 */
export function parseGoal(goal: string): {
  domain: string;
  action: string;
  keywords: string[];
} {
  const lowerGoal = goal.toLowerCase();
  
  // Extract domain
  let domain = "general";
  if (lowerGoal.includes("quantum") || lowerGoal.includes("computing")) domain = "technology";
  if (lowerGoal.includes("market") || lowerGoal.includes("business")) domain = "business";
  if (lowerGoal.includes("architecture") || lowerGoal.includes("software")) domain = "software engineering";
  if (lowerGoal.includes("energy") || lowerGoal.includes("renewable")) domain = "energy";

  // Extract action
  let action = "research";
  if (lowerGoal.includes("analyze")) action = "analyze";
  if (lowerGoal.includes("investigate")) action = "investigate";
  if (lowerGoal.includes("compare")) action = "compare";
  if (lowerGoal.includes("evaluate")) action = "evaluate";

  // Extract keywords (simple approach - words > 4 chars)
  const keywords = goal
    .split(/\s+/)
    .filter(word => word.length > 4)
    .slice(0, 5);

  return { domain, action, keywords };
}
