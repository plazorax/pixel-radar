import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

export default function Button({ children, icon, onClick, disabled, primary = false }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? 'bg-ink text-white hover:bg-ink/85'
          : 'border border-line-strong bg-surface text-ink hover:border-faint hover:bg-subtle'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
