import React, { useState } from 'react';

interface LoginSignupPageProps {
  isLogin?: boolean;
}

const LoginSignupPage: React.FC<LoginSignupPageProps> = ({ isLogin = true }) => {
  const [isLoginMode, setIsLoginMode] = useState(isLogin);

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding and Testimonial */}
      <div className="flex-1 bg-gradient-to-br from-blue-50 to-indigo-100 p-12 flex flex-col justify-center">
        <div className="max-w-md mx-auto">
          {/* AgentMark Logo */}
          <div className="mb-8">
            <img 
              src="https://i.imgur.com/j7nNMip.png" 
              alt="AgentMark Logo" 
              className="h-12 w-auto"
            />
          </div>

          {/* Description */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Welcome to AgentMark
            </h1>
            <p className="text-lg text-gray-600">
              The most powerful prompt representation layer for the new AI stack. 
              Built by developers, for developers.
            </p>
          </div>

          {/* Testimonial Quote */}
          <div className="mb-8">
            <blockquote className="text-lg text-gray-700 italic leading-relaxed">
              "AgentMark is, by far, the best prompt representation layer of this new stack. 
              You're the only people I've seen that take actual developer needs seriously in this regard."
            </blockquote>
          </div>

          {/* Profile Information */}
          <div className="flex items-center space-x-4">
            {/* Round placeholder image */}
            <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-gray-600 text-sm font-medium">DV</span>
            </div>
            
            {/* Profile details */}
            <div>
              <div className="font-semibold text-gray-900">Dominic Vinyard</div>
              <div className="text-sm text-gray-600">AI Designer</div>
              <div className="text-sm text-gray-500">San Francisco, CA</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Authentication Form */}
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="w-full max-w-md">
          {/* Toggle between Login and Signup */}
          <div className="mb-8">
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setIsLoginMode(true)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  isLoginMode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setIsLoginMode(false)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  !isLoginMode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Sign Up
              </button>
            </div>
          </div>

          {/* Form Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {isLoginMode ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-gray-600 mt-2">
              {isLoginMode 
                ? 'Sign in to your account to continue' 
                : 'Get started with AgentMark today'
              }
            </p>
          </div>

          {/* Authentication Form */}
          <form className="space-y-4">
            {!isLoginMode && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter your full name"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter your password"
              />
            </div>

            {!isLoginMode && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Confirm your password"
                />
              </div>
            )}

            {isLoginMode && (
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-600">Remember me</span>
                </label>
                <a href="#" className="text-sm text-indigo-600 hover:text-indigo-500">
                  Forgot password?
                </a>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors font-medium"
            >
              {isLoginMode ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Additional Links */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {isLoginMode ? "Don't have an account?" : "Already have an account?"}{' '}
              <button
                onClick={() => setIsLoginMode(!isLoginMode)}
                className="text-indigo-600 hover:text-indigo-500 font-medium"
              >
                {isLoginMode ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginSignupPage;