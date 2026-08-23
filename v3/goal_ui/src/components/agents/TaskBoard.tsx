import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GripVertical, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface TaskBoardProps {
  swarmMode: string;
}

const tasks = [
  { id: 1, title: "设计数据库结构", agent: "架构", status: "todo", priority: "high" },
  { id: 2, title: "实现用户认证", agent: "实现", status: "in-progress", priority: "high" },
  { id: 3, title: "编写认证单元测试", agent: "测试", status: "todo", priority: "medium" },
  { id: 4, title: "审查认证代码", agent: "代码审查", status: "blocked", priority: "high" },
  { id: 5, title: "编写 API 端点文档", agent: "文档", status: "todo", priority: "low" },
  { id: 6, title: "搭建 CI/CD 流水线", agent: "DevOps", status: "in-progress", priority: "medium" },
];

const columns = [
  { id: "todo", title: "待办", icon: Clock },
  { id: "in-progress", title: "进行中", icon: AlertCircle },
  { id: "blocked", title: "受阻", icon: AlertCircle },
  { id: "done", title: "已完成", icon: CheckCircle2 },
];

export const TaskBoard = ({ swarmMode }: TaskBoardProps) => {
  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>任务分配看板</CardTitle>
          <CardDescription>拖拽任务以分配 Agent</CardDescription>
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <span>模式：</span>
            <Badge variant="outline">{swarmMode === 'distributed' ? '分布式' : swarmMode === 'pipeline' ? '流水线' : '协作式'}</Badge>
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
                    {column.title}
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
                                <p className="text-sm font-medium">{task.title}</p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {task.agent}
                                  </Badge>
                                  <Badge 
                                    variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'default' : 'secondary'}
                                    className="text-xs"
                                  >
                                    {task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
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
