'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'hi';

interface LanguageContextType {
  lang: Language;
  toggleLang: () => void;
  t: (text: string) => string;
}

// Case-insensitive dictionary mapping English phrases to Hindi
const DICTIONARY: Record<string, string> = {
  // Navigation
  'dashboard': 'डैशबोर्ड',
  'applications': 'आवेदन',
  'evc visits': 'ईवीसी दौरे',
  'undertakings': 'वचनबद्धता',
  'documents': 'दस्तावेज़',
  'alerts': 'अलर्ट',
  'reports': 'रिपोर्ट',
  'audit': 'ऑडिट लॉग',
  'rules': 'नियम',
  'simulator': 'समय सिम्युलेटर',
  'time simulator': 'समय सिम्युलेटर',
  'sign out': 'साइन आउट',

  // Brand & Welcome
  'aicte': 'एआईसीटीई',
  'sla monitor': 'एसएलए मॉनिटर',
  'aicte national sla monitoring portal': 'एआईसीटीई राष्ट्रीय एसएलए निगरानी पोर्टल',
  'welcome, western scrutiny officer': 'स्वागत है, पश्चिमी जांच अधिकारी',
  'welcome, scrutiny officer': 'स्वागत है, जांच अधिकारी',
  'welcome, regional officer': 'स्वागत है, क्षेत्रीय अधिकारी',
  'welcome, bureau officer': 'स्वागत है, ब्यूरो अधिकारी',
  'logged in as': 'लॉग इन:',
  'scrutiny officer': 'जांच अधिकारी',
  'regional officer': 'क्षेत्रीय अधिकारी',
  'bureau officer': 'ब्यूरो अधिकारी',
  'admin': 'व्यवस्थापक (Admin)',
  'monitor real-time sla adherence, institutional compliance, and workflow progressions.': 'वास्तविक समय एसएलए अनुपालन, संस्थागत अनुपालन और वर्कफ़्लो प्रगति की निगरानी करें।',

  // Buttons & Actions
  'applications queue': 'आवेदन कतार',
  'download reports (pdf / excel)': 'रिपोर्ट डाउनलोड करें (पीडीएफ / एक्सेल)',
  'advance stage': 'चरण आगे बढ़ाएं',
  'return for deficiency': 'कमी हेतु वापस लौटाएं',
  'verify & approve': 'सत्यापित और स्वीकृत करें',
  'acknowledge': 'पावती दें (Acknowledge)',
  'search': 'खोजें',
  'verify integrity': 'सत्यता सत्यापित करें',
  'save rule': 'नियम सहेजें',
  'save chain': 'शृंखला सहेजें',
  'new application': 'नया आवेदन',
  'open': 'खोलें',
  'dismiss': 'हटाएं',

  // KPI & Dashboard Cards
  'total assigned': 'कुल आवंटित मामले',
  'overdue cases': 'समयसीमा पार मामले',
  'due today': 'आज देय',
  'due this week': 'इस सप्ताह देय',
  'open cases': 'प्रक्रियाधीन मामले',
  'overdue sla': 'समयसीमा पार एसएलए',
  'evc visits due': 'लंबित ईवीसी दौरे',
  'expired docs': 'समाप्त दस्तावेज़',
  'expiring documents': 'समाप्त होने वाले दस्तावेज़',
  'compliance rate': 'अनुपालन दर',
  'compliance health score': 'अनुपालन स्वास्थ्य स्कोर',
  'urgent case queue': 'अति-आवश्यक मामला कतार',
  'ai workload balancer': 'एआई कार्यभार संतुलन सहायक',
  'my assigned cases': 'मेरे आवंटित मामले',
  'active in workflow': 'वर्कफ़्लो में सक्रिय',
  'breached stage due_at': 'चरण की समयसीमा पार',
  'pending schedule/report': 'शेड्यूल / रिपोर्ट लंबित',
  'needs renewal upload': 'नवीनीकरण अपलोड आवश्यक',
  'within sla target': 'लक्ष्य के भीतर',

  // Statuses
  'in progress': 'प्रक्रियाधीन',
  'returned': 'लौटाया गया',
  'approved': 'स्वीकृत',
  'rejected': 'अस्वीकृत',
  'verified': 'सत्यापित',
  'pending': 'लंबित',
  'overdue': 'समयसीमा पार',
  'critical': 'गंभीर',
  'warning': 'चेतावनी',
  'good': 'उत्कृष्ट',
  'watch': 'निगरानी',
  'at risk': 'जोखिम में',
  'low': 'कम',
  'medium': 'मध्यम',
  'high': 'उच्च',

  // Advisory
  'advisory only, final decisions rest with the competent authority.': 'केवल सलाहकारी — अंतिम निर्णय सक्षम प्राधिकारी के पास सुरक्षित है।',
  'advisory only — final decisions rest with the competent authority.': 'केवल सलाहकारी — अंतिम निर्णय सक्षम प्राधिकारी के पास सुरक्षित है।',
};

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  toggleLang: () => {},
  t: (text: string) => text,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('aicte_lang') as Language;
    if (saved === 'hi' || saved === 'en') {
      setLang(saved);
    }
  }, []);

  // Live Full-page DOM Translation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const translateTree = () => {
      if (lang === 'en') {
        // Restore original English text
        document.querySelectorAll('[data-hi-orig]').forEach((el) => {
          el.textContent = el.getAttribute('data-hi-orig') || el.textContent;
          el.removeAttribute('data-hi-orig');
        });
        return;
      }

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent || ['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA'].includes(parent.tagName)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let textNode: Text | null = walker.nextNode() as Text | null;
      while (textNode) {
        const text = textNode.nodeValue?.trim();
        if (text) {
          const lower = text.toLowerCase();
          if (DICTIONARY[lower]) {
            const parent = textNode.parentElement;
            if (parent && !parent.hasAttribute('data-hi-orig')) {
              parent.setAttribute('data-hi-orig', text);
            }
            textNode.nodeValue = DICTIONARY[lower];
          }
        }
        textNode = walker.nextNode() as Text | null;
      }
    };

    // Defer DOM translation until after React initial hydration completes
    let timeoutId: NodeJS.Timeout;
    const scheduleTranslation = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        translateTree();
      }, 50);
    };

    scheduleTranslation();

    const observer = new MutationObserver(() => {
      scheduleTranslation();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [lang]);

  const toggleLang = () => {
    const next = lang === 'en' ? 'hi' : 'en';
    setLang(next);
    localStorage.setItem('aicte_lang', next);
    window.dispatchEvent(new Event('languageChange'));
  };

  const t = (text: string): string => {
    if (lang === 'hi') {
      const lower = text.toLowerCase().trim();
      if (DICTIONARY[lower]) return DICTIONARY[lower];
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
