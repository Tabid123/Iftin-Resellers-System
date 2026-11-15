import { useEffect, useState } from 'react';

type Props = {
  logoUrl?: string | null;
  name?: string | null;
  className?: string;
  fallbackClassName?: string;
};

/**
 * A tenant's own logo is always the first choice. Never fall back to another
 * reseller's brand (the old hardcoded Najax fallback leaked across tenants).
 * A missing or broken tenant logo displays neutral initials instead.
 */
export default function TenantBrandMark({ logoUrl, name, className = '', fallbackClassName = '' }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);

  const title = name?.trim() || 'App';
  if (logoUrl?.trim() && !failed) {
    return (
      <img
        src={logoUrl}
        alt={`${title} logo`}
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }

  const initials = title.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '•';
  return (
    <span
      role="img"
      aria-label={`${title} logo ma jiro`}
      className={`inline-flex items-center justify-center bg-slate-100 text-slate-600 font-semibold select-none ${className} ${fallbackClassName}`}
    >
      {initials}
    </span>
  );
}
