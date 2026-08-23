import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Palette, Type, Copy, Check, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetConfig {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cardBackgroundColor: string;
  cardBorderColor: string;
  textColor: string;
  secondaryTextColor: string;
  successColor: string;
  title: string;
  description: string;
  brandName: string;
  defaultGoal: string;
  fontFamily: string;
  borderRadius: string;
  animationSpeed: string;
  cardSpacing: string;
  showMetrics: boolean;
  showStats: boolean;
  compactMode: boolean;
  enableAI: boolean;
  aiModel: string;
}

interface WidgetCustomizerProps {
  config: WidgetConfig;
  onConfigChange: (config: WidgetConfig) => void;
  onGenerate: () => void;
}

export const WidgetCustomizer = ({ config, onConfigChange, onGenerate }: WidgetCustomizerProps) => {
  const [copied, setCopied] = useState(false);
  const [showEmbedCode, setShowEmbedCode] = useState(false);

  const updateConfig = (key: keyof WidgetConfig, value: string | boolean) => {
    onConfigChange({ ...config, [key]: value });
  };

  const generateEmbedCode = () => {
    const embedCode = `<!-- Swarmlo Research Widget -->
<div id="swarmlo-research-widget-container"></div>
<script>
  window.SwarmloResearchWidgetConfig = ${JSON.stringify(config, null, 2)};
</script>
<script src="${window.location.origin}/widget.js"></script>
<style>
  #swarmlo-research-widget-container {
    max-width: 100%;
    margin: 2rem auto;
  }
</style>`;
    return embedCode;
  };

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(generateEmbedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ColorInput = ({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) => (
    <div>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="flex gap-2 mt-1">
        <Input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-16 h-10 p-1 cursor-pointer"
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-xs"
        />
      </div>
    </div>
  );

  return (
      <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-xs sm:text-sm text-muted-foreground">
          定制可嵌入研究 Widget 的外观与内容
        </p>
        <Button
          onClick={() => {
            setShowEmbedCode(!showEmbedCode);
            if (!showEmbedCode) {
              onGenerate();
            }
          }}
          size="sm"
          variant={showEmbedCode ? "outline" : "default"}
          className="w-full sm:w-auto text-xs sm:text-sm whitespace-nowrap"
        >
          {showEmbedCode ? "隐藏代码" : "生成嵌入代码"}
        </Button>
      </div>

      <Tabs defaultValue="colors" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1">
          <TabsTrigger value="colors" className="text-xs sm:text-sm">颜色</TabsTrigger>
          <TabsTrigger value="content" className="text-xs sm:text-sm">内容</TabsTrigger>
          <TabsTrigger value="layout" className="text-xs sm:text-sm">布局</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs sm:text-sm">AI 设置</TabsTrigger>
        </TabsList>

        <TabsContent value="colors" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">主颜色</h3>
              <ColorInput
                id="primaryColor"
                label="主颜色"
                value={config.primaryColor}
                onChange={(value) => updateConfig("primaryColor", value)}
              />
              <ColorInput
                id="accentColor"
                label="强调色"
                value={config.accentColor}
                onChange={(value) => updateConfig("accentColor", value)}
              />
              <ColorInput
                id="successColor"
                label="成功色"
                value={config.successColor}
                onChange={(value) => updateConfig("successColor", value)}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">背景与卡片颜色</h3>
              <ColorInput
                id="backgroundColor"
                label="背景颜色"
                value={config.backgroundColor}
                onChange={(value) => updateConfig("backgroundColor", value)}
              />
              <ColorInput
                id="cardBackgroundColor"
                label="卡片背景"
                value={config.cardBackgroundColor}
                onChange={(value) => updateConfig("cardBackgroundColor", value)}
              />
              <ColorInput
                id="cardBorderColor"
                label="卡片边框"
                value={config.cardBorderColor}
                onChange={(value) => updateConfig("cardBorderColor", value)}
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">文字颜色</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ColorInput
                  id="textColor"
                  label="主要文字"
                  value={config.textColor}
                  onChange={(value) => updateConfig("textColor", value)}
                />
                <ColorInput
                  id="secondaryTextColor"
                  label="次要文字"
                  value={config.secondaryTextColor}
                  onChange={(value) => updateConfig("secondaryTextColor", value)}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="title" className="text-xs text-muted-foreground">
                Widget 标题
              </Label>
              <Input
                id="title"
                value={config.title}
                onChange={(e) => updateConfig("title", e.target.value)}
                className="mt-1"
                placeholder="目标导向行动规划"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-xs text-muted-foreground">
                描述
              </Label>
              <Textarea
                id="description"
                value={config.description}
                onChange={(e) => updateConfig("description", e.target.value)}
                className="mt-1 min-h-[80px]"
                placeholder="基于 AI 的研究规划..."
              />
            </div>

            <div>
              <Label htmlFor="brandName" className="text-xs text-muted-foreground">
                品牌名称（可选）
              </Label>
              <Input
                id="brandName"
                value={config.brandName}
                onChange={(e) => updateConfig("brandName", e.target.value)}
                className="mt-1"
                placeholder="你的公司"
              />
            </div>

            <div>
              <Label htmlFor="defaultGoal" className="text-xs text-muted-foreground">
                默认研究目标
              </Label>
              <Input
                id="defaultGoal"
                value={config.defaultGoal}
                onChange={(e) => updateConfig("defaultGoal", e.target.value)}
                className="mt-1"
                placeholder="研究最新 AI 进展"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="layout" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">字体与间距</h3>
              <div>
                <Label htmlFor="fontFamily" className="text-xs text-muted-foreground">
                  字体
                </Label>
                <Select value={config.fontFamily} onValueChange={(value) => updateConfig("fontFamily", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system-ui">System UI</SelectItem>
                    <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                    <SelectItem value="Roboto, sans-serif">Roboto</SelectItem>
                    <SelectItem value="'Open Sans', sans-serif">Open Sans</SelectItem>
                    <SelectItem value="'Poppins', sans-serif">Poppins</SelectItem>
                    <SelectItem value="monospace">等宽字体</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="borderRadius" className="text-xs text-muted-foreground">
                  圆角
                </Label>
                <Select value={config.borderRadius} onValueChange={(value) => updateConfig("borderRadius", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">无（0px）</SelectItem>
                    <SelectItem value="0.25rem">小（4px）</SelectItem>
                    <SelectItem value="0.5rem">中（8px）</SelectItem>
                    <SelectItem value="0.75rem">大（12px）</SelectItem>
                    <SelectItem value="1rem">特大（16px）</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="cardSpacing" className="text-xs text-muted-foreground">
                  卡片间距
                </Label>
                <Select value={config.cardSpacing} onValueChange={(value) => updateConfig("cardSpacing", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5rem">紧凑</SelectItem>
                    <SelectItem value="1rem">标准</SelectItem>
                    <SelectItem value="1.5rem">宽松</SelectItem>
                    <SelectItem value="2rem">松散</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="animationSpeed" className="text-xs text-muted-foreground">
                  动画速度
                </Label>
                <Select value={config.animationSpeed} onValueChange={(value) => updateConfig("animationSpeed", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">快速</SelectItem>
                    <SelectItem value="normal">标准</SelectItem>
                    <SelectItem value="slow">缓慢</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">显示选项</h3>
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="showMetrics" className="text-xs text-muted-foreground">
                    显示指标
                  </Label>
                  <Switch
                    id="showMetrics"
                    checked={config.showMetrics}
                    onCheckedChange={(checked) => updateConfig("showMetrics", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="showStats" className="text-xs text-muted-foreground">
                    显示统计
                  </Label>
                  <Switch
                    id="showStats"
                    checked={config.showStats}
                    onCheckedChange={(checked) => updateConfig("showStats", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="compactMode" className="text-xs text-muted-foreground">
                    紧凑模式
                  </Label>
                  <Switch
                    id="compactMode"
                    checked={config.compactMode}
                    onCheckedChange={(checked) => updateConfig("compactMode", checked)}
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">AI 研究设置</h3>
              <p className="text-xs text-muted-foreground">
                使用 Google Gemini 模型配置 AI 研究数据生成
              </p>
              
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <Label htmlFor="enableAI" className="text-xs text-muted-foreground">
                    启用 AI 研究
                  </Label>
                  <p className="text-[10px] text-muted-foreground/70">
                    使用 AI 生成真实研究数据而非模拟数据
                  </p>
                </div>
                <Switch
                  id="enableAI"
                  checked={config.enableAI}
                  onCheckedChange={(checked) => updateConfig("enableAI", checked)}
                />
              </div>

              {config.enableAI && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="aiModel" className="text-xs text-muted-foreground">
                    AI 模型
                  </Label>
                  <Select value={config.aiModel} onValueChange={(value) => updateConfig("aiModel", value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google/gemini-2.5-flash">
                        Gemini 2.5 Flash（均衡）
                      </SelectItem>
                      <SelectItem value="google/gemini-2.5-pro">
                        Gemini 2.5 Pro（最强）
                      </SelectItem>
                      <SelectItem value="google/gemini-2.5-flash-lite">
                        Gemini 2.5 Flash Lite（最快）
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground/70">
                    {config.aiModel === "google/gemini-2.5-pro" && "最适合复杂推理与高精度任务"}
                    {config.aiModel === "google/gemini-2.5-flash" && "性能与速度均衡"}
                    {config.aiModel === "google/gemini-2.5-flash-lite" && "针对速度与成本优化"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Embed Code Section */}
      {showEmbedCode && (
        <div className="space-y-3 animate-fade-in border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">嵌入代码</Label>
            <Button
              onClick={copyEmbedCode}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  已复制！
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  复制代码
                </>
              )}
            </Button>
          </div>
          <div className="relative">
            <pre className="bg-muted/50 border border-border rounded p-4 text-xs overflow-x-auto">
              <code className="text-foreground">{generateEmbedCode()}</code>
            </pre>
          </div>
          <p className="text-xs text-muted-foreground">
            复制此代码并粘贴到你希望 Widget 显示的网站位置。
          </p>
        </div>
      )}
    </div>
  );
};
