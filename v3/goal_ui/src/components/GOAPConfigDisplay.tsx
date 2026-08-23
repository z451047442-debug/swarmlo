import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Zap, Shield, RefreshCw } from "lucide-react";

interface GOAPConfigDisplayProps {
  executionMode: "focused" | "closed" | "open";
  enableReplanning: boolean;
  replanningTriggers: string[];
  costOptimization: boolean;
  parallelExecution: boolean;
  maxActionCost: number;
  primaryColor: string;
}

export const GOAPConfigDisplay = ({
  executionMode,
  enableReplanning,
  replanningTriggers,
  costOptimization,
  parallelExecution,
  maxActionCost,
  primaryColor,
}: GOAPConfigDisplayProps) => {
  const modeDescriptions = {
    focused: "直接执行动作并检查前置条件",
    closed: "单领域规划，具备类型安全",
    open: "跨领域创造性问题求解",
  };

  return (
    <Card className="border" style={{ borderColor: `${primaryColor}40` }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="w-4 h-4" style={{ color: primaryColor }} />
          GOAP 配置
        </CardTitle>
        <CardDescription className="text-xs">
          当前规划与执行设置
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">执行模式</span>
            <Badge variant="outline" className="text-xs capitalize">
              {executionMode}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{modeDescriptions[executionMode]}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            {costOptimization ? (
              <Zap className="w-3 h-3 text-yellow-500" />
            ) : (
              <Zap className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-xs">成本优化</span>
          </div>
          <div className="flex items-center gap-2">
            {parallelExecution ? (
              <RefreshCw className="w-3 h-3 text-blue-500" />
            ) : (
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-xs">并行执行</span>
          </div>
          <div className="flex items-center gap-2">
            {enableReplanning ? (
              <Shield className="w-3 h-3 text-green-500" />
            ) : (
              <Shield className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-xs">已启用重新规划</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono">最大成本：{maxActionCost}</span>
          </div>
        </div>

        {enableReplanning && replanningTriggers.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <span className="text-xs font-medium">活动触发器（{replanningTriggers.length}）</span>
            <div className="flex flex-wrap gap-1">
              {replanningTriggers.map((trigger) => (
                <Badge key={trigger} variant="secondary" className="text-xs">
                  {trigger}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};