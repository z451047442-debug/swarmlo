import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings2, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import {
  AGENTICFLOW_SETTINGS_KEY,
  defaultSettings,
  loadAdvancedSettings,
  type AdvancedSettings,
} from "@/lib/agenticSettings";
import {
  SwarmSettingsSection,
  GoapSettingsSection,
  ExecutionSettingsSection,
  ModelRouterSettingsSection,
} from "@/components/agents/settings/SettingsSections";

const presets = {
  development: {
    name: 'agents.settings.preset.dev',
    description: 'agents.settings.preset.devDesc',
    badge: 'default' as const,
  },
  production: {
    name: 'agents.settings.preset.prod',
    description: 'agents.settings.preset.prodDesc',
    badge: 'default' as const,
  },
  budget: {
    name: 'agents.settings.preset.budget',
    description: 'agents.settings.preset.budgetDesc',
    badge: 'secondary' as const,
  },
  quality: {
    name: 'agents.tab.quality',
    description: 'agents.settings.preset.qualityDesc',
    badge: 'destructive' as const,
  },
};

export function AdvancedSettingsModal() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AdvancedSettings>(loadAdvancedSettings);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleSave = () => {
    localStorage.setItem(AGENTICFLOW_SETTINGS_KEY, JSON.stringify(settings));
    toast({
      title: t('agents.settings.saved'),
      description: t('agents.settings.savedDesc'),
    });
    setOpen(false);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    toast({
      title: t('agents.settings.reset'),
      description: t('agents.settings.resetDesc'),
    });
  };

  const applyPreset = (presetName: keyof typeof presets) => {
    const presetConfigs: Record<keyof typeof presets, Partial<AdvancedSettings>> = {
      development: {
        swarm: { ...settings.swarm, maxAgents: 5, strategy: 'balanced' },
        execution: { ...settings.execution, strategy: 'sequential', enableQualityGates: false },
        modelRouter: { ...settings.modelRouter, strategy: 'speed' },
      },
      production: {
        swarm: { ...settings.swarm, maxAgents: 15, strategy: 'adaptive' },
        execution: { ...settings.execution, strategy: 'adaptive', enableQualityGates: true },
        modelRouter: { ...settings.modelRouter, strategy: 'balanced' },
      },
      budget: {
        swarm: { ...settings.swarm, maxAgents: 3, strategy: 'specialized' },
        execution: { ...settings.execution, strategy: 'sequential', maxParallelTasks: 2 },
        modelRouter: { ...settings.modelRouter, primaryProvider: 'openrouter', strategy: 'cost' },
      },
      quality: {
        swarm: { ...settings.swarm, maxAgents: 20, strategy: 'adaptive' },
        execution: { ...settings.execution, strategy: 'parallel', enableQualityGates: true },
        modelRouter: { ...settings.modelRouter, primaryProvider: 'anthropic', strategy: 'quality' },
      },
    };

    setSettings({ ...settings, ...presetConfigs[presetName] });
    toast({
      title: t('agents.settings.presetApplied', { name: t(presets[presetName].name) }),
      description: t(presets[presetName].description),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" />
          {t('agents.settings.trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-500" />
            {t('agents.settings.title')}
          </DialogTitle>
          <DialogDescription>
            {t('agents.settings.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Presets */}
        <div className="space-y-2">
          <Label>{t('agents.settings.presets')}</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(presets).map(([key, preset]) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(key as keyof typeof presets)}
                className="flex flex-col h-auto py-3 items-start"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">{t(preset.name)}</span>
                  <Badge variant={preset.badge} className="text-xs">
                    {t(preset.name)}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  {t(preset.description)}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <Tabs defaultValue="swarm" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="swarm">{t('agents.settings.tab.swarm')}</TabsTrigger>
            <TabsTrigger value="goap">{t('agents.settings.tab.goap')}</TabsTrigger>
            <TabsTrigger value="execution">{t('agents.tab.execution')}</TabsTrigger>
            <TabsTrigger value="model">{t('agents.settings.tab.model')}</TabsTrigger>
          </TabsList>

          <TabsContent value="swarm" className="space-y-4 mt-4">
            <SwarmSettingsSection settings={settings} setSettings={setSettings} />
          </TabsContent>

          <TabsContent value="goap" className="space-y-4 mt-4">
            <GoapSettingsSection settings={settings} setSettings={setSettings} />
          </TabsContent>

          <TabsContent value="execution" className="space-y-4 mt-4">
            <ExecutionSettingsSection settings={settings} setSettings={setSettings} />
          </TabsContent>

          <TabsContent value="model" className="space-y-4 mt-4">
            <ModelRouterSettingsSection settings={settings} setSettings={setSettings} />
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            {t('agents.settings.resetDefaults')}
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            {t('agents.settings.saveConfig')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
