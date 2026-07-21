import './Loader.scss';

interface Props {
  label?: string;
}

/** A small spinning ring, optionally with a label — for loading states. */
export function Loader({ label }: Props) {
  return (
    <div className="loader">
      <span className="loader__spinner" aria-hidden />
      {label && <span className="loader__label">{label}</span>}
    </div>
  );
}
