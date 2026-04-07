import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * 避免运行时异常导致整页空白（微信内置浏览器里更常见）；字体/脚本失败时至少可见提示。
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('[RootErrorBoundary]', error, info.componentStack);
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background px-4 py-12 text-center text-foreground">
          <p className="font-display font-semibold text-destructive">页面加载出错</p>
          <p className="mt-3 max-w-md mx-auto text-sm text-muted-foreground leading-relaxed">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="mt-6 rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-organic-sm transition duration-300 ease-out hover:shadow-[0_6px_24px_-4px_rgba(93,112,82,0.25)] active:scale-95"
            onClick={() => window.location.reload()}
          >
            点击刷新
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
