
import React, { useState } from 'react';

interface AuthFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  type: 'login' | 'signup';
}

const AuthForm: React.FC<AuthFormProps> = ({ onSubmit, type }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError('Authentication failed');
    }
    setLoading(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 bg-gray-dark rounded-lg shadow-lg p-8 w-full max-w-md mx-auto"
    >
      <h2 className="text-2xl font-bold text-white text-center mb-4">
        {type === 'login' ? '🔑 Login to Your Account' : '📝 Create a New Account'}
      </h2>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-light mb-1">
          👤 Email
        </label>
        <input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full p-3 bg-gray-medium rounded-lg border-2 border-gray-dark focus:border-brand-primary focus:ring-brand-primary focus:outline-none transition-colors mb-2 text-white"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-light mb-1">
          🔒 Password
        </label>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full p-3 bg-gray-medium rounded-lg border-2 border-gray-dark focus:border-brand-primary focus:ring-brand-primary focus:outline-none transition-colors mb-2 text-white"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-6 bg-brand-primary hover:bg-brand-secondary text-white font-bold rounded-lg transition-all duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100"
      >
        {loading
          ? '⏳ Please wait...'
          : type === 'login'
            ? '🔑 Login'
            : '📝 Sign Up'}
      </button>
      {error && <div className="text-red-500 text-center mt-2">{error}</div>}
    </form>
  );
};

export default AuthForm;