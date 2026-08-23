import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Edit3, Target, GitBranch, Code, TestTube, FileText } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n";

interface ResearchReviewCardProps {
  onApprove: () => void;
  onRevise: (feedback: string) => void;
  goal: string;
}

export const ResearchReviewCard = ({ onApprove, onRevise, goal }: ResearchReviewCardProps) => {
  const { t } = useI18n();
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
              {t("report.review.title")}
            </CardTitle>
            <CardDescription className="text-base">
              {t("report.review.description")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Goal Summary */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Target className="w-4 h-4" />
            {t("report.review.projectGoal")}
          </div>
          <p className="text-foreground pl-6">{goal}</p>
        </div>

        {/* Research Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <span className="font-medium">{t("report.review.goalAssessment")}</span>
            </div>
            <Badge variant="secondary" className="w-fit">{t("report.review.completed")}</Badge>
            <p className="text-sm text-muted-foreground">{t("report.review.goalAssessmentDesc")}</p>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-purple-500" />
              <span className="font-medium">{t("report.review.architecture")}</span>
            </div>
            <Badge variant="secondary" className="w-fit">{t("report.review.completed")}</Badge>
            <p className="text-sm text-muted-foreground">{t("report.review.architectureDesc")}</p>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-blue-500" />
              <span className="font-medium">{t("report.review.implementation")}</span>
            </div>
            <Badge variant="secondary" className="w-fit">{t("report.review.ready")}</Badge>
            <p className="text-sm text-muted-foreground">{t("report.review.implementationDesc")}</p>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-card border">
            <div className="flex items-center gap-2">
              <TestTube className="w-5 h-5 text-green-500" />
              <span className="font-medium">{t("report.review.testing")}</span>
            </div>
            <Badge variant="secondary" className="w-fit">{t("report.review.ready")}</Badge>
            <p className="text-sm text-muted-foreground">{t("report.review.testingDesc")}</p>
          </div>
        </div>

        {/* Execution Plan Summary */}
        <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-muted">
          <h4 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            {t("report.review.planSummary")}
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t("report.review.totalPhases")}</span>
              <p className="font-medium">{t("report.review.phases")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("report.review.estimatedDuration")}</span>
              <p className="font-medium">{t("report.review.duration")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("report.review.agentsRequired")}</span>
              <p className="font-medium">{t("report.review.agents")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("report.review.complexity")}</span>
              <p className="font-medium">{t("report.review.complexityValue")}</p>
            </div>
          </div>
        </div>

        {/* Revision Feedback */}
        {showFeedback && (
          <div className="space-y-2 animate-fade-in">
            <label className="text-sm font-medium">{t("report.review.feedbackLabel")}</label>
            <Textarea
              placeholder={t("report.review.feedbackPlaceholder")}
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
            {t("report.review.approve")}
          </Button>
          <Button
            onClick={handleRevise}
            variant="outline"
            size="lg"
            className="gap-2"
          >
            <Edit3 className="w-5 h-5" />
            {showFeedback ? t("report.review.submitRevision") : t("report.review.requestRevision")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
