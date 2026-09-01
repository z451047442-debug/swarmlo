import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n";
import type { SwarmTopology } from "@/lib/agenticSettings";

interface DependencyEdge {
  from: string;
  to: string;
}

export interface DependencyGraphAgent {
  id: string;
  status: "idle" | "working" | "blocked";
}

interface DependencyGraphProps {
  /** swarm 拓扑（AdvancedSettingsModal 持久化）：决定依赖连线的形态 */
  topology?: SwarmTopology;
  /** 可选：传入 agent 实时状态后，连线圆点反映 working/blocked；缺省用静态状态 */
  agents?: DependencyGraphAgent[];
}

/**
 * 各拓扑的连线形态（AGENT_IDS: arch/impl/test/review/docs/devops）：
 * - hierarchical：arch 作为协调者分发到各角色，串成树
 * - mesh：全连接（两两连线）
 * - ring：环形链（首尾相接）
 * - star：全部汇聚到 arch
 */
const EDGES_BY_TOPOLOGY: Record<SwarmTopology, DependencyEdge[]> = {
  hierarchical: [
    { from: "arch", to: "impl" },
    { from: "arch", to: "test" },
    { from: "arch", to: "review" },
    { from: "impl", to: "test" },
    { from: "review", to: "docs" },
    { from: "docs", to: "devops" },
  ],
  mesh: [
    { from: "arch", to: "impl" },
    { from: "arch", to: "test" },
    { from: "arch", to: "review" },
    { from: "arch", to: "docs" },
    { from: "arch", to: "devops" },
    { from: "impl", to: "test" },
    { from: "impl", to: "review" },
    { from: "impl", to: "docs" },
    { from: "impl", to: "devops" },
    { from: "test", to: "review" },
    { from: "test", to: "docs" },
    { from: "test", to: "devops" },
    { from: "review", to: "docs" },
    { from: "review", to: "devops" },
    { from: "docs", to: "devops" },
  ],
  ring: [
    { from: "arch", to: "impl" },
    { from: "impl", to: "test" },
    { from: "test", to: "review" },
    { from: "review", to: "docs" },
    { from: "docs", to: "devops" },
    { from: "devops", to: "arch" },
  ],
  star: [
    { from: "arch", to: "impl" },
    { from: "arch", to: "test" },
    { from: "arch", to: "review" },
    { from: "arch", to: "docs" },
    { from: "arch", to: "devops" },
  ],
};

const AGENT_LABELS: Record<string, string> = {
  arch: "agents.agent.arch",
  impl: "agents.agent.impl",
  test: "agents.agent.test",
  review: "agents.agent.review",
  docs: "agents.agent.docs",
  devops: "agents.agent.devops",
};

export const DependencyGraph = ({ topology = "hierarchical", agents }: DependencyGraphProps) => {
  const { t } = useI18n();

  const edges = EDGES_BY_TOPOLOGY[topology] ?? EDGES_BY_TOPOLOGY.hierarchical;

  const dotClass = (edge: DependencyEdge): string => {
    if (agents) {
      const from = agents.find((a) => a.id === edge.from);
      const to = agents.find((a) => a.id === edge.to);
      if (from?.status === "working" && to?.status === "working") return "bg-blue-500 animate-pulse";
      if (from?.status === "blocked" || to?.status === "blocked") return "bg-red-500";
    }
    if (edge.from === "arch" && edge.to === "impl") return "bg-green-500";
    return "bg-muted";
  };

  return (
    <Card className="border-2 border-purple-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-purple-500" />
          {t('agents.tasksDependencies')}
        </CardTitle>
        <CardDescription>
          {t(`agents.settings.swarm.topology.${topology}`)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {edges.map((edge, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card/50"
            >
              <div className="flex-1 text-sm font-medium">{t(AGENT_LABELS[edge.from] ?? edge.from)}</div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1 text-sm font-medium">{t(AGENT_LABELS[edge.to] ?? edge.to)}</div>
              <div className={`w-2 h-2 rounded-full ${dotClass(edge)}`} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
