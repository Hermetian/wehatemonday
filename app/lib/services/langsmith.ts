import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { Client, RunTree, type RunTreeConfig } from 'langsmith';

interface ProcessedTicketData {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  tags: string[];
}

interface SimilarMessage {
  content: string;
  is_internal: boolean;
  ticket_id: string;
}

interface SimilarTicket {
  title: string;
  description: string;
  tags: string[];
  status: string;
  priority: string;
}

interface SuggestionFeedback {
  runId: string;
  originalSuggestion: string;
  finalMessage: string;
  feedbackScore: number;
  feedbackText?: string;
}

const SYSTEM_TEMPLATE = `You are a helpful assistant that processes marketplace conversations. Given a conversation, you will:

1. Create a title by combining the customer's name with a short product description (e.g., "John Smith / 3Br2Ba")
2. Format the conversation with "Buyer:" and "Seller:" prefixes
3. Extract product details as tags
4. Assess the customer's interest level

Format your response as JSON with these fields:
- title: Customer's name + short product description
- description: The formatted conversation
- priority: Customer interest level (LOW/MEDIUM/HIGH/URGENT)
- tags: Product details (up to 3). Also include as a tag the full product name.

Example: Earl Joseph
Earl · 6 Beds 2 Baths House
Add
Name
Earl started this chat. View buyer profile
Earl
Earl Joseph
Is this listing still available?
Jan 23, 2025, 11:19 AM
You sent
It is
You sent
Would you like to see it
Sat 6:40 AM
Earl
Earl Joseph
Where is it located again
Sat 9:25 AM
You sent
524 Hamilton Ave, Menlo Park 94025
Sat 8:48 PM
Earl
Earl Joseph
Can you send me your number so we can talk and set up a time I can come see the property my name is Earl number 628 303-8938

title: Earl Joseph 6Br2Ba
description: Customer: Is this listing still available?
Seller: It is
Seller: Would you like to see it
Buyer: Where is it located again
Seller: 524 Hamilton Ave, Menlo Park 94025
Buyer: Can you send me your number so we can talk and set up a time I can come see the property my name is Earl number 628 303-8938
priority: HIGH
tags: 6_Beds_2_Baths_House, 524_Hamilton, phone_number

Reasoning: 
title: The customer's name is Earl Joseph. The product is a 6 Beds 2 Baths House, which we shorten to 6Br2Ba
description: The chat, with "You" replaced by "Seller" and "Earl or Earl Joseph" replace by "Earl"
priority: The customer actively wants to see the property. URGENT would mean they want to move quickly OR want to sign on the property. LOW would be if they're not responding much. 
tags: The full name with _ between words because this should always appear, and the fact that the customer wants to commuinicate via phone. We could add a second and third discretionary tag but there's no need.
Conversation to process: {conversation}`;

export class LangSmithService {
  private model = new ChatOpenAI({
    modelName: 'gpt-4-turbo-preview',
    temperature: 0.2,
  });
  private langsmith: Client;

  constructor() {
    this.langsmith = new Client({
      apiUrl: process.env.LANGSMITH_API_URL,
      apiKey: process.env.LANGSMITH_API_KEY,
    });
  }

  private getApiUrl(): string {
    // In production, we want to use the absolute URL
    if (typeof window !== 'undefined') {
      // We're in the browser
      return window.location.origin;
    }
    // We're on the server
    return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  }

  async processConversation(id: string): Promise<ProcessedTicketData> {
    const runId = crypto.randomUUID();
    const projectName = process.env.LANGSMITH_PROJECT || 'default';
    const baseUrl = this.getApiUrl();
    
    try {
      // Start a new run
      await this.langsmith.createRun({
        name: 'process_marketplace_conversation',
        run_type: 'chain',
        inputs: { conversation_id: id },
        start_time: Date.now(),
        project_name: projectName,
      });

      // Get the conversation content from the API
      const response = await fetch(`${baseUrl}/api/langsmith?action=getConversation&id=${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch conversation');
      }
      const conversation = await response.json();

      // Process the conversation
      const result = await this.processContent(conversation.raw_content, runId);

      // Update the conversation through the API
      const updateResponse = await fetch(`${baseUrl}/api/langsmith?action=updateConversation&id=${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processed_content: result,
          status: 'completed'
        }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update conversation');
      }

      // Update run with success
      await this.langsmith.updateRun(runId, {
        outputs: { result },
        end_time: Date.now(),
      });

      return result;
    } catch (error) {
      // Update the conversation with error through the API
      await fetch(`${baseUrl}/api/langsmith?action=updateConversation&id=${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        }),
      });

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
    const runId = params.runId || crypto.randomUUID();
    const projectName = process.env.LANGSMITH_PROJECT || 'default';

    await this.langsmith.createRun({
      id: runId,
      name: params.name,
      run_type: 'chain',
      inputs: params.inputs,
      parent_run_id: params.parentRunId,
      start_time: Date.now(),
      project_name: projectName,
    });

    return { runId };
  }

  private async findSimilarTickets(ticket: any, limit: number = 3): Promise<SimilarTicket[]> {
    try {
      const baseUrl = this.getApiUrl();
      const response = await fetch(`${baseUrl}/api/langsmith?action=similarTickets&ticketId=${ticket.id}&tags=${ticket.tags?.join(',')}`);
      const data = await response.json();
      return data.tickets || [];
    } catch (error) {
      console.error('Error finding similar tickets:', error);
      return [];
    }
  }

  private async findSimilarMessages(ticket: any, limit: number = 5): Promise<SimilarMessage[]> {
    try {
      const baseUrl = this.getApiUrl();
      const response = await fetch(`${baseUrl}/api/langsmith?action=similarMessages&ticketId=${ticket.id}&tags=${ticket.tags?.join(',')}`);
      const data = await response.json();
      return data.messages || [];
    } catch (error) {
      console.error('Error finding similar messages:', error);
      return [];
    }
  }

  private async findSellerMessages(limit: number = 10): Promise<SimilarMessage[]> {
    try {
      const baseUrl = this.getApiUrl();
      const response = await fetch(`${baseUrl}/api/langsmith?action=sellerMessages&ticketId=any`);
      const data = await response.json();
      return data.messages || [];
    } catch (error) {
      console.error('Error finding seller messages:', error);
      return [];
    }
  }

  async generateMessageSuggestion({ ticket, messages, marketplaceConversation }: {
    ticket: any;
    messages: any[];
    marketplaceConversation: { raw_content: string; processed_content: any; } | null;
  }): Promise<string> {
    const runId = crypto.randomUUID();
    const projectName = process.env.LANGSMITH_PROJECT || 'default';

    try {
      // Find similar content and seller's message style
      const [similarTickets, similarMessages, sellerMessages] = await Promise.all([
        this.findSimilarTickets(ticket),
        this.findSimilarMessages(ticket),
        this.findSellerMessages()
      ]);

      // Format current conversation messages, clearly marking seller vs buyer
      const formattedMessages = messages
        .map(m => {
          const prefix = m.is_internal ? '[INTERNAL] ' : 
                        m.created_by_id === ticket.created_by_id ? 'Buyer: ' : 'Seller: ';
          return `${prefix}${m.content}`;
        })
        .join('\n\n');

      // Format similar tickets for context
      const formattedSimilarTickets = similarTickets
        .map(t => `Title: ${t.title}\nDescription: ${t.description}\nTags: ${t.tags?.join(', ')}\nStatus: ${t.status}\nPriority: ${t.priority}`)
        .join('\n\n');

      // Format similar messages, focusing on seller responses
      const formattedSimilarMessages = similarMessages
        .filter(m => !m.is_internal)  // Only include external messages
        .map(m => `${m.content}`)
        .join('\n\n');

      // Format seller's message style examples
      const formattedSellerStyle = sellerMessages
        .map(m => `${m.content}`)
        .join('\n\n');

      // Start a new run with complete context
      await this.langsmith.createRun({
        name: 'generate_message_suggestion',
        run_type: 'chain',
        inputs: {
          ticket_id: ticket.id,
          ticket_title: ticket.title,
          ticket_description: ticket.description,
          ticket_status: ticket.status,
          ticket_priority: ticket.priority,
          ticket_tags: ticket.tags,
          message_count: messages.length,
          has_marketplace_conversation: !!marketplaceConversation,
          similar_tickets_count: similarTickets.length,
          similar_messages_count: similarMessages.length,
          seller_style_examples_count: sellerMessages.length
        },
        start_time: Date.now(),
        project_name: projectName,
      });

      // Create the prompt template
      const template = `You are a real estate agent responding to a buyer inquiry. Based on the following context, suggest a response that matches the seller's communication style.

Current Ticket Information:
Title: {title}
Description: {description}
Status: {status}
Priority: {priority}
Tags: {tags}

Current Conversation:
{messages}

Original Marketplace Conversation:
{marketplace_conversation}

Similar Tickets for Context:
{similar_tickets}

Similar Buyer-Seller Interactions:
{similar_messages}

Seller's Communication Style Examples:
{seller_style}

Based on the above context, generate a response that:
1. Matches the seller's communication style (formality, length, tone)
2. Addresses the buyer's most recent questions or concerns
3. Maintains consistency with previous responses in this conversation
4. Provides clear, specific information about the property
5. Is professional yet approachable
6. Includes relevant follow-up questions or next steps
7. Uses similar phrasing and terminology as other successful responses

Response (as the seller to the buyer):`;

      const prompt = new PromptTemplate({
        template,
        inputVariables: [
          'title',
          'description',
          'status',
          'priority',
          'tags',
          'messages',
          'marketplace_conversation',
          'similar_tickets',
          'similar_messages',
          'seller_style'
        ],
      });

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
        similar_tickets: formattedSimilarTickets || 'No similar tickets available',
        similar_messages: formattedSimilarMessages || 'No similar messages available',
        seller_style: formattedSellerStyle || 'No seller style examples available'
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

  async provideSuggestionFeedback({
    runId,
    originalSuggestion,
    finalMessage,
    feedbackText
  }: Omit<SuggestionFeedback, 'feedbackScore'>) {
    // Calculate similarity score between original and final
    const similarity = this.calculateSimilarity(originalSuggestion, finalMessage);
    
    // Analyze what changes were made
    const changes = this.analyzeChanges(originalSuggestion, finalMessage);

    await this.langsmith.createFeedback(
      runId,
      "suggestion_quality",
      {
        score: 1, // Always consider user feedback as high quality
        comment: feedbackText,
        value: {  // Use value instead of metadata
          similarity_score: similarity,
          changes_summary: changes,
          modification_type: changes.type
        }
      }
    );

    // Store as example since we consider all user feedback valuable
    await this.storeAsExample({
      original: originalSuggestion,
      improved: finalMessage,
      changes,
      feedback: feedbackText
    });
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Implement text similarity calculation
    // Could use cosine similarity of embeddings
    return 0.5; // Placeholder
  }

  private analyzeChanges(original: string, final: string): any {
    // Implement diff analysis to understand what kinds of changes were made
    // Could use diff-match-patch or similar
    return {
      type: 'style_improvement',
      changes: ['tone adjusted', 'clarity improved']
    };
  }

  private getRunUrl(runId: string, projectName?: string): string {
    const baseUrl = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';
    const project = projectName || process.env.LANGSMITH_PROJECT || 'default';
    return `${baseUrl}/projects/${project}/runs/${runId}`;
  }

  private async storeAsExample(example: any) {
    try {
      // Create a top-level run for the feedback
      const pipeline = new RunTree({
        name: "Suggestion Feedback",
        run_type: "chain",
        inputs: {
          original_suggestion: example.original
        }
      });
      await pipeline.postRun();

      // Store the run ID for URL retrieval
      const pipelineRunId = pipeline.id;

      // Create a child run for the user modification
      const modificationRun = await pipeline.createChild({
        name: "User Modification",
        run_type: "tool",
        inputs: {
          original: example.original,
          feedback: example.feedback
        }
      });
      await modificationRun.postRun();

      // End the modification run with the changes
      await modificationRun.end({
        outputs: {
          modified: example.improved,
          changes: example.changes
        }
      });
      await modificationRun.patchRun();

      // End the pipeline with the final results
      await pipeline.end({
        outputs: {
          final_message: example.improved,
          feedback_provided: example.feedback,
          changes_summary: example.changes
        }
      });
      await pipeline.patchRun();

      // Get or create the dataset for future training
      let dataset;
      const datasetName = "suggestion_examples";
      const datasets = await this.langsmith.listDatasets();
      
      for await (const d of datasets) {
        if (d.name === datasetName) {
          dataset = d;
          break;
        }
      }

      if (!dataset) {
        dataset = await this.langsmith.createDataset(datasetName, {
          description: "High quality suggestion examples with feedback"
        });
      }

      // Store the example in the dataset
      await this.langsmith.createExample(
        { original: example.original },
        { improved: example.improved },
        {
          datasetId: dataset.id,
          metadata: {
            feedback: example.feedback,
            changes: example.changes
          }
        }
      );

      // Get the trace URL
      const traceUrl = this.getRunUrl(pipelineRunId);
      console.log('Trace URL:', traceUrl);
      
      return {
        success: true,
        traceUrl
      };
    } catch (error) {
      console.error('Failed to store example:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Add a new method to get trace URL
  async getTraceUrl(runId: string): Promise<string | null> {
    try {
      const run = await this.langsmith.readRun(runId);
      return this.getRunUrl(runId);
    } catch (error) {
      console.error('Failed to get trace URL:', error);
      return null;
    }
  }
}

export const langSmithService = new LangSmithService();
