import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateGoalRequest {
  category: string;
  language?: "en" | "zh";
  customContext?: string;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category, language, customContext }: GenerateGoalRequest = await req.json();

    const outputLanguageInstruction = language === "en"
      ? "\n\nIMPORTANT: Write all output strictly in English."
      : "\n\n重要：所有输出请使用简体中文撰写。";

    console.log('Generate research goal request:', { category, customContext });

    const AI_BASE_URL = Deno.env.get('AI_BASE_URL') ?? 'https://ai.gateway.lovable.dev/v1';
    const AI_API_KEY = Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
    if (!AI_API_KEY) {
      throw new Error('AI_API_KEY is not configured (set AI_API_KEY or LOVABLE_API_KEY)');
    }

    const systemPrompt = `你是一名资深研究顾问与未来学家，擅长构思前沿、创新的研究目标，推动研究边界不断拓展。

请针对给定类别生成 3 个高度多样化且新颖的研究目标。每个目标应：
- 创新且有前瞻性（探索新兴趋势、新颖应用或非常规视角）
- 具体且可执行（研究方向明确，而非泛泛探索）
- 紧扣 2024-2025 年的前沿进展，具有时效性
- 以专业措辞表述，细节引人入胜
- 彼此各不相同（在方法、规模、应用或研究路径上有所差异）
- 突破边界（挑战常规思维，探索尚未被触及的交叉领域）

关键要求：通过以下维度确保 3 个目标具备多样性：
- 规模（微观与宏观、个人与企业/社会层面）
- 应用领域（不同行业、用例或场景）
- 切入角度（技术实现、商业影响、伦理考量、未来预测）
- 时间跨度（近期实用与长期变革性）

AI 与机器学习领域优秀多样化研究目标示例：
1. 「探究多智能体强化学习系统在竞争性市场模拟中自发目标形成的现象，重点衡量超过 10,000 轮迭代中的自主性、协作模式与对齐漂移」
2. 「分析自主 AI 智能体以自进化风险策略开展金融交易所需的伦理与监管框架，审视责任模型与人工监督机制」
3. 「研究结合大语言模型与符号推理引擎的神经符号混合架构，用于求解多步数学证明，并与 GPT-5 及人类数学家进行基准对比」

较差目标示例（过于笼统、缺乏新意）：
- 「研究机器学习在医疗领域的应用」
- 「研究神经网络优化技术」
- 「研究 AI 伦理与偏见」

请突破边界。请具体。请保持创新。请使用简体中文输出全部研究目标。`;

    const categoryPrompts: Record<string, string> = {
      'finance': '请为金融领域生成 3 个前沿、多样化的研究目标。从以下方面体现差异：(1) 新兴技术（加密货币、DeFi、AI 交易），(2) 新颖的市场机制或监管规则，(3) 行为/心理层面或系统性风险。请包含具体指标、时间跨度或新颖应用。示例：算法稳定币机制、神经金融交易模式、代币化房地产流动性。',

      'business': '请为商业领域生成 3 个创新、多样化的研究目标。从以下方面体现差异：(1) 新兴商业模式或平台，(2) 组织变革或组织文化，(3) 数据驱动的决策或自动化。请具体说明行业、规模与可衡量的成果。示例：企业 DAO 治理、AI 辅助战略规划、远程优先组织的心理学研究。',

      'marketing': '请为营销领域生成 3 个突破边界、多样化的研究目标。从以下方面体现差异：(1) 新兴渠道或技术（AI、AR/VR、Web3），(2) 行为科学或心理学，(3) 衡量或归因创新。请包含具体平台、人群画像或新颖方法。示例：基于眼动追踪 AI 的神经营销、去中心化创作者经济、使用图神经网络预测客户终身价值。',

      'medical': '请为医学/医疗健康领域生成 3 个前沿、多样化的研究目标。从以下方面体现差异：(1) 新兴诊断或治疗技术，(2) 医疗服务提供或可及性创新，(3) 个性化/精准医疗或 AI 应用。请具体说明疾病、人群或技术。示例：利用蛋白质折叠技术发现 AI 抗生素、CRISPR 生殖系编辑的伦理问题、数字疗法对心理健康的有效性。',

      'education': '请为教育领域生成 3 个创新、多样化的研究目标。从以下方面体现差异：(1) 新兴教学技术（AI 导师、VR、自适应学习），(2) 学习科学或认知研究，(3) 教育公平或可及性。请包含具体年龄段、学科或可衡量的学习成果。示例：AI 生成个性化课程、VR 历史沉浸式教学的有效性、基于神经可塑性优化的学习计划。',

      'technical': '请为技术/工程领域生成 3 个前沿、多样化的研究目标。从以下方面体现差异：(1) 新兴架构或范式，(2) 性能或效率突破，(3) 安全或可靠性创新。请具体说明技术、指标或新颖方法。示例：抗量子密码迁移路径、边缘 AI 模型压缩技术、分布式系统混沌工程。',

      'coding': '请为编程/软件开发领域生成 3 个创新、多样化的研究目标。从以下方面体现差异：(1) 新兴语言、框架或范式，(2) AI 辅助开发或自动化，(3) 代码质量、测试或协作工具。请包含具体技术或可衡量的生产力提升。示例：大语言模型驱动的自动化测试生成、用于更安全并发的效果系统、面向安全漏洞的 AI 代码审查。',

      'ai-ml': '请为 AI、机器学习与自主智能体领域生成 3 个前沿、多样化的研究目标。必须从以下方面体现差异：(1) 智能体 AI 系统（多智能体协作、自主决策、目标追寻行为、涌现式智能），(2) 新颖架构或训练范式（神经符号、多模态融合、自改进系统），(3) 真实世界应用或社会影响（对齐、安全、伦理、变革性能力）。请具体说明智能体行为、架构创新或可衡量的能力。请以新颖交叉领域突破边界。示例：「仅凭原始 API 文档衡量 LLM 智能体自发工具使用的涌现现象」、「在目标不断演化的对抗性交易环境中对多智能体协商协议进行基准测试」、「研究自修改智能体系统中用于价值对齐的宪法式 AI 方法」、「分析分布式 AI 智能体解决 NP 困难优化问题时的群体智能模式」。',

      'custom': `请基于以下内容生成 3 个创新、突破边界的研究目标：${customContext || '通用前沿研究主题'}。请确保目标具体、可执行，并探索新颖角度或非常规应用。`
    };

    const userPrompt = categoryPrompts[category.toLowerCase()] || categoryPrompts['custom'];

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
              name: "generate_goals",
              description: "Generate 3 specific research goals for the given category",
              parameters: {
                type: "object",
                properties: {
                  goals: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string",
                          description: "A concise, specific research goal (1-2 sentences max)"
                        },
                        category: {
                          type: "string",
                          description: "The category this goal belongs to"
                        }
                      },
                      required: ["title", "category"],
                      additionalProperties: false
                    },
                    minItems: 3,
                    maxItems: 3
                  }
                },
                required: ["goals"],
                additionalProperties: false
              }
            }
          }
        ],
        ...(AI_BASE_URL.includes('deepseek') ? { thinking: { type: 'disabled' } } : {}),
        tool_choice: { type: "function", function: { name: "generate_goals" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error('Rate limit exceeded');
        return new Response(JSON.stringify({ error: "Rate limits exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        console.error('Payment required');
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

    // Extract structured data from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const result = JSON.parse(toolCall.function.arguments);
    const goals = result.goals.map((g: { title: string }) => g.title);

    console.log('Generated goals:', goals);

    return new Response(JSON.stringify({ goals }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-research-goal function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to generate research goals'
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
