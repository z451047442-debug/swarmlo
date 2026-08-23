import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n";

interface Agent {
  id: string;
  name: string;
  icon: LucideIcon;
  status: "idle" | "working" | "blocked";
  currentTask?: string;
}

interface AgentStatusCardProps {
  agent: Agent;
}

const statusConfig = {
  idle: { color: "bg-muted text-muted-foreground", label: "agents.status.idle", pulse: false },
  working: { color: "bg-green-500/20 text-green-500 border-green-500/50", label: "agents.status.working", pulse: true },
  blocked: { color: "bg-red-500/20 text-red-500 border-red-500/50", label: "agents.status.blocked", pulse: false },
};

export const AgentStatusCard = ({ agent }: AgentStatusCardProps) => {
  const { t } = useI18n();
  const Icon = agent.icon;
  const config = statusConfig[agent.status];

  return (
    <Card className="border-2 hover:border-primary/50 transition-all">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            {agent.name}
          </div>
          <Badge
            variant="outline"
            className={`${config.color} ${config.pulse ? 'animate-pulse' : ''}`}
          >
            {t(config.label)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {agent.currentTask ? (
          <p className="text-xs text-muted-foreground">{agent.currentTask}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">{t("agents.statusCard.waiting")}</p>
        )}
      </CardContent>
    </Card>
  );
};
