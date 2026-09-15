import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'so';

interface Translations {
  [key: string]: {
    en: string;
    so: string;
  };
}

const translations: Translations = {
  enterPhoneNumber: {
    en: 'Enter your phone number',
    so: 'Geli lambarkaga telefoonka',
  },
  sendCode: {
    en: 'Send code',
    so: 'Dir koodka',
  },
  verifyCode: {
    en: 'Verify code',
    so: 'Xaqiiji koodka',
  },
  resendCode: {
    en: 'Resend Code',
    so: 'Dib u dir koodka',
  },
  changeNumber: {
    en: 'Change Number',
    so: 'Badal lambarka',
  },
  selectProvider: {
    en: 'Select your provider',
    so: 'Dooro bixiyahaaga',
  },
  dataPackages: {
    en: 'Data Packages',
    so: 'Xirmada internetka',
  },
  selectPaymentMethod: {
    en: 'Choose payment method',
    so: 'Dooro habka lacag bixinta',
  },
  paymentNumber: {
    en: 'Payment number',
    so: 'Numberka lacag bixinta',
  },
  receiverNumber: {
    en: 'Number to send money to',
    so: 'Numberka lacagta lagu dirayo',
  },
  payNow: {
    en: 'Pay now',
    so: 'Bixi Hada',
  },
  paymentSuccessful: {
    en: 'Payment Successful!',
    so: 'Waa Lagu Guuleystay!',
  },
  paymentSuccessMessage: {
    en: 'Congratulations! Your data has been activated.',
    so: 'Hambalyo! Xirmadaada waa la hawlgeliyay.',
  },
  done: {
    en: 'Done',
    so: 'Mahadsanid',
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('so');

  useEffect(() => {
    const savedLanguage = localStorage.getItem('language') as Language;
    if (savedLanguage && ['en', 'so'].includes(savedLanguage)) {
      setLanguage(savedLanguage);
    }
  }, []);

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
    document.documentElement.dir = 'ltr';
  };

  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};