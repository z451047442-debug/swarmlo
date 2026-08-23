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
import { useI18n } from "@/i18n";

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
  const { t } = useI18n();
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
          {t("main.customizerIntro")}
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
          {showEmbedCode ? t("main.hideCode") : t("main.generateEmbedCode")}
        </Button>
      </div>

      <Tabs defaultValue="colors" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1">
          <TabsTrigger value="colors" className="text-xs sm:text-sm">{t("main.tabColors")}</TabsTrigger>
          <TabsTrigger value="content" className="text-xs sm:text-sm">{t("main.tabContent")}</TabsTrigger>
          <TabsTrigger value="layout" className="text-xs sm:text-sm">{t("main.tabLayout")}</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs sm:text-sm">{t("main.tabAiSettings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="colors" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">{t("main.colorsPrimaryTitle")}</h3>
              <ColorInput
                id="primaryColor"
                label={t("main.colorPrimary")}
                value={config.primaryColor}
                onChange={(value) => updateConfig("primaryColor", value)}
              />
              <ColorInput
                id="accentColor"
                label={t("main.colorAccent")}
                value={config.accentColor}
                onChange={(value) => updateConfig("accentColor", value)}
              />
              <ColorInput
                id="successColor"
                label={t("main.colorSuccess")}
                value={config.successColor}
                onChange={(value) => updateConfig("successColor", value)}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">{t("main.colorsBackgroundTitle")}</h3>
              <ColorInput
                id="backgroundColor"
                label={t("main.colorBackground")}
                value={config.backgroundColor}
                onChange={(value) => updateConfig("backgroundColor", value)}
              />
              <ColorInput
                id="cardBackgroundColor"
                label={t("main.colorCardBackground")}
                value={config.cardBackgroundColor}
                onChange={(value) => updateConfig("cardBackgroundColor", value)}
              />
              <ColorInput
                id="cardBorderColor"
                label={t("main.colorCardBorder")}
                value={config.cardBorderColor}
                onChange={(value) => updateConfig("cardBorderColor", value)}
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">{t("main.colorsTextTitle")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ColorInput
                  id="textColor"
                  label={t("main.colorPrimaryText")}
                  value={config.textColor}
                  onChange={(value) => updateConfig("textColor", value)}
                />
                <ColorInput
                  id="secondaryTextColor"
                  label={t("main.colorSecondaryText")}
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
                {t("main.contentWidgetTitle")}
              </Label>
              <Input
                id="title"
                value={config.title}
                onChange={(e) => updateConfig("title", e.target.value)}
                className="mt-1"
                placeholder={t("main.contentWidgetTitlePlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-xs text-muted-foreground">
                {t("main.contentDescription")}
              </Label>
              <Textarea
                id="description"
                value={config.description}
                onChange={(e) => updateConfig("description", e.target.value)}
                className="mt-1 min-h-[80px]"
                placeholder={t("main.contentDescriptionPlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="brandName" className="text-xs text-muted-foreground">
                {t("main.contentBrandName")}
              </Label>
              <Input
                id="brandName"
                value={config.brandName}
                onChange={(e) => updateConfig("brandName", e.target.value)}
                className="mt-1"
                placeholder={t("main.contentBrandNamePlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="defaultGoal" className="text-xs text-muted-foreground">
                {t("main.contentDefaultGoal")}
              </Label>
              <Input
                id="defaultGoal"
                value={config.defaultGoal}
                onChange={(e) => updateConfig("defaultGoal", e.target.value)}
                className="mt-1"
                placeholder={t("main.contentDefaultGoalPlaceholder")}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="layout" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">{t("main.layoutTypography")}</h3>
              <div>
                <Label htmlFor="fontFamily" className="text-xs text-muted-foreground">
                  {t("main.layoutFontFamily")}
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
                    <SelectItem value="monospace">{t("main.fontMonospace")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="borderRadius" className="text-xs text-muted-foreground">
                  {t("main.layoutBorderRadius")}
                </Label>
                <Select value={config.borderRadius} onValueChange={(value) => updateConfig("borderRadius", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("main.radiusNone")}</SelectItem>
                    <SelectItem value="0.25rem">{t("main.radiusSmall")}</SelectItem>
                    <SelectItem value="0.5rem">{t("main.radiusMedium")}</SelectItem>
                    <SelectItem value="0.75rem">{t("main.radiusLarge")}</SelectItem>
                    <SelectItem value="1rem">{t("main.radiusXl")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="cardSpacing" className="text-xs text-muted-foreground">
                  {t("main.layoutCardSpacing")}
                </Label>
                <Select value={config.cardSpacing} onValueChange={(value) => updateConfig("cardSpacing", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5rem">{t("main.spacingTight")}</SelectItem>
                    <SelectItem value="1rem">{t("main.spacingNormal")}</SelectItem>
                    <SelectItem value="1.5rem">{t("main.spacingRelaxed")}</SelectItem>
                    <SelectItem value="2rem">{t("main.spacingLoose")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="animationSpeed" className="text-xs text-muted-foreground">
                  {t("main.layoutAnimationSpeed")}
                </Label>
                <Select value={config.animationSpeed} onValueChange={(value) => updateConfig("animationSpeed", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">{t("main.animFast")}</SelectItem>
                    <SelectItem value="normal">{t("main.animNormal")}</SelectItem>
                    <SelectItem value="slow">{t("main.animSlow")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-medium text-foreground">{t("main.layoutDisplayOptions")}</h3>
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="showMetrics" className="text-xs text-muted-foreground">
                    {t("main.showMetrics")}
                  </Label>
                  <Switch
                    id="showMetrics"
                    checked={config.showMetrics}
                    onCheckedChange={(checked) => updateConfig("showMetrics", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="showStats" className="text-xs text-muted-foreground">
                    {t("main.showStats")}
                  </Label>
                  <Switch
                    id="showStats"
                    checked={config.showStats}
                    onCheckedChange={(checked) => updateConfig("showStats", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="compactMode" className="text-xs text-muted-foreground">
                    {t("main.compactMode")}
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
              <h3 className="text-xs sm:text-sm font-medium text-foreground">{t("main.aiResearchSettings")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("main.aiResearchSettingsDesc")}
              </p>
              
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <Label htmlFor="enableAI" className="text-xs text-muted-foreground">
                    {t("main.enableAiResearch")}
                  </Label>
                  <p className="text-[10px] text-muted-foreground/70">
                    {t("main.enableAiResearchHint")}
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
                    {t("main.aiModel")}
                  </Label>
                  <Select value={config.aiModel} onValueChange={(value) => updateConfig("aiModel", value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google/gemini-2.5-flash">
                        {t("main.modelFlash")}
                      </SelectItem>
                      <SelectItem value="google/gemini-2.5-pro">
                        {t("main.modelPro")}
                      </SelectItem>
                      <SelectItem value="google/gemini-2.5-flash-lite">
                        {t("main.modelFlashLite")}
                      </SelectItem>
                      <SelectItem value="deepseek-v4-pro">
                        {t("main.modelDeepseekPro")}
                      </SelectItem>
                      <SelectItem value="deepseek-v4-flash">
                        {t("main.modelDeepseekFlash")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground/70">
                    {config.aiModel === "google/gemini-2.5-pro" && t("main.modelProHint")}
                    {config.aiModel === "google/gemini-2.5-flash" && t("main.modelFlashHint")}
                    {config.aiModel === "google/gemini-2.5-flash-lite" && t("main.modelFlashLiteHint")}
                    {config.aiModel === "deepseek-v4-pro" && t("main.modelDeepseekProHint")}
                    {config.aiModel === "deepseek-v4-flash" && t("main.modelDeepseekFlashHint")}
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
            <Label className="text-sm font-medium text-foreground">{t("main.embedCodeTitle")}</Label>
            <Button
              onClick={copyEmbedCode}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  {t("main.copied")}
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  {t("main.copyCode")}
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
            {t("main.embedCodeHint")}
          </p>
        </div>
      )}
    </div>
  );
};
