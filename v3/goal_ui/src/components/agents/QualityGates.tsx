import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Shield, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n";

interface QualityMetrics {
  compileCheck: boolean;
  testCoverage: number;
  securityScore: number;
}

interface QualityGatesProps {
  metrics: QualityMetrics;
}

export const QualityGates = ({ metrics }: QualityGatesProps) => {
  const { t } = useI18n();

  const gates = [
    {
      name: t('agents.quality.compileCheck'),
      status: metrics.compileCheck ? "passed" : "failed",
      icon: metrics.compileCheck ? CheckCircle2 : XCircle,
      color: metrics.compileCheck ? "text-green-500" : "text-red-500",
    },
    {
      name: t('agents.quality.testCoverage'),
      status: metrics.testCoverage >= 80 ? "passed" : metrics.testCoverage >= 60 ? "warning" : "failed",
      value: metrics.testCoverage,
      threshold: 80,
    },
    {
      name: t('agents.quality.securityScan'),
      status: metrics.securityScore >= 90 ? "passed" : metrics.securityScore >= 70 ? "warning" : "failed",
      value: metrics.securityScore,
      threshold: 90,
    },
  ];

  const statusLabel = (status: string): string => {
    if (status === "passed") return t('agents.quality.passed');
    if (status === "warning") return t('agents.comm.type.warning');
    return t('agents.quality.failed');
  };

  return (
    <div className="space-y-6">
      <Card className="border-2 border-green-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-500" />
            {t('agents.quality.title')}
          </CardTitle>
          <CardDescription>{t('agents.quality.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {gates.map((gate, idx) => (
            <div key={idx} className="space-y-3 p-4 rounded-lg border bg-card/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {gate.icon ? (
                    <gate.icon className={`w-5 h-5 ${gate.color}`} />
                  ) : gate.status === "passed" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : gate.status === "warning" ? (
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="font-semibold">{gate.name}</span>
                </div>
                <Badge
                  variant={
                    gate.status === "passed"
                      ? "default"
                      : gate.status === "warning"
                      ? "secondary"
                      : "destructive"
                  }
                >
                  {statusLabel(gate.status)}
                </Badge>
              </div>

              {gate.value !== undefined && (
                <>
                  <Progress value={gate.value} className="h-2" />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t('agents.quality.current', { value: gate.value })}</span>
                    <span>{t('agents.quality.threshold', { threshold: gate.threshold })}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
