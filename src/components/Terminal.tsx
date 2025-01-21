import React, { useState } from 'react';

const Terminal = () => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');

  const handleQuerySubmit = async () => {
    try {
      // Replace with actual database query logic
      const result = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      const data = await result.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponse('Error executing query');
    }
  };

  return (
    <div className="terminal bg-black text-white p-4 rounded">
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter your query here..."
        className="w-full h-32 bg-gray-800 text-white p-2"
      />
      <button
        onClick={handleQuerySubmit}
        className="mt-2 bg-green-500 text-white py-1 px-4 rounded"
      >
        Execute
      </button>
      <pre className="mt-4 bg-gray-900 p-2 rounded overflow-auto">
        {response}
      </pre>
    </div>
  );
};

export default Terminal; 