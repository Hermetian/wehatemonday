import { createAdminClient } from '@/app/lib/auth/supabase';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { JsonOutputParser } from '@langchain/core/output_parsers';

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

  async processConversation(id: string): Promise<ProcessedTicketData> {
    try {
      // Get the conversation content
      const { data: conversation, error } = await this.adminClient
        .from('marketplace_conversations')
        .select('raw_content')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      // Process the conversation
      const result = await this.processContent(conversation.raw_content);

      // Update the conversation with the processed content
      const { error: updateError } = await this.adminClient
        .from('marketplace_conversations')
        .update({
          processed_content: result,
          status: 'completed'
        })
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }

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

      throw error;
    }
  }

  private async processContent(content: string): Promise<ProcessedTicketData> {
    try {
      const prompt = PromptTemplate.fromTemplate(SYSTEM_TEMPLATE);
      const outputParser = new JsonOutputParser<ProcessedTicketData>();

      const chain = RunnableSequence.from([
        prompt,
        this.model,
        outputParser,
      ]);

      const result = await chain.invoke({
        conversation: content
      });

      // Post-process the result
      return {
        ...result,
        priority: this.validatePriority(result.priority),
        tags: this.cleanTags(result.tags)
      };
    } catch (error) {
      console.error('Error processing content:', error);
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
}

export const langSmithService = new LangSmithService();
