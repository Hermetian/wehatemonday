import { createAdminClient } from '@/app/lib/auth/supabase';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { Client, Run } from 'langsmith';

interface ProcessedTicketData {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  tags: string[];
}

const SYSTEM_TEMPLATE = `You are a helpful assistant that processes marketplace conversations. Given a conversation, you will:

1. Create a title by combining the customer's name with a short product description (e.g., "John Smith / 3Br2Ba")
2. Format the conversation with "Customer:" and "Me:" prefixes
3. Extract product details as tags
4. Assess the customer's interest level

Format your response as JSON with these fields:
- title: Customer's name + short product description
- description: The formatted conversation
- priority: Customer interest level (LOW/MEDIUM/HIGH/URGENT)
- tags: Product details (up to 5)

Conversation to process: {conversation}`;

export class LangSmithService {
  private adminClient = createAdminClient(true);
  private model = new ChatOpenAI({
    modelName: 'gpt-4-turbo-preview',
    temperature: 0.2,
  });
  private langsmith: Client;

  constructor() {
    // Initialize LangSmith client
    this.langsmith = new Client({
      apiUrl: process.env.LANGSMITH_API_URL,
      apiKey: process.env.LANGSMITH_API_KEY,
    });
  }

  async processConversation(id: string): Promise<ProcessedTicketData> {
    const runId = crypto.randomUUID();
    const projectName = process.env.LANGSMITH_PROJECT || 'default';
    
    try {
      // Start a new run
      await this.langsmith.createRun({
        name: 'process_marketplace_conversation',
        run_type: 'chain',
        inputs: { conversation_id: id },
        start_time: Date.now(),
        project_name: projectName,
      });

      // Get the conversation content
      const { data: conversation, error } = await this.adminClient
        .from('marketplace_conversations')
        .select('raw_content')
        .eq('id', id)
        .single();

      if (error) {
        await this.langsmith.updateRun(runId, {
          error: error.message,
          end_time: Date.now(),
        });
        throw error;
      }

      // Process the conversation
      const result = await this.processContent(conversation.raw_content, runId);

      // Update the conversation with the processed content
      const { error: updateError } = await this.adminClient
        .from('marketplace_conversations')
        .update({
          processed_content: result,
          status: 'completed'
        })
        .eq('id', id);

      if (updateError) {
        await this.langsmith.updateRun(runId, {
          error: updateError.message,
          end_time: Date.now(),
        });
        throw updateError;
      }

      // Update run with success
      await this.langsmith.updateRun(runId, {
        outputs: { result },
        end_time: Date.now(),
      });

      return result;
    } catch (error) {
      // Update the conversation with the error
      await this.adminClient
        .from('marketplace_conversations')
        .update({
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('id', id);

      // Update run with error
      if (error instanceof Error) {
        await this.langsmith.updateRun(runId, {
          error: error.message,
          end_time: Date.now(),
        });
      }

      throw error;
    }
  }

  private async processContent(content: string, parentRunId?: string): Promise<ProcessedTicketData> {
    const runId = crypto.randomUUID();
    const projectName = process.env.LANGSMITH_PROJECT || 'default';
    
    try {
      // Create a new run for content processing
      await this.langsmith.createRun({
        name: 'process_content',
        run_type: 'chain',
        inputs: { content },
        parent_run_id: parentRunId,
        start_time: Date.now(),
        project_name: projectName,
      });

      const prompt = PromptTemplate.fromTemplate(SYSTEM_TEMPLATE);
      const outputParser = new JsonOutputParser<ProcessedTicketData>();

      const chain = RunnableSequence.from([
        prompt,
        this.model,
        outputParser,
      ]);

      // Run the chain with tracing
      const result = await chain.invoke({
        conversation: content
      }, {
        callbacks: [{
          handleLLMEnd: async (output) => {
            await this.langsmith.createRun({
              name: 'llm_completion',
              run_type: 'llm',
              inputs: { prompt: output.generations[0][0].text },
              outputs: { completion: output.generations[0][0].text },
              parent_run_id: runId,
              start_time: Date.now(),
              end_time: Date.now(),
              project_name: projectName,
            });
          }
        }]
      });

      // Post-process the result
      const processedResult = {
        ...result,
        priority: this.validatePriority(result.priority),
        tags: this.cleanTags(result.tags)
      };

      // Update run with success
      await this.langsmith.updateRun(runId, {
        outputs: { result: processedResult },
        end_time: Date.now(),
      });

      return processedResult;
    } catch (error) {
      console.error('Error processing content:', error);

      // Update run with error
      if (error instanceof Error) {
        await this.langsmith.updateRun(runId, {
          error: error.message,
          end_time: Date.now(),
        });
      }

      throw error;
    }
  }

  private validatePriority(priority: string): ProcessedTicketData['priority'] {
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    const normalizedPriority = priority.toUpperCase();
    return validPriorities.includes(normalizedPriority) ? normalizedPriority as ProcessedTicketData['priority'] : 'MEDIUM';
  }

  private cleanTags(tags: string[]): string[] {
    return tags
      .filter(tag => tag && typeof tag === 'string')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
      .slice(0, 5);
  }

  async createRun(params: {
    name: string;
    inputs: Record<string, unknown>;
    runId?: string;
    parentRunId?: string;
  }): Promise<{ runId: string }> {
    const { data, error } = await this.adminClient
      .from('langsmith_runs')
      .insert({
        run_id: params.runId || crypto.randomUUID(),
        name: params.name,
        inputs: params.inputs,
        parent_run_id: params.parentRunId,
      })
      .select('run_id')
      .single();

    if (error) {
      throw error;
    }

    return { runId: data.run_id };
  }

  async generateMessageSuggestion({ ticket, messages, marketplaceConversation }: {
    ticket: any;
    messages: any[];
    marketplaceConversation: { raw_content: string; processed_content: any; } | null;
  }): Promise<string> {
    const runId = crypto.randomUUID();
    const projectName = process.env.LANGSMITH_PROJECT || 'default';

    try {
      // Start a new run
      await this.langsmith.createRun({
        name: 'generate_message_suggestion',
        run_type: 'chain',
        inputs: { ticket_id: ticket.id },
        start_time: Date.now(),
        project_name: projectName,
      });

      // Create the prompt template
      const template = `You are a helpful customer service agent. Based on the following context, suggest a response to the customer.

Ticket Information:
Title: {title}
Description: {description}
Status: {status}
Priority: {priority}
Tags: {tags}

Previous Messages:
{messages}

Original Marketplace Conversation:
{marketplace_conversation}

Generate a professional, helpful response that:
1. Addresses any questions or concerns
2. Provides relevant information
3. Maintains a friendly and professional tone
4. Is concise but comprehensive
5. Includes any necessary follow-up questions

Response:`;

      const prompt = new PromptTemplate({
        template,
        inputVariables: ['title', 'description', 'status', 'priority', 'tags', 'messages', 'marketplace_conversation'],
      });

      // Format messages for the prompt
      const formattedMessages = messages
        .map(m => `${m.is_internal ? '[INTERNAL] ' : ''}${m.content}`)
        .join('\n\n');

      // Create the chain
      const chain = RunnableSequence.from([
        prompt,
        this.model,
      ]);

      // Run the chain
      const result = await chain.invoke({
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        tags: ticket.tags?.join(', ') || '',
        messages: formattedMessages,
        marketplace_conversation: marketplaceConversation?.raw_content || 'No marketplace conversation available',
      });

      // Update run with success
      await this.langsmith.updateRun(runId, {
        outputs: { result },
        end_time: Date.now(),
      });

      // Convert the AI message to string
      const messageContent = typeof result === 'string' 
        ? result 
        : 'content' in result 
          ? typeof result.content === 'string' 
            ? result.content 
            : Array.isArray(result.content) 
              ? result.content.map(part => 
                  typeof part === 'string' ? part : 'text' in part ? part.text : ''
                ).join('')
              : String(result.content)
          : String(result);

      return messageContent;
    } catch (error) {
      // Update run with error
      if (error instanceof Error) {
        await this.langsmith.updateRun(runId, {
          error: error.message,
          end_time: Date.now(),
        });
      }

      throw error;
    }
  }
}

export const langSmithService = new LangSmithService();
