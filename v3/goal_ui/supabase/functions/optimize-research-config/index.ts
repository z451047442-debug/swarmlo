import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptimizeConfigRequest {
  preset: string;
  language?: "en" | "zh";
  currentGoal?: string;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { preset, language, currentGoal }: OptimizeConfigRequest = await req.json();

    const outputLanguageInstruction = language === "en"
      ? "\n\nIMPORTANT: Write all output strictly in English."
      : "\n\n重要：所有输出请使用简体中文撰写。";

    console.log('Optimize config request:', { preset, currentGoal });

    const AI_BASE_URL = Deno.env.get('AI_BASE_URL') ?? 'https://ai.gateway.lovable.dev/v1';
    const AI_API_KEY = Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
    if (!AI_API_KEY) {
      throw new Error('AI_API_KEY is not configured (set AI_API_KEY or LOVABLE_API_KEY)');
    }

    const systemPrompt = `你是一名资深研究工作流架构师，专精于 GOAP（Goal-Oriented Action Planning，目标导向行动规划）配置优化。

请根据给定的预设/目标生成优化的研究配置。你的配置应针对具体使用场景最大化研究效果。

请考虑：
- 与目标相匹配的研究深度
- 与领域相契合的来源类型与质量门槛
- 在速度与全面性之间取得平衡的执行参数
- 与该预设相关的视角与重点领域
- 用于最优规划与再规划的 GOAP 设置

请具体且务实——这些设置将直接控制 AI 的研究行为。请使用简体中文输出全部研究内容。`;

    const presetPrompts: Record<string, string> = {
      'academic-deep': `优化目标：学术/科学深度研究
      - 最大深度与严谨性
      - 优先学术与同行评审来源
      - 高置信度阈值（90% 以上）
      - 全面分析并配合大量交叉验证
      - 重点：研究方法、引用规范、可复现性
      - 时间范围：涵盖奠基性经典文献，而不仅限于近期成果
      目标：${currentGoal || '达到发表级严谨性的科学研究'}`,

      'industry-quick': `优化目标：行业快速扫描
      - 优先速度与可执行的洞察
      - 行业报告、市场数据、商业来源
      - 可接受中等置信度（75% 以上）
      - 浅层至中等深度
      - 重点：实际应用、投资回报率、趋势
      - 时间范围：仅近期（过去 6-12 个月）
      目标：${currentGoal || '为商业决策提供快速的行业洞察'}`,

      'competitive-analysis': `优化目标：竞争情报与分析
      - 全面的竞争对手研究
      - 行业报告、新闻、公司披露文件、社交媒体
      - 重点：市场定位、战略、优势与劣势
      - 中等到深入的研究深度
      - 商业与战略视角
      - 针对多个竞争对手并行执行
      目标：${currentGoal || '竞争格局分析'}`,

      'technical-feasibility': `优化目标：技术可行性研究
      - 技术与工程重点
      - 学术论文、技术文档、GitHub
      - 对实现细节进行深入分析
      - 重点：架构、性能、局限性、权衡取舍
      - 技术要求高置信度（85% 以上）
      - 技术视角并兼顾实际考量
      目标：${currentGoal || '技术实现可行性评估'}`,

      'market-trends': `优化目标：市场趋势与预测
      - 趋势分析与未来预测
      - 行业报告、市场研究、财务数据
      - 重点：增长模式、新兴机遇、颠覆性变化
      - 中等深度并覆盖广泛
      - 商业与分析视角
      - 近期时间范围并辅以历史背景
      目标：${currentGoal || '市场趋势分析与预测'}`,

      'medical-clinical': `优化目标：医学/临床研究
      - 优先医学期刊、临床试验、PubMed
      - 要求非常高的置信度（90% 以上）
      - 深入分析并重点关注安全性与有效性
      - 重点：临床证据、患者预后、安全性档案
      - 学术与临床视角
      - 排除未经同行评审的来源
      目标：${currentGoal || '基于循证分析的临床研究'}`,

      'startup-validation': `优化目标：创业/商业创意验证
      - 市场规模、竞争格局、客户需求
      - 行业报告、调研、竞品分析
      - 务实与商业视角
      - 重点：市场空白、验证指标、进入市场策略
      - 中等深度、覆盖广泛
      - 兼顾成本效益与并行研究
      目标：${currentGoal || '创业创意验证与市场评估'}`,

      'policy-regulatory': `优化目标：政策与监管研究
      - 政府来源、法律文件、政策文件
      - 高准确度与时效性至关重要
      - 重点：合规、法律框架、监管趋势
      - 深入分析并配合风险评估
      - 学术与法律视角
      - 排除观点性文章，优先官方来源
      目标：${currentGoal || '政策与监管合规研究'}`
    };

    const userPrompt = presetPrompts[preset.toLowerCase()] || `为以下预设优化研究设置：${preset}。目标：${currentGoal || '通用研究'}`;

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
              name: "generate_optimized_config",
              description: "Generate optimized research configuration for the given preset",
              parameters: {
                type: "object",
                properties: {
                  researchGuidance: {
                    type: "object",
                    properties: {
                      focusAreas: { 
                        type: "array", 
                        items: { type: "string" },
                        description: "Specific topics to emphasize (2-4 items)"
                      },
                      excludeTopics: { 
                        type: "array", 
                        items: { type: "string" },
                        description: "Topics to avoid (0-3 items)"
                      },
                      depth: { 
                        type: "string", 
                        enum: ["surface", "moderate", "deep"],
                        description: "Research depth level"
                      },
                      perspective: { 
                        type: "string",
                        description: "Research perspective (technical/business/academic/practical)"
                      },
                      timeframe: { 
                        type: "string",
                        description: "Time focus (recent/current-year/past-year/past-2-years/all-time)"
                      }
                    },
                    required: ["depth", "perspective", "timeframe"]
                  },
                  prompts: {
                    type: "object",
                    properties: {
                      systemPrompt: { 
                        type: "string",
                        description: "Custom system prompt for AI (2-3 paragraphs)"
                      }
                    }
                  },
                  parameters: {
                    type: "object",
                    properties: {
                      maxSources: { 
                        type: "number",
                        minimum: 5,
                        maximum: 25,
                        description: "Number of sources per step"
                      },
                      minConfidence: { 
                        type: "number",
                        minimum: 70,
                        maximum: 95,
                        description: "Minimum confidence threshold (%)"
                      },
                      maxSteps: { 
                        type: "number",
                        minimum: 5,
                        maximum: 10,
                        description: "Maximum research steps"
                      },
                      parallelAgents: { 
                        type: "number",
                        minimum: 1,
                        maximum: 5,
                        description: "Number of parallel agents"
                      },
                      timeout: { 
                        type: "number",
                        minimum: 60,
                        maximum: 300,
                        description: "Timeout in seconds"
                      }
                    },
                    required: ["maxSources", "minConfidence", "maxSteps"]
                  },
                  filters: {
                    type: "object",
                    properties: {
                      dateRange: { 
                        type: "string",
                        description: "Date range filter (recent/current-year/past-year/past-2-years/all-time)"
                      },
                      sourceTypes: { 
                        type: "array",
                        items: { type: "string" },
                        description: "Preferred source types (academic/technical/industry/news)"
                      },
                      excludeDomains: { 
                        type: "array",
                        items: { type: "string" },
                        description: "Domains to exclude (0-3 items)"
                      }
                    },
                    required: ["dateRange", "sourceTypes"]
                  },
                  goapConfig: {
                    type: "object",
                    properties: {
                      executionMode: { 
                        type: "string",
                        enum: ["focused", "closed", "open"],
                        description: "GOAP execution mode"
                      },
                      enableReplanning: { 
                        type: "boolean",
                        description: "Enable adaptive replanning"
                      },
                      costOptimization: { 
                        type: "boolean",
                        description: "Optimize for cost efficiency"
                      },
                      parallelExecution: { 
                        type: "boolean",
                        description: "Enable parallel agent execution"
                      }
                    },
                    required: ["executionMode", "enableReplanning"]
                  }
                },
                required: ["researchGuidance", "parameters", "filters", "goapConfig"],
                additionalProperties: false
              }
            }
          }
        ],
        ...(AI_BASE_URL.includes('deepseek') ? { thinking: { type: 'disabled' } } : {}),
        tool_choice: { type: "function", function: { name: "generate_optimized_config" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const config = JSON.parse(toolCall.function.arguments);
    console.log('Generated optimized config:', config);

    return new Response(JSON.stringify({ config }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in optimize-research-config function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to optimize research configuration'
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
