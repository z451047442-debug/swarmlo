import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActionItemsRequest {
  goal: string;
  language?: "en" | "zh";
  researchContext: Array<{
    stepTitle: string;
    findings: Array<{
      title: string;
      content: string;
      source?: string;
    }>;
  }>;
  totalSteps: number;
  totalDataPoints: number;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goal, language, researchContext, totalSteps, totalDataPoints }: ActionItemsRequest = await req.json();

    const outputLanguageInstruction = language === "en"
      ? "\n\nIMPORTANT: Write all output strictly in English."
      : "\n\n重要：所有输出请使用简体中文撰写。";

    console.log('Generating action items for goal:', goal);

    const AI_BASE_URL = Deno.env.get('AI_BASE_URL') ?? 'https://ai.gateway.lovable.dev/v1';
    const AI_API_KEY = Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
    if (!AI_API_KEY) {
      throw new Error('AI_API_KEY is not configured (set AI_API_KEY or LOVABLE_API_KEY)');
    }

    // Build research summary from all steps
    let researchSummary = '';
    researchContext.forEach(step => {
      researchSummary += `\n${step.stepTitle}:\n`;
      step.findings.forEach(finding => {
        researchSummary += `• ${finding.title}: ${finding.content}\n`;
        if (finding.source) researchSummary += `  来源：${finding.source}\n`;
      });
    });

    const systemPrompt = `你是一名资深的战略规划师和落地实施顾问。请基于研究发现，生成贴合上下文、可执行的建议。

关键指令（CRITICAL INSTRUCTIONS）：
- 生成与研究目标直接相关的行动项
- 建议必须基于所提供的研究发现
- 除非适用于这个具体目标，否则不要使用"试点项目"或"规模化上线"之类的通用模板
- 根据研究涉及的领域和背景定制行动项
- 包含具体、可执行的步骤，并给出切合实际的时间线和资源
- 请使用简体中文撰写所有研究内容、建议和行动项

例如：
- 如果研究"最佳家庭用车"→ 推荐具体的车型、对比步骤、试驾安排
- 如果研究"法学院替代方案"→ 推荐具体的项目、申请步骤、律师资格考试备考
- 如果研究"量子计算"→ 推荐学习路径、工具、研究论文
- 如果研究商业战略 → 推荐市场分析、竞品研究、实施计划`;

    const userPrompt = `
研究目标：${goal}

研究发现（共 ${totalSteps} 个步骤、${totalDataPoints} 条数据点）：
${researchSummary}

基于这些发现，生成 3-4 条贴合上下文的行动项，直接帮助达成或落地研究目标。

要求（REQUIREMENTS）：
1. 每条行动项必须针对"${goal}"具体展开——不能是通用的项目管理步骤
2. 在描述中引用真实的研究发现
3. 提供符合该目标实际的时间线（不要总是"第 1-4 周"）
4. 包含与该特定领域相关的资源和指标
5. 识别领域特定的风险及应对策略

另外生成一份全面的 2-3 段执行摘要，要求：
- 直接总结关于"${goal}"的研究结论
- 突出最重要的发现并给出具体细节
- 基于研究给出明确的结论和建议

输出格式：
{
  "actionItems": [
    {
      "id": "1",
      "title": "与 ${goal} 相关的具体行动",
      "description": "引用实际研究发现的详细描述……",
      "timeline": "合适的时间线（例如'1-2 周'、'3 个月'、'立即'）",
      "timelineDetails": "时间线各阶段明细",
      "priority": "High" | "Medium" | "Low",
      "resources": {
        "budget": "合理的预算（如适用），或'最低成本'或'仅研究'",
        "team": "所需人员/角色",
        "tools": ["领域特定的工具/资源"]
      },
      "metrics": ["该行动的具体成功指标"],
      "risks": [
        {
          "risk": "领域特定风险",
          "mitigation": "切实可行的应对策略"
        }
      ],
      "references": [
        { "title": "相关资源", "url": "URL（如适用）" }
      ],
      "researchContext": "与研究发现之间的关联"
    }
  ],
  "summary": "针对研究目标、包含具体发现与建议的全面 2-3 段执行摘要……"
}`;

    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('AI_MODEL') ?? 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt + outputLanguageInstruction },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_action_plan",
              description: "Generate contextual action items and executive summary based on research findings",
              parameters: {
                type: "object",
                properties: {
                  actionItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        timeline: { type: "string" },
                        timelineDetails: { type: "string" },
                        priority: { type: "string", enum: ["High", "Medium", "Low"] },
                        resources: {
                          type: "object",
                          properties: {
                            budget: { type: "string" },
                            team: { type: "string" },
                            tools: { type: "array", items: { type: "string" } }
                          }
                        },
                        metrics: { type: "array", items: { type: "string" } },
                        risks: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              risk: { type: "string" },
                              mitigation: { type: "string" }
                            }
                          }
                        },
                        references: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              title: { type: "string" },
                              url: { type: "string" }
                            }
                          }
                        },
                        researchContext: { type: "string" }
                      },
                      required: ["id", "title", "description", "timeline", "priority", "resources", "metrics"]
                    }
                  },
                  summary: {
                    type: "string",
                    description: "Comprehensive executive summary (2-3 paragraphs)"
                  }
                },
                required: ["actionItems", "summary"]
              }
            }
          }
        ],
        ...(AI_BASE_URL.includes('deepseek') ? { thinking: { type: 'disabled' } } : {}),
        tool_choice: { type: "function", function: { name: "generate_action_plan" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached" }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const result = JSON.parse(toolCall.function.arguments);
    
    console.log('Generated action items:', result.actionItems?.length || 0);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-action-items function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

if (import.meta.main) {
  serve(handler);
}
