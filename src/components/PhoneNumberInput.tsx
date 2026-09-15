import React from 'react';
import { Phone } from 'lucide-react';
import CachedImage from '@/components/CachedImage';
import somaliaFlag from '@/assets/somalia-flag-hq.png';

export interface PhoneNumberInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hasError?: boolean;
  enterKeyHint?: 'next' | 'done';
  provider?: { name: string; logo: string } | null;
  id?: string;
}

/**
 * Shared phone number field used by every 9-digit Somali phone input so that
 * padding, keyboard type, validation and selection behaviour stay identical.
 */
const PhoneNumberInput: React.FC<PhoneNumberInputProps> = ({
  label,
  value,
  onChange,
  placeholder = '61 xxx xxxx',
  hasError = false,
  enterKeyHint = 'done',
  provider = null,
  id,
}) => {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div
        className={`flex items-stretch border-2 rounded-xl overflow-hidden bg-background shadow-sm transition-colors ${
          hasError ? 'border-destructive' : 'border-border focus-within:border-primary'
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-r border-border shrink-0">
          <img src={somaliaFlag} alt="Somalia" className="w-6 h-4 object-cover rounded-sm" />
          <span className="text-foreground font-medium">+252</span>
        </div>
        <div className="flex items-center flex-1 min-w-0 pl-3 pr-3 gap-2">
          {provider ? (
            <CachedImage
              src={provider.logo}
              alt={provider.name}
              bundledName={provider.name}
              className="w-6 h-6 rounded-full flex-shrink-0 object-scale-down"
            />
          ) : (
            <Phone className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          )}
          <input
            id={id}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="tel-national"
            enterKeyHint={enterKeyHint}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 9))}
            maxLength={9}
            className="flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-lg py-[10px] px-0"
          />
        </div>
      </div>
    </div>
  );
};

export default PhoneNumberInput;
