import React, { useState } from 'react';
import { UserRole } from '@prisma/client';

interface TerminalProps {
  userRole?: UserRole;
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
    { value: UserRole.CUSTOMER, weight: 8 },
    { value: UserRole.AGENT, weight: 2 }
  ],
  duration: 48,
  flags: [
    [
      { value: "premium", weight: 1 },
      { value: "basic", weight: 3 }
    ]
  ]
};

const Terminal: React.FC<TerminalProps> = ({ userRole }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleTestUserButton = async () => {
    if (!query) {
      // If terminal is empty, populate with template
      setQuery(JSON.stringify(TEST_USER_API_TEMPLATE, null, 2));
      return;
    }

    // If terminal has content, send as API call
    setIsLoading(true);
    try {
      const result = await fetch('/api/test/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: query,
      });
      const data = await result.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      setResponse(error instanceof Error ? error.message : 'Error creating test users');
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

  return (
    <div className="bg-gray-950 text-gray-100 p-4 rounded-lg border border-gray-800">
      <div className="flex gap-2 mb-2">
        {userRole === UserRole.ADMIN && (
          <button
            onClick={handleTestUserButton}
            className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-4 rounded transition-colors"
            disabled={isLoading}
          >
            {!query ? 'Generate Test Users' : 'Create Test Users'}
          </button>
        )}
        <button
          onClick={handleQuerySubmit}
          className="bg-green-600 hover:bg-green-700 text-white py-1 px-4 rounded transition-colors"
          disabled={isLoading}
        >
          Execute Query
        </button>
      </div>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter your query here..."
        className="w-full h-32 bg-gray-900 text-gray-100 p-2 rounded font-mono border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      <pre className="mt-4 bg-gray-900 p-2 rounded overflow-auto font-mono border border-gray-800">
        {isLoading ? 'Loading...' : response}
      </pre>
    </div>
  );
};

export default Terminal; 