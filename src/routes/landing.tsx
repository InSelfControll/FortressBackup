import React from 'react';
import { ShieldCheck, Server, HardDrive, Zap, Lock, Globe, ChevronRight } from 'lucide-react';
import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/landing')({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="relative border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-600">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Fortress</h1>
                <p className="text-xs text-slate-400">Enterprise Backup Orchestrator</p>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-slate-300 hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="text-slate-300 hover:text-white transition-colors">How it Works</a>
              <a href="#pricing" className="text-slate-300 hover:text-white transition-colors">Documentation</a>
            </nav>
            <Link 
              to="/dashboard" 
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              Get Started
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 py-24 md:py-32">
        <div className="max-w-7xl mx-auto text-center">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-full blur-3xl"></div>
          <div className="relative">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
              Enterprise Backup
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                Orchestrated
              </span>
            </h1>
            <p className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto leading-relaxed">
              Fortress provides a unified, secure interface for managing disparate backup engines including 
              <strong> BorgBackup</strong>, <strong>Restic</strong>, <strong>Rsync</strong>, and <strong>Rclone</strong>. 
              Deploy tools automatically, manage schedules, and ensure data resilience across your infrastructure.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link 
                to="/dashboard" 
                className="bg-indigo-600 text-white px-8 py-4 rounded-xl hover:bg-indigo-700 transition-all transform hover:scale-105 flex items-center justify-center gap-2 text-lg font-semibold"
              >
                <ShieldCheck className="w-5 h-5" />
                Start Free
              </Link>
              <button className="border border-slate-600 text-slate-300 px-8 py-4 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 text-lg">
                <Globe className="w-5 h-5" />
                View Demo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-6 py-24 bg-slate-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Why Choose Fortress?</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Modern infrastructure demands modern backup solutions. Fortress delivers enterprise-grade features with simplicity.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-700/50 hover:border-indigo-500/50 transition-all">
              <div className="p-3 bg-indigo-600 rounded-xl w-fit mb-6">
                <Server className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Multi-Engine Support</h3>
              <p className="text-slate-400 leading-relaxed">
                Support for BorgBackup, Restic, Rsync, and Rclone with unified management. 
                Choose the right tool for each workload without complexity.
              </p>
            </div>

            <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-700/50 hover:border-indigo-500/50 transition-all">
              <div className="p-3 bg-purple-600 rounded-xl w-fit mb-6">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">One-Click Deployment</h3>
              <p className="text-slate-400 leading-relaxed">
                Automatically detect remote OS and install required backup tools with a single click. 
                No manual setup or SSH configuration headaches.
              </p>
            </div>

            <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-700/50 hover:border-indigo-500/50 transition-all">
              <div className="p-3 bg-green-600 rounded-xl w-fit mb-6">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Enterprise Security</h3>
              <p className="text-slate-400 leading-relaxed">
                End-to-end encryption, SSO integration, role-based access control, 
                and audit logging for compliance requirements.
              </p>
            </div>

            <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-700/50 hover:border-indigo-500/50 transition-all">
              <div className="p-3 bg-blue-600 rounded-xl w-fit mb-6">
                <HardDrive className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Cloud Integration</h3>
              <p className="text-slate-400 leading-relaxed">
                Native support for S3, Google Drive, OneDrive, and more. 
                Backup to anywhere with Rclone integration.
              </p>
            </div>

            <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-700/50 hover:border-indigo-500/50 transition-all">
              <div className="p-3 bg-yellow-600 rounded-xl w-fit mb-6">
                <Globe className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Cross-Platform</h3>
              <p className="text-slate-400 leading-relaxed">
                Runs on Linux, macOS, and Windows with container support. 
                Deploy anywhere your infrastructure lives.
              </p>
            </div>

            <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-700/50 hover:border-indigo-500/50 transition-all">
              <div className="p-3 bg-red-600 rounded-xl w-fit mb-6">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">AI-Assisted</h3>
              <p className="text-slate-400 leading-relaxed">
                Optional AI integration with Gemini and OpenAI for intelligent backup scheduling 
                and anomaly detection.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-24 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Secure Your Data?
          </h2>
          <p className="text-xl text-indigo-100 mb-8">
            Join thousands of organizations trusting Fortress with their critical infrastructure.
          </p>
          <Link 
            to="/dashboard" 
            className="bg-white text-indigo-600 px-8 py-4 rounded-xl hover:bg-slate-100 transition-all transform hover:scale-105 inline-flex items-center gap-2 text-lg font-semibold"
          >
            <ShieldCheck className="w-5 h-5" />
            Start Your Backup Journey
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-indigo-600">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white">Fortress</h3>
              </div>
              <p className="text-slate-400">
                Enterprise-grade backup orchestration for modern infrastructure.
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">API</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">GitHub</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Community</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Terms</a></li>
                <li><a href="#" className="text-slate-400 hover:text-white transition-colors">License</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-slate-800 mt-8 pt-8 text-center">
            <p className="text-slate-400">
              © 2024 Fortress. Open source and built with ❤️ for data resilience.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}