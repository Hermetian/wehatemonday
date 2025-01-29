import React, { useState } from 'react';
import { Role } from '@/app/types/auth';

interface TerminalProps {
  userRole?: Role;
}

const TEST_USER_API_TEMPLATE = {
  userCount: 5,
  email: [
    { value: "test@example.com", weight: 1 },
    { value: "demo@example.com", weight: 9 }
  ],
  name: [
    { value: "Test User", weight: 1 },
    { value: "Demo User", weight: 1 }
  ],
  role: [
    { value: 'CUSTOMER', weight: 8 },
    { value: 'AGENT', weight: 2 }
  ],
  duration: 48,
  flags: [
    [
      { value: "premium", weight: 1 },
      { value: "basic", weight: 3 }
    ]
  ]
};

const TEST_TICKET_API_TEMPLATE = {
  ticketCount: 5,
  originatingRole: [
    { value: 'CUSTOMER', weight: 8 },
    { value: 'AGENT', weight: 2 }
  ],
  assignedRole: [
    { value: 'AGENT', weight: 8 },
    { value: 'MANAGER', weight: 2 }
  ],
  status: [
    { value: "OPEN", weight: 6 },
    { value: "IN_PROGRESS", weight: 3 },
    { value: "CLOSED", weight: 1 }
  ],
  priority: [
    { value: "LOW", weight: 2 },
    { value: "MEDIUM", weight: 5 },
    { value: "HIGH", weight: 3 }
  ],
  tags: [
    [
      { value: "bug", weight: 3 },
      { value: "feature", weight: 2 },
      { value: "support", weight: 5 }
    ]
  ],
  duration: 48
};

const Terminal: React.FC<TerminalProps> = ({ userRole }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'users' | 'tickets'>('users');

  const handleTestButton = async () => {
    if (!query) {
      // If terminal is empty, populate with template
      setQuery(JSON.stringify(
        mode === 'users' ? TEST_USER_API_TEMPLATE : TEST_TICKET_API_TEMPLATE,
        null,
        2
      ));
      return;
    }

    // If terminal has content, send as API call
    setIsLoading(true);
    try {
      const result = await fetch(`/api/test/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: query,
      });
      const data = await result.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      setResponse(error instanceof Error ? error.message : `Error creating test ${mode}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuerySubmit = async () => {
    setIsLoading(true);
    try {
      const result = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      const data = await result.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      setResponse(error instanceof Error ? error.message : 'Error executing query');
    } finally {
      setIsLoading(false);
    }
  };

  const clearTerminal = () => {
    setQuery('');
    setResponse('');
  };

  return (
    <div className="bg-gray-950 text-gray-100 p-4 rounded-lg border border-gray-800">
      {userRole === 'ADMIN' && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setMode('users'); clearTerminal(); }}
            className={`px-4 py-1 rounded transition-colors ${
              mode === 'users' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Test Users
          </button>
          <button
            onClick={() => { setMode('tickets'); clearTerminal(); }}
            className={`px-4 py-1 rounded transition-colors ${
              mode === 'tickets' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Test Tickets
          </button>
        </div>
      )}
      <div className="flex gap-2 mb-2">
        {userRole === 'ADMIN' && (
          <button
            onClick={handleTestButton}
            className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-4 rounded transition-colors"
            disabled={isLoading}
          >
            {!query 
              ? `Generate Test ${mode === 'users' ? 'Users' : 'Tickets'}`
              : `Create Test ${mode === 'users' ? 'Users' : 'Tickets'}`
            }
          </button>
        )}
        <button
          onClick={handleQuerySubmit}
          className="bg-green-600 hover:bg-green-700 text-white py-1 px-4 rounded transition-colors"
          disabled={isLoading}
        >
          Execute Query
        </button>
        <button
          onClick={clearTerminal}
          className="bg-gray-700 hover:bg-gray-600 text-white py-1 px-4 rounded transition-colors"
          disabled={isLoading}
        >
          Clear
        </button>
      </div>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter your query here..."
        className="w-full h-64 bg-gray-900 text-gray-100 p-2 rounded font-mono border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      <pre className="mt-4 bg-gray-900 p-2 rounded overflow-auto font-mono border border-gray-800 max-h-64">
        {isLoading ? 'Loading...' : response}
      </pre>
    </div>
  );
};

export default Terminal; 