import { NextResponse } from 'next/server';
import { Client, RunTree } from 'langsmith';

const langsmith = new Client({
  apiUrl: process.env.LANGSMITH_API_URL,
  apiKey: process.env.LANGSMITH_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { example } = await request.json();

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
    const datasets = await langsmith.listDatasets();
    
    for await (const d of datasets) {
      if (d.name === datasetName) {
        dataset = d;
        break;
      }
    }

    if (!dataset) {
      dataset = await langsmith.createDataset(datasetName, {
        description: "High quality suggestion examples with feedback"
      });
    }

    // Store the example in the dataset
    await langsmith.createExample(
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
    const baseUrl = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';
    const project = process.env.LANGSMITH_PROJECT || 'default';
    const traceUrl = `${baseUrl}/projects/${project}/runs/${pipelineRunId}`;
    
    return NextResponse.json({
      success: true,
      traceUrl
    });
  } catch (error) {
    console.error('Failed to store example:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 