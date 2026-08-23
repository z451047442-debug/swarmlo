import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResearchRequest {
  goal: string;
  config?: {
    parameters?: {
      maxSources?: number;
      minConfidence?: number;
      maxSteps?: number;
      timeout?: number;
      parallelAgents?: number;
    };
    filters?: {
      sourceTypes?: string[];
      excludeDomains?: string[];
      dateRange?: string;
    };
    researchGuidance?: {
      timeframe?: string;
      depth?: string;
      perspective?: string;
      focusAreas?: string[];
    };
    goapConfig?: {
      enableReplanning?: boolean;
      executionMode?: string;
      costOptimization?: boolean;
      parallelExecution?: boolean;
    };
    prompts?: {
      systemPrompt?: string;
    };
  };
  aiModel?: string;
  stream?: boolean;
}

interface ResearchStep {
  stepNumber: number;
  stepTitle: string;
  stepDescription: string;
  stepType: string;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AI_BASE_URL = Deno.env.get('AI_BASE_URL') ?? 'https://ai.gateway.lovable.dev/v1';
    const AI_API_KEY = Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
    if (!AI_API_KEY) {
      throw new Error('AI_API_KEY is not configured (set AI_API_KEY or LOVABLE_API_KEY)');
    }

    const { goal, config = {}, aiModel = Deno.env.get('AI_MODEL') ?? 'google/gemini-2.5-flash', stream: enableStreaming = true }: ResearchRequest = await req.json();

    if (!goal) {
      return new Response(
        JSON.stringify({ error: 'Goal is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Research API request:', { goal, aiModel, stream: enableStreaming, config });

    // Generate research steps based on the goal
    const steps: ResearchStep[] = [
      { stepNumber: 1, stepTitle: 'Initial Research', stepDescription: 'Gathering preliminary information', stepType: '1' },
      { stepNumber: 2, stepTitle: 'Deep Analysis', stepDescription: 'Analyzing collected data in depth', stepType: '2' },
      { stepNumber: 3, stepTitle: 'Source Validation', stepDescription: 'Verifying sources and cross-referencing', stepType: '3' },
      { stepNumber: 4, stepTitle: 'Pattern Recognition', stepDescription: 'Identifying key patterns and trends', stepType: '4' },
      { stepNumber: 5, stepTitle: 'Synthesis', stepDescription: 'Synthesizing findings into coherent insights', stepType: '5' },
      { stepNumber: 6, stepTitle: 'Insight Generation', stepDescription: 'Generating actionable insights', stepType: '6' },
      { stepNumber: 7, stepTitle: 'Verification', stepDescription: 'Cross-checking findings and ensuring accuracy', stepType: '7' },
      { stepNumber: 8, stepTitle: 'Final Recommendations', stepDescription: 'Providing final recommendations based on research', stepType: 'final-report' },
    ];

    const maxSteps = config.parameters?.maxSteps || 8;
    const researchSteps = steps.slice(0, Math.min(maxSteps, steps.length));

    if (!enableStreaming) {
      // Non-streaming response
      const allFindings = [];
      
      for (const step of researchSteps) {
        const stepResult = await executeResearchStep(step, goal, config, aiModel, AI_API_KEY);
        allFindings.push(stepResult);
      }

      return new Response(
        JSON.stringify({
          goal,
          config,
          totalSteps: researchSteps.length,
          findings: allFindings,
          completed: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Streaming response using SSE
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'init',
            goal,
            totalSteps: researchSteps.length,
            config
          })}\n\n`));

          // Execute research steps
          for (let i = 0; i < researchSteps.length; i++) {
            const step = researchSteps[i];
            
            // Send step start event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'step_start',
              stepNumber: step.stepNumber,
              stepTitle: step.stepTitle,
              stepDescription: step.stepDescription,
              progress: ((i / researchSteps.length) * 100).toFixed(1)
            })}\n\n`));

            // Execute step
            const stepResult = await executeResearchStep(step, goal, config, aiModel, AI_API_KEY);

            // Send step complete event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'step_complete',
              stepNumber: step.stepNumber,
              data: stepResult,
              progress: (((i + 1) / researchSteps.length) * 100).toFixed(1)
            })}\n\n`));
          }

          // Send completion event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            message: 'Research completed successfully'
          })}\n\n`));

          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: errorMessage
          })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(responseStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Research API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

if (import.meta.main) {
  serve(handler);
}

async function executeResearchStep(
  step: ResearchStep,
  goal: string,
  config: any,
  aiModel: string,
  apiKey: string
) {
  const AI_BASE_URL = Deno.env.get('AI_BASE_URL') ?? 'https://ai.gateway.lovable.dev/v1';
  const systemPrompt = config.prompts?.systemPrompt || buildSystemPrompt(config);
  const userPrompt = buildUserPrompt(step, goal, config);

  console.log(`Executing step ${step.stepNumber}: ${step.stepTitle}`);

  const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000,
      tools: step.stepType === 'final-report' ? [
        {
          type: 'function',
          function: {
            name: 'generate_research_report',
            description: 'Generate structured research findings with citations',
            parameters: {
              type: 'object',
              properties: {
                findings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      content: { type: 'string' },
                      source: { type: 'string' },
                      confidence: { type: 'number' }
                    },
                    required: ['title', 'content', 'source', 'confidence']
                  }
                }
              },
              required: ['findings']
            }
          }
        }
      ] : undefined,
      tool_choice: step.stepType === 'final-report' ? { type: 'function', function: { name: 'generate_research_report' } } : undefined
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`AI API error (${response.status}):`, errorText);
    throw new Error(`AI API request failed: ${response.status}`);
  }

  const data = await response.json();
  console.log(`Step ${step.stepNumber} completed`);

  // Extract findings from tool call if present
  if (data.choices?.[0]?.message?.tool_calls?.[0]) {
    const toolCall = data.choices[0].message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);
    return {
      stepNumber: step.stepNumber,
      stepTitle: step.stepTitle,
      findings: args.findings,
      timestamp: new Date().toISOString()
    };
  }

  // Return plain text response
  return {
    stepNumber: step.stepNumber,
    stepTitle: step.stepTitle,
    content: data.choices?.[0]?.message?.content || '',
    timestamp: new Date().toISOString()
  };
}

function buildSystemPrompt(config: any): string {
  const depth = config.researchGuidance?.depth || 'moderate';
  const perspective = config.researchGuidance?.perspective || 'balanced';
  const timeframe = config.researchGuidance?.timeframe || 'recent';

  let prompt = `你是一名高级 AI 研究助理，擅长全面、系统化的研究。`;

  if (depth === 'deep') {
    prompt += ` 进行深入、严谨的调查，配合详尽的分析与交叉验证。`;
  } else if (depth === 'surface') {
    prompt += ` 提供高层次的概述与关键要点。`;
  } else {
    prompt += ` 在分析的深度与广度之间保持平衡。`;
  }

  if (perspective === 'academic') {
    prompt += ` 采用学术视角，优先使用同行评审来源并保持学术严谨性。`;
  } else if (perspective === 'business') {
    prompt += ` 聚焦实际的商业影响与可执行的洞察。`;
  } else if (perspective === 'technical') {
    prompt += ` 强调技术细节、方法论与实现层面的考量。`;
  }

  if (timeframe === 'recent') {
    prompt += ` 优先采用最新的信息与进展。`;
  } else if (timeframe === 'historical') {
    prompt += ` 包含历史背景与长期趋势。`;
  }

  const focusAreas = config.researchGuidance?.focusAreas;
  if (focusAreas && focusAreas.length > 0) {
    prompt += ` 重点关注：${focusAreas.join(', ')}。`;
  }

  prompt += ` 始终为研究结果标注来源并提供置信度。请使用简体中文输出全部研究内容。`;

  return prompt;
}

function buildUserPrompt(step: ResearchStep, goal: string, config: any): string {
  let prompt = `研究目标：${goal}\n\n`;
  prompt += `当前步骤：${step.stepTitle}\n`;
  prompt += `步骤说明：${step.stepDescription}\n\n`;

  if (step.stepType === 'final-report') {
    prompt += `请基于已完成的全部研究，给出最终建议与可执行的洞察。`;
    prompt += `请提供具体、明确的建议，并附上支持性数据。`;
  } else {
    prompt += `请针对本步骤开展研究，并提供详细的研究发现。`;
  }

  const sourceTypes = config.filters?.sourceTypes;
  if (sourceTypes && sourceTypes.length > 0) {
    prompt += `\n\n首选来源类型：${sourceTypes.join(', ')}`;
  }

  const excludeDomains = config.filters?.excludeDomains;
  if (excludeDomains && excludeDomains.length > 0) {
    prompt += `\n\n排除来源：${excludeDomains.join(', ')}`;
  }

  const minConfidence = config.parameters?.minConfidence;
  if (minConfidence) {
    prompt += `\n\n最低置信度阈值：${minConfidence}%`;
  }

  return prompt;
}
