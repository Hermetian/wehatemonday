import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { Client, RunTree } from 'langsmith';

interface ProcessedTicketData {
  id: string;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: string;
  tags: string[];
  created_by_id: string;
}

interface SimilarMessage {
  content: string;
  is_internal: boolean;
  ticket_id: string;
  created_by_id: string;
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

interface ChangeAnalysis {
  type: string;
  changes: string[];
}

interface Example {
  original: string;
  improved: string;
  changes: ChangeAnalysis;
  feedback?: string;
}

interface TicketChanges {
  changes: string[];
  type: string;
  details?: Record<string, unknown>;
}

const SYSTEM_TEMPLATE = `You are a helpful assistant that processes marketplace conversations. Given a conversation, you will:

1. Create a title by combining the customer's name with a short product description (e.g., "John Smith / 3Br2Ba")
2. Format the conversation with "Buyer:" and "Seller:" prefixes, intelligently determining who is who based on context
3. Extract product details as tags
4. Assess the customer's interest level

You should be able to identify speakers even if the conversation format varies. Common patterns include:
- Names followed by messages (e.g., "John: Hello" or "John Smith Hello")
- Platform-specific formats (e.g., "You sent", "Agent:", "Customer wrote:")
- Timestamps or metadata mixed with messages
- Messages without explicit speaker labels but clear from context

Rules for speaker identification:
- The buyer is typically asking questions about the property or showing interest
- The seller/agent is typically answering questions or providing property details
- Messages starting with "You" or similar self-references are typically from the seller
- Look for patterns in the conversation flow to identify roles even without explicit labels

Format your response as JSON with these fields:
- title: Customer's name + short product description
- description: The formatted conversation with consistent "Buyer:" and "Seller:" prefixes
- priority: Customer interest level (LOW/MEDIUM/HIGH/URGENT)
- tags: Product details (up to 3). Also include as a tag the full product name.

Example inputs and outputs:

Input 1:
Earl
Earl · 6 Beds 2 Baths House
Add
Name
Earl started this chat. View buyer profile
Earl
Earl Joseph
Is this listing still available?
Jan 23, 2025, 11:19 AM
You sent
It is
You sent
Would you like to see it
Sat 6:40 AM
Earl
Earl Joseph
Where is it located again
Sat 9:25 AM
You sent
524 Hamilton Ave, Menlo Park 94025

Output 1:
{{
  "title": "Earl Joseph / 6Br2Ba",
  "description": "Buyer: Is this listing still available?\\nSeller: It is\\nSeller: Would you like to see it\\nBuyer: Where is it located again\\nSeller: 524 Hamilton Ave, Menlo Park 94025",
  "priority": "HIGH",
  "tags": ["6_Beds_2_Baths_House", "524_Hamilton", "Menlo_Park"]
}}

Input 2:
John Smith messaged:
Hi, I saw your listing
Agent response:
Hello! Which listing are you interested in?
John Smith:
The 2 bedroom condo on Oak Street
Message from John:
Is it still available?
Response:
Yes, it's available! Would you like to schedule a viewing?

Output 2:
{{
  "title": "John Smith / 2Br Condo",
  "description": "Buyer: Hi, I saw your listing\\nSeller: Hello! Which listing are you interested in?\\nBuyer: The 2 bedroom condo on Oak Street\\nBuyer: Is it still available?\\nSeller: Yes, it's available! Would you like to schedule a viewing?",
  "priority": "MEDIUM",
  "tags": ["2_Bedroom_Condo", "Oak_Street"]
}}

Now process this conversation: {conversation}`;

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

  async processConversation(id: string): Promise<{
    original: string;
    processed: ProcessedTicketData;
    runId: string;
  }> {
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

      return {
        original: conversation.raw_content,
        processed: result,
        runId
      };
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

  private async findSimilarTickets(ticket: ProcessedTicketData): Promise<SimilarTicket[]> {
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

  private async findSimilarMessages(ticket: ProcessedTicketData): Promise<SimilarMessage[]> {
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

  private async findSellerMessages(): Promise<SimilarMessage[]> {
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

  async generateMessageSuggestion({ 
    ticket, 
    messages, 
    marketplaceConversation 
  }: {
    ticket: ProcessedTicketData;
    messages: SimilarMessage[];
    marketplaceConversation: { raw_content: string; processed_content: ProcessedTicketData; } | null;
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
Title: {ticketTitle}
Description: {ticketDescription}
Status: {ticketStatus}
Priority: {ticketPriority}
Tags: {ticketTags}

Current Conversation:
{messages}

Original Marketplace Conversation:
{marketplaceConversation}

Similar Tickets for Context:
{similarTickets}

Similar Buyer-Seller Interactions:
{similarMessages}

Seller's Communication Style Examples:
{sellerStyle}

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
          'ticketTitle',
          'ticketDescription',
          'ticketStatus',
          'ticketPriority',
          'ticketTags',
          'messages',
          'marketplaceConversation',
          'similarTickets',
          'similarMessages',
          'sellerStyle'
        ],
      });

      // Create the chain
      const chain = RunnableSequence.from([
        prompt,
        this.model,
      ]);

      // Run the chain
      const result = await chain.invoke({
        ticketTitle: ticket.title,
        ticketDescription: ticket.description,
        ticketStatus: ticket.status,
        ticketPriority: ticket.priority,
        ticketTags: ticket.tags?.join(', ') || '',
        messages: formattedMessages,
        marketplaceConversation: marketplaceConversation?.raw_content || 'No marketplace conversation available',
        similarTickets: formattedSimilarTickets || 'No similar tickets available',
        similarMessages: formattedSimilarMessages || 'No similar messages available',
        sellerStyle: formattedSellerStyle || 'No seller style examples available'
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

    const baseUrl = this.getApiUrl();
    const response = await fetch(`${baseUrl}/api/langsmith/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        runId,
        feedbackType: "suggestion_quality",
        feedback: {
          score: 1, // Always consider user feedback as high quality
          comment: feedbackText,
          value: {  // Use value instead of metadata
            similarity_score: similarity,
            changes_summary: changes,
            modification_type: changes.type
          }
        }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create feedback: ${error}`);
    }

    // Store as example since we consider all user feedback valuable
    await this.storeAsExample({
      original: originalSuggestion,
      improved: finalMessage,
      changes,
      feedback: feedbackText
    });
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity implementation
    const set1 = new Set(text1.toLowerCase().split(/\s+/));
    const set2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  private analyzeChanges(original: string, final: string): ChangeAnalysis {
    const changes: string[] = [];
    
    // Compare lengths
    if (final.length !== original.length) {
      changes.push(final.length > original.length ? 'content_added' : 'content_removed');
    }
    
    // Compare word counts
    const originalWords = original.split(/\s+/).length;
    const finalWords = final.split(/\s+/).length;
    if (finalWords !== originalWords) {
      changes.push('length_modified');
    }
    
    // Check for significant rewording (using similarity threshold)
    const similarity = this.calculateSimilarity(original, final);
    if (similarity < 0.8) {
      changes.push('significant_rewording');
    }
    
    return {
      type: changes.includes('significant_rewording') ? 'major_revision' : 'style_improvement',
      changes
    };
  }

  private getRunUrl(runId: string, projectName?: string): string {
    const baseUrl = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';
    const project = projectName || process.env.LANGSMITH_PROJECT || 'default';
    return `${baseUrl}/projects/${project}/runs/${runId}`;
  }

  private async storeAsExample(example: Example) {
    try {
      const baseUrl = this.getApiUrl();
      const response = await fetch(`${baseUrl}/api/langsmith/example`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ example }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to store example: ${error}`);
      }

      const result = await response.json();
      console.log('Trace URL:', result.traceUrl);
      
      return {
        success: true,
        traceUrl: result.traceUrl
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
      await this.langsmith.readRun(runId);
      return this.getRunUrl(runId);
    } catch (error) {
      console.error('Failed to get trace URL:', error);
      return null;
    }
  }

  async provideConversationFeedback({
    runId,
    originalProcessed,
    finalTicket,
    feedbackText
  }: {
    runId: string;
    originalProcessed: ProcessedTicketData;
    finalTicket: ProcessedTicketData;
    feedbackText?: string;
  }) {
    try {
      // Create a feedback run tree with parent run ID
      const pipeline = new RunTree({
        name: "Conversation Processing Feedback",
        run_type: "chain",
        inputs: {
          original_processed: originalProcessed
        },
        parent_run_id: runId  // Link to original run
      });
      await pipeline.postRun();

      // Create a child run for the user modification
      const modificationRun = await pipeline.createChild({
        name: "User Modification",
        run_type: "tool",
        inputs: {
          original: originalProcessed,
          feedback: feedbackText
        }
      });
      await modificationRun.postRun();

      // End the modification run with the changes
      await modificationRun.end({
        outputs: {
          modified: finalTicket,
          changes: this.analyzeTicketChanges(originalProcessed, finalTicket)
        }
      });
      await modificationRun.patchRun();

      // End the pipeline
      await pipeline.end({
        outputs: {
          final_ticket: finalTicket,
          feedback_provided: feedbackText
        }
      });
      await pipeline.patchRun();

      // Store as example in dataset
      let dataset;
      const datasetName = "conversation_examples";
      const datasets = await this.langsmith.listDatasets();
      
      for await (const d of datasets) {
        if (d.name === datasetName) {
          dataset = d;
          break;
        }
      }

      if (!dataset) {
        dataset = await this.langsmith.createDataset(datasetName, {
          description: "High quality conversation processing examples with feedback"
        });
      }

      // Store the example
      await this.langsmith.createExample(
        { original: originalProcessed },
        { improved: finalTicket },
        {
          datasetId: dataset.id,
          metadata: {
            feedback: feedbackText,
            changes: this.analyzeTicketChanges(originalProcessed, finalTicket)
          }
        }
      );

      return {
        success: true,
        traceUrl: this.getRunUrl(pipeline.id)
      };
    } catch (error) {
      console.error('Failed to store conversation feedback:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private analyzeTicketChanges(original: ProcessedTicketData, final: ProcessedTicketData): TicketChanges {
    const changes: string[] = [];
    
    if (original.title !== final.title) {
      changes.push('title_modified');
    }
    if (original.description !== final.description) {
      changes.push('description_modified');
    }
    if (original.priority !== final.priority) {
      changes.push('priority_changed');
    }
    if (JSON.stringify(original.tags.sort()) !== JSON.stringify(final.tags.sort())) {
      changes.push('tags_modified');
    }

    return {
      changes,
      type: 'ticket_modification'
    };
  }
}

export const langSmithService = new LangSmithService();
