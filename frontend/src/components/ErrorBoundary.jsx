import { Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <ErrorFallback
                    error={this.state.error}
                    onReset={() => this.setState({ hasError: false, error: null })}
                />
            );
        }

        return this.props.children;
    }
}

function ErrorFallback({ error, onReset }) {
    return (
        <div className="min-h-screen bg-[#060D1A] flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-[#0D1F38] border border-red-900/50 rounded-lg p-6 text-center">
                <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-red-500 text-[32px]">error</span>
                </div>

                <h1 className="text-xl font-black text-white mb-2">Something Went Wrong</h1>
                <p className="text-slate-400 text-sm mb-4">
                    An unexpected error occurred. You can try to reload the page or return to the dashboard.
                </p>

                {error && (
                    <div className="bg-[#060D1A] border border-red-900/30 rounded p-3 mb-4 text-left">
                        <p className="text-xs text-red-400 font-mono break-all">
                            {error.message || 'Unknown error'}
                        </p>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={onReset}
                        className="flex-1 px-4 py-2 bg-[#1E5FA8] hover:bg-[#164a85] text-white text-sm font-bold rounded transition-colors"
                    >
                        Try Again
                    </button>
                    <button
                        onClick={() => window.location.assign('/dashboard')}
                        className="flex-1 px-4 py-2 border border-[#1F293D] hover:border-[#1E5FA8] text-slate-300 text-sm font-bold rounded transition-colors"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ErrorBoundary;
