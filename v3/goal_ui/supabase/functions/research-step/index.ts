import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResearchConfig {
  researchGuidance?: {
    focusAreas: string[];
    excludeTopics: string[];
    depth: "surface" | "moderate" | "deep";
    perspective: string;
    timeframe: string;
  };
  prompts?: {
    systemPrompt: string;
    searchQueryTemplate: string;
    analysisPrompt: string;
    synthesisPrompt: string;
  };
  parameters?: {
    maxSources: number;
    minConfidence: number;
    maxSteps: number;
    parallelAgents: number;
    timeout: number;
  };
  filters?: {
    dateRange: string;
    sourceTypes: string[];
    languages: string[];
    excludeDomains: string[];
  };
}

/** modelRouter 配置（前端 AdvancedSettingsModal 持久化后随请求下发） */
interface ModelRouter {
  primaryProvider?: "anthropic" | "openrouter" | "gemini" | "local";
  strategy?: "cost" | "speed" | "quality" | "privacy" | "balanced";
  maxCostPerRequest?: number;
  enableFallback?: boolean;
}

interface ResearchRequest {
  goal: string;
  stepTitle: string;
  stepDescription: string;
  stepType: string;
  aiModel?: string;
  language?: "en" | "zh";
  modelRouter?: ModelRouter;
  config?: ResearchConfig;
  previousStepsData?: Array<{
    stepTitle: string;
    data: ResearchDataItem[];
  }>;
}

interface ResearchDataItem {
  id: string;
  title: string;
  content: string;
  source?: string;
  confidence?: number;
  timestamp: string;
}

// DeepSeek 官方联网搜索：Responses API 的 web_search 由服务端注入结果，仅返回模型基于真实检索的汇总文本
async function fetchDeepSeekSearch(query: string, apiKey: string): Promise<string> {
  try {
    const response = await fetch('https://api.deepseek.com/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        input: `请联网搜索最新资料（优先 2025-2026 年信息），汇总与以下主题相关的关键事实、数据与来源（必须注明年份）：${query}`,
        tools: [{ type: 'web_search' }],
        stream: false,
      }),
    });
    if (!response.ok) {
      console.error('DeepSeek web search failed:', response.status);
      return '';
    }
    const data = await response.json();
    console.log('DeepSeek web search response:', data);
    const message = (data.output ?? []).find((item: { type: string }) => item.type === 'message');
    const text = message?.output_text
      || (message?.content ?? [])
        .filter((c: { type: string }) => c.type === 'output_text')
        .map((c: { text: string }) => c.text)
        .join('\n')
      || data.output_text
      || '';
    const links = (data.output ?? [])
      .filter((item: { type: string; action?: { type?: string; url?: string } }) => item.type === 'web_search_call' && item.action?.type === 'open_page' && item.action?.url)
      .map((item: { action?: { url?: string } }) => (item.action?.url ?? '').split('#')[0]);
    const linkText = links.length
      ? `\n\n参考链接（真实检索）：\n${links.map((url: string) => `- ${url}`).join('\n')}`
      : '';
    return text + linkText;
  } catch (err) {
    console.error('DeepSeek web search error:', err);
    return '';
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goal, stepTitle, stepDescription, stepType, aiModel, language, modelRouter, config, previousStepsData }: ResearchRequest = await req.json();

    console.log('Research request:', {
      goal,
      stepTitle,
      stepDescription,
      stepType,
      aiModel,
      previousStepsCount: previousStepsData?.length || 0,
      configProvided: !!config,
      depth: config?.researchGuidance?.depth,
      perspective: config?.researchGuidance?.perspective,
      focusAreas: config?.researchGuidance?.focusAreas?.length || 0,
      modelRouter: modelRouter ?? null
    });

    const AI_BASE_URL = Deno.env.get('AI_BASE_URL') ?? 'https://ai.gateway.lovable.dev/v1';
    const AI_API_KEY = Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
    if (!AI_API_KEY) {
      throw new Error('AI_API_KEY is not configured (set AI_API_KEY or LOVABLE_API_KEY)');
    }

    // ---- modelRouter：按 primaryProvider 选择端点/密钥/模型档位 ----
    // 前端仅在用户显式保存过高级设置时下发 modelRouter；未下发时 provider 回落
    // 'local'（AI_BASE_URL gateway），行为与以前完全一致。
    const provider = modelRouter?.primaryProvider ?? 'local';

    // 各 provider 的 OpenAI 兼容 chat/completions 端点（请求形态一致）
    const PROVIDER_BASE_URLS: Record<string, string | undefined> = {
      anthropic: Deno.env.get('AI_ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com/v1',
      openrouter: Deno.env.get('AI_OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1',
      gemini: Deno.env.get('AI_GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta/openai',
      local: undefined, // gateway
    };
    const PROVIDER_API_KEYS: Record<string, string | undefined> = {
      anthropic: Deno.env.get('ANTHROPIC_API_KEY'),
      openrouter: Deno.env.get('OPENROUTER_API_KEY'),
      gemini: Deno.env.get('GEMINI_API_KEY'),
      local: undefined, // 复用 AI_API_KEY
    };
    const effectiveBaseUrl = PROVIDER_BASE_URLS[provider] ?? AI_BASE_URL;
    const effectiveApiKey = PROVIDER_API_KEYS[provider] ?? AI_API_KEY;

    // strategy → 模型档位。环境变量 AI_MODEL_<STRATEGY> 可覆盖；'local' 走 gateway，
    // 由 gateway 决定模型（回落请求 aiModel / AI_MODEL）。
    const TIER_MODELS: Record<string, Record<string, string>> = {
      anthropic: {
        cost: 'claude-haiku-4-5-20251001',
        speed: 'claude-haiku-4-5-20251001',
        quality: 'claude-sonnet-4-20250514',
        privacy: 'claude-sonnet-4-20250514',
        balanced: 'claude-sonnet-4-20250514',
      },
      openrouter: {
        cost: 'deepseek/deepseek-chat-v3-0324:free',
        speed: 'google/gemini-2.5-flash',
        quality: 'anthropic/claude-sonnet-4-20250514',
        privacy: 'deepseek/deepseek-chat-v3-0324:free',
        balanced: 'anthropic/claude-sonnet-4-20250514',
      },
      gemini: {
        cost: 'gemini-2.5-flash',
        speed: 'gemini-2.5-flash',
        quality: 'gemini-2.5-pro',
        privacy: 'gemini-2.5-flash',
        balanced: 'gemini-2.5-flash',
      },
      local: { cost: '', speed: '', quality: '', privacy: '', balanced: '' },
    };
    const strategy = modelRouter?.strategy ?? 'balanced';
    const tierModel = TIER_MODELS[provider]?.[strategy];
    const envModelOverride = Deno.env.get(`AI_MODEL_${strategy.toUpperCase()}`);
    const resolvedModel = envModelOverride
      || (provider !== 'local' && tierModel ? tierModel : '')
      || aiModel
      || Deno.env.get('AI_MODEL')
      || 'google/gemini-2.5-flash';

    // maxCostPerRequest 预算 → max_tokens 上限。按所选模型档位的估算输出单价换算
    // （$ / 百万 token；近似值，edge function 拿不到精确账单——这是有意的诚实近似）。
    // 预算越低响应越短，从而真实限制单请求成本。
    const TOKEN_PRICE_PER_MILLION: Record<string, number> = {
      'claude-sonnet-4-20250514': 15,
      'anthropic/claude-sonnet-4-20250514': 15,
      'claude-haiku-4-5-20251001': 5,
      'gemini-2.5-pro': 10,
      'gemini-2.5-flash': 2.5,
      'deepseek/deepseek-chat-v3-0324:free': 0,
    };
    const pricePerToken = (TOKEN_PRICE_PER_MILLION[resolvedModel] ?? 5) / 1_000_000;
    const maxTokens = Math.max(128, Math.min(8192, Math.floor((modelRouter?.maxCostPerRequest ?? 1.0) / Math.max(pricePerToken, 1e-6))));

    console.log('modelRouter resolved:', {
      provider,
      strategy,
      baseUrl: effectiveBaseUrl,
      model: resolvedModel,
      maxTokens: modelRouter ? maxTokens : 'unset (gateway default)',
    });

    // Use custom system prompt if provided, otherwise use default
    const defaultSystemPrompt = `你是一名资深研究分析师，擅长开展全面研究并产出实质性发现。

关键指令（CRITICAL INSTRUCTIONS）：
- 你必须提供真实的研究发现，而不是任务描述
- 包含具体的数据点、统计数据、百分比和数值
- 引用现实世界中的进展、突破或趋势
- 提供具体的示例、案例研究或引用
- 生成发现时，应像刚刚完成真实研究一样
- 使用简体中文撰写所有研究内容和建议

错误示例（任务描述）："分析量子计算的发展"
正确示例（真实发现）："谷歌的 Willow 量子芯片在量子纠错方面取得突破，利用表面码实现了 99.9% 的保真度（Nature Physics，2024 年 12 月），与上一代相比错误率降低了 50%。"

错误示例："识别市场机会"
正确示例："预计到 2030 年量子计算市场规模将达到 1250 亿美元（McKinsey，2024 年），其中制药模拟将占近期收入的 38%。关键机会：用于药物发现的 NISQ 算法较经典方法实现了 10 倍加速。"

你的发现必须具体、详细且内容充实。`;

    // Apply research depth modifier
    const depthModifier = config?.researchGuidance?.depth === 'deep'
      ? '\n\n深度要求：提供全面、深入的分析，包含大量细节、多个示例，并深入探讨细微差别（每条发现 7-10 句）。'
      : config?.researchGuidance?.depth === 'surface'
      ? '\n\n深度要求：提供简洁、高层级的概述，仅包含要点（每条发现 2-3 句）。'
      : '\n\n深度要求：提供均衡的分析，包含扎实的细节和示例（每条发现 4-5 句）。';
    
    // Apply perspective modifier
    const perspectiveModifier = config?.researchGuidance?.perspective
      ? `\n\n视角要求：请从${config.researchGuidance.perspective}的视角开展这项研究，重点关注与该视角相关的方面。`
      : '';

    // Apply focus areas guidance
    const focusAreasModifier = config?.researchGuidance?.focusAreas && config.researchGuidance.focusAreas.length > 0
      ? `\n\n重点领域：请重点突出以下具体主题：${config.researchGuidance.focusAreas.join(', ')}`
      : '';

    // Apply exclude topics guidance  
    const excludeTopicsModifier = config?.researchGuidance?.excludeTopics && config.researchGuidance.excludeTopics.length > 0
      ? `\n\n排除项：不要包含与以下主题相关的信息：${config.researchGuidance.excludeTopics.join(', ')}`
      : '';

    const outputLanguageInstruction = language === "en"
      ? "\n\nIMPORTANT: Write all output strictly in English."
      : "\n\n重要：所有输出请使用简体中文撰写。";

    const systemPrompt = (config?.prompts?.systemPrompt || defaultSystemPrompt)
      + depthModifier
      + perspectiveModifier
      + focusAreasModifier
      + excludeTopicsModifier
      + outputLanguageInstruction;
    
    // Build context from previous steps
    let previousContext = '';
    if (previousStepsData && previousStepsData.length > 0) {
      previousContext = '\n\n此前研究发现（请在此基础上继续）：\n';
      previousStepsData.forEach((step, idx) => {
        previousContext += `\n${step.stepTitle}:\n`;
        step.data.forEach((item) => {
          previousContext += `• ${item.title}: ${item.content}\n`;
        });
      });
      previousContext += '\n**你的发现必须引用并扩展这些此前的发现。**\n';
    }
    
    // Special handling for final report - provide answer-focused synthesis
    const isFinalReport = stepType === "final-report";
    
    const userPrompt = isFinalReport ? `
研究目标：${goal}
${previousContext}

根据以上所有研究发现，生成 3-5 条具体、可执行的建议，直接回答研究目标。

关键要求（CRITICAL）：你的回答必须直接回答问题本身，而不是仅仅总结研究步骤。请使用简体中文撰写所有研究内容和建议。

例如，如果目标是"2025 年安大略省最佳家庭用车"：
- 错误示例："对搜索查询的分析显示 SUV 占主导地位"
- 正确示例："2025 款本田 CR-V Hybrid——安大略省最佳综合家庭 SUV。配备 AWD 四驱系统以应对冬季驾驶，40 MPG 燃油效率，安全评级出色（IIHS Top Safety Pick+）。价格：38,000 加元。5 年后保值率为 65%（同级最高）。"

每条建议必须包含：

1. **title**：具体建议或答案（不是任务或分析描述）
   - 如果推荐产品：包含型号/年份
   - 如果推荐行动：说明具体行动
   - 如果回答问题：给出直接答案
   - 示例："2025 款丰田 Sienna Hybrid——最佳家庭 MPV"、"通过 Cloudflare Access 实施零信任架构"、"是的，量子计算对药物发现已具备商业可行性"

2. **content**：包含具体细节的详细论证（至少 5-6 句）：
   - 为什么这条建议能够回答目标
   - 来自研究发现的具体数据（引用之前的步骤）
   - 带量化指标的关键收益
   - 实际考量或权衡取舍
   - 来自研究的支持证据
   - 示例：
     * "根据我们研究中的多项标准，2025 款丰田 Sienna Hybrid 在安大略省 MPV 细分市场占据主导地位。它配备 AWD 四驱系统（根据我们环境评估的发现，这对安大略省的冬季至关重要），综合油耗 36 MPG，与燃油竞品相比每年可节省约 1,200 加元的油费。安全分析显示，它凭借标配的丰田 Safety Sense 3.0 获得了 IIHS Top Safety Pick+ 评级。我们的文档分析阶段发现其可靠性评级出色（Consumer Reports 4.5/5 分），5 年后 58% 的保值率位居同级最强。42,500 加元的起售价使其具有竞争力，同时我们的网络搜索结果显示，安大略省市场的平均经销商折扣为 2,000 加元。"

3. **source**：来自研究的真实来源或可信的行业来源
   - 在适用时引用之前研究步骤中的发现
   - 示例："网络搜索发现 + Consumer Reports 2024"、"文档分析 + edmunds.com"、"知识综合 + Motor Trend 2025 购车指南"

4. **confidence**：根据研究深度取值 0.80-0.95

请记住：用户想要的是答案，而不是研究摘要。要具体、可执行，并直接针对他们的目标作答。

输出格式：
{
  "title": "具体建议/答案 [直接针对 ${goal}]",
  "content": "结合研究发现的数据、收益、指标和实用建议的详细论证……",
  "source": "来自研究或行业权威机构的来源（年份）",
  "confidence": 0.88
}` : `
研究目标：${goal}
当前分析步骤：${stepTitle}
步骤目标：${stepDescription}
${previousContext}

生成 ${config?.parameters?.maxSources ? `最多 ${config.parameters.maxSources} 条` : '3-5'}具有实质性内容的真实研究发现。每条发现必须包含：

1. **title**：具体发现或洞察（已经发现了什么，而不是要发现什么）
   - 在标题中包含关键指标、名称或突破细节
   - 示例："IBM 433 量子比特 Osprey 处理器实现量子优势"、"87% 的财富 500 强企业正在投资 AI 基础设施"

2. **content**：详细的研究发现（至少 ${config?.researchGuidance?.depth === 'deep' ? '7-10 句' : config?.researchGuidance?.depth === 'surface' ? '2-3 句' : '4-5 句'}）：
   - 从核心发现和支持数据开始
   - 包含具体的数字、百分比或指标
   - 在相关时提及真实的公司、技术或研究
   - 解释影响和意义
   - 引用之前步骤的发现以展示进展
   - 示例：
     * "IBM 最新的 433 量子比特 Osprey 处理器在求解优化问题方面展示了量子优势，比经典超级计算机快 120 倍（IBM Research，2024 年 11 月）。该系统通过动态误差抑制实现了 99.7% 的双量子比特门保真度。这一突破使物流优化等实际应用成为可能，DHL 报告称其在路线规划试验中成本降低了 15%。该技术采用重六角形量子比特拓扑以改善连接性。"
     * "对 156 篇量子计算研究论文（2023-2024）的分析显示，业界对拓扑量子比特作为实现容错量子计算最有希望的路径已形成强烈共识。目前的局限包括退相干时间平均为 85 微秒、双量子比特门误差率为 0.1%。Google、IBM、IonQ 等领先机构正在趋同于表面码实现，预计到 2027 年将出现拥有 1000 多个逻辑量子比特的系统。"

3. **source**：必填——带有年份的可信来源（每条发现都必须提供）
   - 示例："Nature Physics (2024)"、"McKinsey Quantum Report 2024"、"IEEE Quantum Computing Survey (Dec 2024)"
   - 使用 Google 搜索的 grounding 检索查找真实来源
   - ${config?.filters?.sourceTypes && config.filters.sourceTypes.length > 0
      ? `优先采用这些来源类型：${config.filters.sourceTypes.join(', ')}`
      : '如果没有可用的特定来源，请使用："行业分析（2024）"或"市场研究（2024）"'}
   - ${config?.filters?.excludeDomains && config.filters.excludeDomains.length > 0
      ? `不要使用来自以下域名的来源：${config.filters.excludeDomains.join(', ')}`
      : ''}

4. **confidence**：必填——基于发现的具体程度给出合理的分数 ${config?.parameters?.minConfidence ? `${config.parameters.minConfidence / 100}-0.95` : '0.7-0.95'}

关键要求（CRITICAL REQUIREMENTS）：
- 不要生成"分析 X"或"识别 Y"之类的通用任务描述
- 生成真实发现，就像刚刚完成研究一样，包含真实数据和见解
- 每条发现都必须有来源引用——这一点没有商量余地
- 使用 Google 搜索结果查找与查询相关的真实、最新信息
- 只包含与以下内容直接相关的信息："${goal || stepTitle}"
- 不要包含无关主题（例如，研究营销趋势时不要涉及量子计算）
- 在纳入每条发现之前，先核实它与实际研究目标相关
- 使用简体中文撰写所有研究内容和建议
${config?.filters?.dateRange ? `\n- 重点采用来自以下时间段的信息：${config.filters.dateRange}` : ''}

重要提示（IMPORTANT）：每条发现必须：
1. 与研究目标直接相关："${goal || stepTitle}"
2. 包含来自 Google 搜索结果来源的引用
3. 包含当前可验证的信息
4. ${config?.parameters?.minConfidence ? `满足最低置信度阈值 ${config.parameters.minConfidence}%` : '具有合理的置信度评分'}

输出格式（所有字段必填）：
{
  "title": "带有关键指标的具体发现 [与 ${goal || stepTitle} 直接相关]",
  "content": "包含数据、示例和影响等的详细研究发现……",
  "source": "来源名称（年份）", // 必填——绝不能省略
  "confidence": ${config?.parameters?.minConfidence ? (config.parameters.minConfidence / 100) : 0.85} // 必填——必须介于 ${config?.parameters?.minConfidence ? `${config.parameters.minConfidence / 100}` : '0.7'} 与 0.95 之间
}`;

    // DeepSeek 端点：先走官方 Responses API 联网搜索，把真实检索汇总注入提示词
    // （按解析后的有效端点判断——provider 切换后同样生效）
    let searchContext = '';
    if (effectiveBaseUrl.includes('deepseek')) {
      const searchQuery = `${goal || stepTitle} - ${stepTitle}: ${stepDescription}`.slice(0, 800);
      searchContext = await fetchDeepSeekSearch(searchQuery, effectiveApiKey);
    }
    const finalUserPrompt = searchContext
      ? `${userPrompt}\n\n---\n以下是最新联网搜索汇总（真实检索、时效最新，请优先采用其中信息并用于来源引用）：\n${searchContext}`
      : userPrompt;

    // google_search_retrieval 是 Google/Vertex 专用工具，anthropic/openrouter 端点不支持——
    // 仅 gateway（local）保留 AI_ENABLE_SEARCH 开关下的该工具。
    const supportsGoogleSearchRetrieval = provider === 'local';
    const buildChatBody = (model: string, maxTokensOverride?: number) => ({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: finalUserPrompt }
      ],
      tools: [
        ...(supportsGoogleSearchRetrieval && Deno.env.get('AI_ENABLE_SEARCH') === '1'
          ? [{
              type: "google_search_retrieval",
              google_search_retrieval: {
                dynamic_retrieval_config: {
                  mode: "MODE_DYNAMIC",
                  dynamic_threshold: 0.3
                }
              }
            }]
          : []),
        {
          type: "function",
          function: {
            name: "generate_research_data",
            description: "Generate research data items for the given step based on current web search results",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: {
                        type: "string",
                        description: "Specific finding with key metrics or breakthrough details"
                      },
                      content: {
                        type: "string",
                        description: "Detailed research findings with data, examples, and implications (4-5 sentences minimum)"
                      },
                      source: {
                        type: "string",
                        description: "REQUIRED: Credible source with year (e.g., 'Nature Physics (2024)', 'McKinsey Report 2024')"
                      },
                      confidence: {
                        type: "number",
                        minimum: config?.parameters?.minConfidence ? (config.parameters.minConfidence / 100) : 0.7,
                        maximum: 0.95,
                        description: "Confidence score based on finding specificity"
                      }
                    },
                    required: ["title", "content", "source", "confidence"],
                    additionalProperties: false
                  }
                }
              },
              required: ["items"],
              additionalProperties: false
            }
          }
        }
      ],
      ...(effectiveBaseUrl.includes('deepseek') ? { thinking: { type: 'disabled' } } : {}),
      // 预算换算出的 max_tokens 上限只在显式下发 modelRouter 时生效（不改变默认行为）
      ...(modelRouter ? { max_tokens: maxTokens } : {}),
      tool_choice: { type: "function", function: { name: "generate_research_data" } }
    });

    // 调用所选 provider 的 chat/completions；失败时按 enableFallback 决定是否回退 gateway
    const callChatCompletions = async (baseUrl: string, apiKey: string, model: string): Promise<unknown> => {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildChatBody(model)),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI provider error (${baseUrl}):`, response.status, errorText);
        throw new Error(`AI provider error: ${response.status}`, { cause: response.status });
      }
      return await response.json();
    };

    let data: unknown;
    try {
      data = await callChatCompletions(effectiveBaseUrl, effectiveApiKey, resolvedModel);
    } catch (err) {
      // enableFallback：主 provider 失败时用原始 aiModel 回退到默认 gateway
      const status = err instanceof Error && typeof err.cause === 'number' ? err.cause : 0;
      if (modelRouter?.enableFallback && provider !== 'local') {
        console.warn(`Primary provider (${provider}) failed, falling back to gateway:`, err);
        try {
          data = await callChatCompletions(
            AI_BASE_URL,
            AI_API_KEY,
            aiModel || Deno.env.get('AI_MODEL') || 'google/gemini-2.5-flash',
          );
        } catch (fallbackErr) {
          console.error('Gateway fallback also failed:', fallbackErr);
          if (status === 429 || (fallbackErr instanceof Error && typeof fallbackErr.cause === 'number' && fallbackErr.cause === 429)) {
            return new Response(JSON.stringify({ error: "Rate limits exceeded. Please try again later." }), {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          if (status === 402 || (fallbackErr instanceof Error && typeof fallbackErr.cause === 'number' && fallbackErr.cause === 402)) {
            return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }), {
              status: 402,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          throw new Error(`AI gateway error: ${fallbackErr instanceof Error ? fallbackErr.message : fallbackErr}`);
        }
      } else {
        if (status === 429) {
          console.error('Rate limit exceeded');
          return new Response(JSON.stringify({ error: "Rate limits exceeded. Please try again later." }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (status === 402) {
          console.error('Payment required');
          return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw err;
      }
    }
    console.log('AI response received:', data);

    // Extract grounding metadata (citations from Google Search)
    const groundingMetadata = data.choices?.[0]?.message?.grounding_metadata;
    const groundingSources = groundingMetadata?.search_entry_point?.rendered_content || 
                            groundingMetadata?.grounding_supports?.map((s: { segment?: { text?: string }; source?: { uri?: string; title?: string } }) => ({
                              url: s.segment?.text || s.source?.uri,
                              title: s.source?.title
                            })) || [];
    
    console.log('Grounding sources:', groundingSources);

    // Extract structured data from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const researchItems = JSON.parse(toolCall.function.arguments).items;

    // Transform to match the expected interface and enrich with grounding citations
    const formattedData: ResearchDataItem[] = researchItems.map((item: { source?: string; title?: string; [key: string]: unknown }, index: number) => {
      // If the item doesn't have a source, try to use grounding sources
      let source = item.source;
      if (!source && groundingSources.length > index) {
        const groundingSource = groundingSources[index];
        source = groundingSource.title || groundingSource.url || 'Google Search';
      }
      
      return {
        id: `${stepType}-${Date.now()}-${index}`,
        title: item.title,
        content: item.content,
        source: source || 'Research Analysis',
        confidence: item.confidence || undefined,
        timestamp: new Date().toISOString(),
      };
    });

    console.log('Formatted research data with citations:', formattedData);

    return new Response(JSON.stringify(formattedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in research-step function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to generate research data'
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

