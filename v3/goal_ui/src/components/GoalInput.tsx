import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Target, Sparkles, Settings, TrendingUp, Building2, Heart, GraduationCap, Code, Cpu, Brain, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GoalInputProps {
  onSubmit: (goal: string) => void;
  isPlanning: boolean;
  onAdvancedSettings?: () => void;
  onConfigUpdate?: (config: any) => void;
}

export const GoalInput = ({ onSubmit, isPlanning, onAdvancedSettings, onConfigUpdate }: GoalInputProps) => {
  const [goal, setGoal] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goal.trim()) {
      onSubmit(goal.trim());
    }
  };

  const categoryToPresetMap: Record<string, string> = {
    'finance': 'market-trends',
    'business': 'startup-validation',
    'marketing': 'competitive-analysis',
    'medical': 'medical-clinical',
    'education': 'academic-deep',
    'coding': 'technical-feasibility',
    'technical': 'technical-feasibility',
    'ai-ml': 'technical-feasibility',
  };

  const categories = [
    { id: 'finance', label: '金融', icon: TrendingUp, color: '#10b981' },
    { id: 'business', label: '商业', icon: Building2, color: '#3b82f6' },
    { id: 'marketing', label: '营销', icon: Megaphone, color: '#f97316' },
    { id: 'medical', label: '医疗', icon: Heart, color: '#ef4444' },
    { id: 'education', label: '教育', icon: GraduationCap, color: '#f59e0b' },
    { id: 'coding', label: '编程', icon: Code, color: '#8b5cf6' },
    { id: 'technical', label: '技术', icon: Cpu, color: '#06b6d4' },
    { id: 'ai-ml', label: 'AI 与机器学习', icon: Brain, color: '#ec4899' },
  ];

  const generateGoals = async (category: string) => {
    setIsGenerating(true);
    try {
      // Generate goal and optimize config in parallel
      const [goalResult, configResult] = await Promise.all([
        supabase.functions.invoke('generate-research-goal', {
          body: { category }
        }),
        supabase.functions.invoke('optimize-research-config', {
          body: { 
            preset: categoryToPresetMap[category] || 'academic-deep',
            currentGoal: '' 
          }
        })
      ]);

      if (goalResult.error) throw goalResult.error;

      if (goalResult.data?.goals && goalResult.data.goals.length > 0) {
        // Set the first generated goal
        setGoal(goalResult.data.goals[0]);
        
        // Update config if available and callback provided
        if (configResult.data?.config && onConfigUpdate) {
          onConfigUpdate(configResult.data.config);
        }
        
        toast({
          title: "目标与设置已优化",
          description: `已为 ${category} 生成研究目标并优化设置`,
        });
      }
    } catch (error) {
      console.error('Error generating goals:', error);
      toast({
        title: "生成失败",
        description: "无法生成研究目标，请重试。",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground">定义研究目标</h2>
        </div>
        {onAdvancedSettings && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAdvancedSettings}
            disabled={isPlanning}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">高级设置</span>
          </Button>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="输入你的研究目标或主题..."
            className="min-h-[80px] sm:min-h-[100px] resize-none bg-background border-border text-foreground text-sm"
            disabled={isPlanning}
          />
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2">
            GOAP 系统将分析你的目标并规划最优研究流程
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3 h-3 text-primary" />
            <span className="text-xs font-medium text-foreground">按分类 AI 生成：</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => generateGoals(cat.id)}
                disabled={isPlanning || isGenerating}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all text-xs",
                  "border border-border hover:border-primary/50",
                  "bg-card hover:bg-muted",
                  (isPlanning || isGenerating) && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  borderColor: isGenerating ? cat.color : undefined,
                }}
              >
                <cat.icon className="w-3 h-3" style={{ color: cat.color }} />
                <span className="text-foreground">{cat.label}</span>
              </button>
            ))}
          </div>
          {isGenerating && (
            <p className="text-xs text-primary flex items-center gap-1.5 mt-2">
              <Sparkles className="w-3 h-3 animate-spin" />
              正在生成研究目标...
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={!goal.trim() || isPlanning}
          className="w-full text-sm"
        >
          {isPlanning ? (
            <>
              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
              <span className="text-xs sm:text-sm">正在规划研究流程...</span>
            </>
          ) : (
            <>
              <Target className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
              <span className="text-xs sm:text-sm">生成研究计划</span>
            </>
          )}
        </Button>
      </form>
    </div>
  );
};
