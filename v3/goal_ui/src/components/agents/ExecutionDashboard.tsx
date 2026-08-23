import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Network,
  Clock,
  Coins,
  Play,
  SkipForward,
  RotateCw,
  CheckCircle2,
  Circle,
  Download,
  Search,
  Cpu,
  HardDrive,
  Zap,
  Activity
} from "lucide-react";

interface ExecutionDashboardProps {
  isRunning: boolean;
  currentPhase: number;
  onResume: () => void;
  onSkip: () => void;
  onRetry: () => void;
}

export const ExecutionDashboard = ({
  isRunning,
  currentPhase,
  onResume,
  onSkip,
  onRetry
}: ExecutionDashboardProps) => {
  const [executionView, setExecutionView] = useState<"graph" | "timeline">("graph");
  const [searchQuery, setSearchQuery] = useState("");

  const actions = [
    { id: '1', name: '目标评估', cost: 2, status: 'completed' },
    { id: '2', name: '架构规划', cost: 3, status: currentPhase >= 2 ? 'completed' : currentPhase === 1 ? 'active' : 'pending' },
    { id: '3', name: '实现', cost: 5, status: currentPhase >= 3 ? 'completed' : currentPhase === 2 ? 'active' : 'pending' },
    { id: '4', name: '测试与审查', cost: 4, status: currentPhase >= 4 ? 'completed' : currentPhase === 3 ? 'active' : 'pending' },
    { id: '5', name: '文档与部署', cost: 3, status: currentPhase >= 5 ? 'completed' : currentPhase === 4 ? 'active' : 'pending' }
  ];

  const agents = [
    { name: "架构", status: currentPhase === 1 ? "working" : "idle", tasksCompleted: 3 },
    { name: "实现", status: currentPhase === 2 ? "working" : "idle", tasksCompleted: 7 },
    { name: "测试", status: currentPhase === 3 ? "working" : "idle", tasksCompleted: 5 },
    { name: "代码审查", status: currentPhase === 3 ? "working" : "idle", tasksCompleted: 4 },
    { name: "文档", status: currentPhase === 4 ? "working" : "idle", tasksCompleted: 2 },
    { name: "DevOps", status: currentPhase === 4 ? "working" : "idle", tasksCompleted: 6 }
  ];

  const events = [
    { type: 'PLAN_GENERATED', time: '2:49:19 PM', data: { actions: 5 } },
    { type: 'AGENT_STARTED', time: '2:49:20 PM', data: { agent: 'Architecture' } },
    { type: 'STEP_COMPLETED', time: '2:49:22 PM', data: { step: 'Analysis' } }
  ];

  const currentAction = actions[Math.min(currentPhase, actions.length - 1)];
  const completedActions = actions.filter(a => a.status === 'completed').length;
  const totalCost = actions.reduce((sum, a) => sum + a.cost, 0);

  return (
    <Card className="border-2 border-primary/30 shadow-lg">
      <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-blue-500/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5 text-primary" />
              执行仪表盘
            </CardTitle>
            <CardDescription className="mt-1">
              实时监控与控制
            </CardDescription>
          </div>
          {isRunning && (
            <Badge className="animate-pulse bg-primary">
              <span className="inline-block w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
              执行中
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="execution" className="w-full">
          <TabsList className="w-full grid grid-cols-4 rounded-none border-b">
            <TabsTrigger value="execution">执行计划</TabsTrigger>
            <TabsTrigger value="current">当前步骤</TabsTrigger>
            <TabsTrigger value="agents">Agent 活动</TabsTrigger>
            <TabsTrigger value="events">事件日志</TabsTrigger>
          </TabsList>

          {/* Execution Plan Tab */}
          <TabsContent value="execution" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Network className="w-4 h-4 text-primary" />
                  <span className="font-semibold">{actions.length} 个操作</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Coins className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold">成本：{totalCost}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold">预计 8 分钟</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={executionView === "graph" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExecutionView("graph")}
                >
                  图视图
                </Button>
                <Button
                  variant={executionView === "timeline" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExecutionView("timeline")}
                >
                  时间线视图
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {actions.map((action, idx) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {action.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : action.status === 'active' ? (
                        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="font-medium">{action.name}</span>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        成本：{action.cost}
                      </Badge>
                      {action.status === 'active' && (
                        <Badge className="text-xs animate-pulse">进行中</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="space-y-2 pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">总体进度</span>
                <span className="font-semibold">{completedActions} / {actions.length} 个步骤</span>
              </div>
              <Progress value={(completedActions / actions.length) * 100} className="h-2" />
            </div>
          </TabsContent>

          {/* Current Step Tab */}
          <TabsContent value="current" className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{currentAction?.name}</h3>
                <p className="text-sm text-muted-foreground">
                  正在完成文档并部署到生产环境
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium">成本：{currentAction?.cost}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={onResume} disabled={isRunning}>
                  <Play className="w-4 h-4 mr-1" />
                  继续
                </Button>
                <Button size="sm" variant="outline" onClick={onSkip}>
                  <SkipForward className="w-4 h-4 mr-1" />
                  跳过
                </Button>
                <Button size="sm" variant="outline" onClick={onRetry}>
                  <RotateCw className="w-4 h-4 mr-1" />
                  重试
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">分配的 Agent</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">文档</span>
                    <Badge variant="secondary" className="text-xs">专家</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">状态</span>
                    <Badge variant="outline" className="text-xs">
                      {isRunning ? "工作中" : "空闲"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">进度</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Progress value={isRunning ? 65 : 0} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {isRunning ? "65%" : "0%"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">前置条件</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>initialized: true</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>requirements_clear: true</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">效果</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>architecture_defined: true</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>api_designed: true</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">执行日志</h4>
              <ScrollArea className="h-[120px] rounded border bg-muted/50 p-3">
                <div className="space-y-1 font-mono text-xs">
                  <div>[2:49:25 PM] 开始架构规划...</div>
                  <div>[2:49:25 PM] 正在分析需求...</div>
                  <div>[2:49:25 PM] 正在生成系统设计...</div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Agent Activity Tab */}
          <TabsContent value="agents" className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {agents.map((agent) => (
                <Card key={agent.name} className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{agent.name}</CardTitle>
                      <Badge
                        variant={agent.status === "working" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {agent.status === "working" ? "工作中" : agent.status === "blocked" ? "受阻" : "空闲"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Agent 类型</span>
                      <span className="font-medium">专家</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">状态</span>
                      <span className="font-medium">{agent.status === "working" ? "工作中" : agent.status === "blocked" ? "受阻" : "空闲"}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">已完成任务</span>
                      <span className="font-medium">{agent.tasksCompleted}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">资源使用</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-blue-500" />
                      <span>CPU 使用率</span>
                    </div>
                    <span className="font-semibold">65%</span>
                  </div>
                  <Progress value={65} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-green-500" />
                      <span>内存使用</span>
                    </div>
                    <span className="font-semibold">420 MB</span>
                  </div>
                  <Progress value={42} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span>Token 消耗</span>
                    </div>
                    <span className="font-semibold">15,000</span>
                  </div>
                  <Progress value={30} className="h-2" />
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t">
                  <span className="text-muted-foreground">运行时间</span>
                  <span className="font-semibold">1h 0m</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Event Log Tab */}
          <TabsContent value="events" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{events.length}</Badge>
                <span className="text-sm font-medium">事件</span>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索事件..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-64"
                  />
                </div>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-1" />
                  导出
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {events.map((event, idx) => (
                  <Card key={idx} className="border">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-mono">{event.type}</CardTitle>
                        <span className="text-xs text-muted-foreground">{event.time}</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
