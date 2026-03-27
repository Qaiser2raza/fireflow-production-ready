import { useState } from 'react';

export const LoginDebugTest = () => {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testLogin = async (pin: string) => {
    setLoading(true);
    setResult(`Testing PIN ${pin}...`);
    
    try {
      const url = 'http://localhost:3001/api/auth/login';
      const payload = { pin };
      
      console.log('📤 Sending request to:', url);
      console.log('📦 Payload:', JSON.stringify(payload));
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log('📥 Response status:', res.status);
      const data = await res.json();
      console.log('📥 Response data:', data);

      if (res.ok) {
        setResult(`✅ SUCCESS: ${data.staff?.name || 'User'}`);
      } else {
        setResult(`❌ FAILED: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('❌ Fetch error:', errMsg);
      setResult(`❌ ERROR: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', border: '1px solid #ccc' }}>
      <h3>🧪 Login Debug Test</h3>
      <div style={{ marginBottom: '10px' }}>
        {['0000', '1111', '2222'].map(pin => (
          <button 
            key={pin}
            onClick={() => testLogin(pin)}
            disabled={loading}
            style={{ marginRight: '5px', padding: '5px 10px' }}
          >
            Test PIN {pin}
          </button>
        ))}
      </div>
      <pre style={{ 
        background: '#f0f0f0', 
        padding: '10px', 
        borderRadius: '4px',
        minHeight: '50px'
      }}>
        {result}
      </pre>
    </div>
  );
};
