import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ViewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Sekoly : affichage interrompu', error, info.componentStack); }
  render() {
    if (this.state.failed) return (
      <section className="page-panel p-6 space-y-3" role="alert">
        <h2 className="text-lg font-semibold">Cette page n’a pas pu s’afficher</h2>
        <p>Vous pouvez réessayer ou ouvrir un autre module depuis la navigation.</p>
        <button type="button" className="button button--primary" onClick={() => this.setState({ failed: false })}>Réessayer</button>
      </section>
    );
    return this.props.children;
  }
}
