import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ArrowRight } from "lucide-react";

export const CommunicationLog = () => {
  const messages = [
    {
      id: 1,
      from: "架构",
      to: "实现",
      message: "数据库结构设计已完成，可开始实现。",
      timestamp: "2 分钟前",
      type: "info",
    },
    {
      id: 2,
      from: "实现",
      to: "测试",
      message: "认证模块已实现，请编写单元测试。",
      timestamp: "1 分钟前",
      type: "request",
    },
    {
      id: 3,
      from: "测试",
      to: "代码审查",
      message: "测试覆盖率已达 85%，可开始审查。",
      timestamp: "30 秒前",
      type: "success",
    },
    {
      id: 4,
      from: "代码审查",
      to: "实现",
      message: "在认证中间件中发现安全隐患，请修复。",
      timestamp: "10 秒前",
      type: "warning",
    },
  ];

  const typeColors = {
    info: "bg-blue-500/20 text-blue-500",
    request: "bg-purple-500/20 text-purple-500",
    success: "bg-green-500/20 text-green-500",
    warning: "bg-yellow-500/20 text-yellow-500",
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Agent 间通信
        </CardTitle>
        <CardDescription>Agent 之间的实时消息交换</CardDescription>
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
                    {msg.from}
                  </Badge>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <Badge variant="outline" className="text-xs">
                    {msg.to}
                  </Badge>
                  <Badge className={`ml-auto text-xs ${typeColors[msg.type as keyof typeof typeColors]}`}>
                    {msg.type === "info" ? "信息" : msg.type === "request" ? "请求" : msg.type === "success" ? "成功" : "警告"}
                  </Badge>
                </div>
                <p className="text-sm">{msg.message}</p>
                <p className="text-xs text-muted-foreground mt-2">{msg.timestamp}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
