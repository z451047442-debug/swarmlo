import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n";

export const DependencyGraph = () => {
  const { t } = useI18n();

  const dependencies = [
    { from: "agents.agent.arch", to: "agents.agent.impl", status: "complete" },
    { from: "agents.agent.impl", to: "agents.agent.test", status: "active" },
    { from: "agents.agent.test", to: "agents.agent.review", status: "pending" },
    { from: "agents.agent.review", to: "agents.agent.docs", status: "pending" },
    { from: "agents.agent.docs", to: "agents.agent.devops", status: "pending" },
  ];

  return (
    <Card className="border-2 border-purple-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-purple-500" />
          {t('agents.tasksDependencies')}
        </CardTitle>
        <CardDescription>{t('agents.dep.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {dependencies.map((dep, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card/50"
            >
              <div className="flex-1 text-sm font-medium">{t(dep.from)}</div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1 text-sm font-medium">{t(dep.to)}</div>
              <div
                className={`w-2 h-2 rounded-full ${
                  dep.status === "complete"
                    ? "bg-green-500"
                    : dep.status === "active"
                    ? "bg-blue-500 animate-pulse"
                    : "bg-muted"
                }`}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
