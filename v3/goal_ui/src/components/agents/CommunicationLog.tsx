import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n";

export const CommunicationLog = () => {
  const { t } = useI18n();

  const messages = [
    {
      id: 1,
      from: "agents.agent.arch",
      to: "agents.agent.impl",
      message: "agents.comm.msg1",
      timestamp: "agents.comm.ts1",
      type: "info",
    },
    {
      id: 2,
      from: "agents.agent.impl",
      to: "agents.agent.test",
      message: "agents.comm.msg2",
      timestamp: "agents.comm.ts2",
      type: "request",
    },
    {
      id: 3,
      from: "agents.agent.test",
      to: "agents.agent.review",
      message: "agents.comm.msg3",
      timestamp: "agents.comm.ts3",
      type: "success",
    },
    {
      id: 4,
      from: "agents.agent.review",
      to: "agents.agent.impl",
      message: "agents.comm.msg4",
      timestamp: "agents.comm.ts4",
      type: "warning",
    },
  ];

  const typeColors = {
    info: "bg-blue-500/20 text-blue-500",
    request: "bg-purple-500/20 text-purple-500",
    success: "bg-green-500/20 text-green-500",
    warning: "bg-yellow-500/20 text-yellow-500",
  };

  const typeLabel = (type: string): string => {
    if (type === "info") return t('agents.comm.type.info');
    if (type === "request") return t('agents.comm.type.request');
    if (type === "success") return t('agents.comm.type.success');
    return t('agents.comm.type.warning');
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          {t('agents.comm.title')}
        </CardTitle>
        <CardDescription>{t('agents.comm.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">
                    {t(msg.from)}
                  </Badge>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <Badge variant="outline" className="text-xs">
                    {t(msg.to)}
                  </Badge>
                  <Badge className={`ml-auto text-xs ${typeColors[msg.type as keyof typeof typeColors]}`}>
                    {typeLabel(msg.type)}
                  </Badge>
                </div>
                <p className="text-sm">{t(msg.message)}</p>
                <p className="text-xs text-muted-foreground mt-2">{t(msg.timestamp)}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
