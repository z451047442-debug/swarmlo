import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GripVertical, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useI18n } from "@/i18n";

export interface TaskItem {
  id: number;
  /** i18n key，例如 "agents.taskboard.task1" */
  title: string;
  /** 分配给的 agent 的 i18n key，例如 "agents.agent.arch" */
  agent: string;
  status: "todo" | "in-progress" | "blocked" | "done";
  priority: "high" | "medium" | "low";
}

interface TaskBoardProps {
  swarmMode: string;
  tasks: TaskItem[];
}

const columns = [
  { id: "todo", title: "agents.taskboard.col.todo", icon: Clock },
  { id: "in-progress", title: "agents.inProgress", icon: AlertCircle },
  { id: "blocked", title: "agents.status.blocked", icon: AlertCircle },
  { id: "done", title: "agents.taskboard.col.done", icon: CheckCircle2 },
];

export const TaskBoard = ({ swarmMode, tasks }: TaskBoardProps) => {
  const { t } = useI18n();

  const priorityLabel = (priority: string): string => {
    if (priority === 'high') return t('agents.taskboard.priority.high');
    if (priority === 'medium') return t('agents.taskboard.priority.medium');
    return t('agents.taskboard.priority.low');
  };

  const modeLabel = (mode: string): string => {
    if (mode === 'distributed') return t('agents.taskboard.mode.distributed');
    if (mode === 'pipeline') return t('agents.taskboard.mode.pipeline');
    return t('agents.taskboard.mode.collaborative');
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>{t('agents.taskboard.title')}</CardTitle>
          <CardDescription>{t('agents.taskboard.description')}</CardDescription>
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <span>{t('agents.taskboard.mode')}</span>
            <Badge variant="outline">{modeLabel(swarmMode)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {columns.map((column) => {
              const Icon = column.icon;
              const columnTasks = tasks.filter(t => t.status === column.id);

              return (
                <div key={column.id} className="space-y-3">
                  <div className="flex items-center gap-2 font-semibold">
                    <Icon className="w-4 h-4" />
                    {t(column.title)}
                    <Badge variant="secondary" className="ml-auto">
                      {columnTasks.length}
                    </Badge>
                  </div>

                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-2">
                      {columnTasks.map((task) => (
                        <Card key={task.id} className="border cursor-move hover:border-primary/50 transition-all">
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <GripVertical className="w-4 h-4 text-muted-foreground mt-1" />
                              <div className="flex-1 space-y-2">
                                <p className="text-sm font-medium">{t(task.title)}</p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {t(task.agent)}
                                  </Badge>
                                  <Badge
                                    variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'default' : 'secondary'}
                                    className="text-xs"
                                  >
                                    {priorityLabel(task.priority)}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
