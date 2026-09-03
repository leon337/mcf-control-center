type BaselineFrameProps = {
  title: string;
  src: string;
  notice: string;
};

export function BaselineFrame({ title, src, notice }: BaselineFrameProps) {
  return (
    <main className="baseline-shell">
      <header className="baseline-banner">
        <strong>{title}</strong>
        <span>{notice}</span>
      </header>
      <iframe className="baseline-frame" src={src} title={title} />
    </main>
  );
}
