import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Edit3, Target, GitBranch, Code, TestTube, FileText } from "lucide-react";
import { useState } from "react";

interface ResearchReviewCardProps {
  onApprove: () => void;
  onRevise: (feedback: string) => void;
  goal: string;
}

export const ResearchReviewCard = ({ onApprove, onRevise, goal }: ResearchReviewCardProps) => {
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const handleRevise = () => {
    if (showFeedback) {
      onRevise(feedback);
      setFeedback("");
      setShowFeedback(false);
    } else {
      setShowFeedback(true);
    }
  };

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-background to-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <CheckCircle2 className="w-6 h-6 text-primary" />
              研究完成 - 可开始审核
            </CardTitle>
            <CardDescription className="text-base">
              在启动开发之前，请先审核研究结果与执行计划
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Goal Summary */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Target className="w-4 h-4" />
            项目目标
          </div>
          <p className="text-foreground pl-6">{goal}</p>
        </div>

        {/* Research Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <span className="font-medium">目标评估</span>
            </div>
            <Badge variant="secondary" className="w-fit">已完成</Badge>
            <p className="text-sm text-muted-foreground">需求已分析，Agent 已识别</p>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-purple-500" />
              <span className="font-medium">架构</span>
            </div>
            <Badge variant="secondary" className="w-fit">已完成</Badge>
            <p className="text-sm text-muted-foreground">系统设计与 API 契约已规划</p>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-blue-500" />
              <span className="font-medium">实现</span>
            </div>
            <Badge variant="secondary" className="w-fit">就绪</Badge>
            <p className="text-sm text-muted-foreground">已规划 42 个文件、1,247 行代码</p>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <TestTube className="w-5 h-5 text-green-500" />
              <span className="font-medium">测试</span>
            </div>
            <Badge variant="secondary" className="w-fit">就绪</Badge>
            <p className="text-sm text-muted-foreground">目标 124 项测试、87% 覆盖率</p>
          </div>
        </div>

        {/* Execution Plan Summary */}
        <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-muted">
          <h4 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            执行计划摘要
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">总阶段数：</span>
              <p className="font-medium">5 个阶段</p>
            </div>
            <div>
              <span className="text-muted-foreground">预计耗时：</span>
              <p className="font-medium">约 40 秒</p>
            </div>
            <div>
              <span className="text-muted-foreground">所需 Agent 数：</span>
              <p className="font-medium">6 个 Agent</p>
            </div>
            <div>
              <span className="text-muted-foreground">复杂度：</span>
              <p className="font-medium">中等</p>
            </div>
          </div>
        </div>

        {/* Revision Feedback */}
        {showFeedback && (
          <div className="space-y-2 animate-fade-in">
            <label className="text-sm font-medium">修订反馈（可选）</label>
            <Textarea
              placeholder="请描述研究或计划中需要修改的内容..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={onApprove}
            size="lg"
            className="flex-1 gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          >
            <CheckCircle2 className="w-5 h-5" />
            批准并启动开发
          </Button>
          <Button
            onClick={handleRevise}
            variant="outline"
            size="lg"
            className="gap-2"
          >
            <Edit3 className="w-5 h-5" />
            {showFeedback ? "提交修订请求" : "请求修订"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
