import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Image as ImageIcon, 
  X, 
  Zap, 
  Receipt, 
  TrendingDown, 
  Info,
  ChevronDown,
  Sparkles,
  Bot,
  LineChart as LineChartIcon,
  Trash2,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { cn } from './lib/utils';
import { sendMessage, ChatMessage } from './services/geminiService';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string;
  timestamp: Date;
}

interface BillRecord {
  id: string;
  units: number;
  amount: number;
  month: string;
  timestamp: string;
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('bill_buddy_theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [language, setLanguage] = useState<'English' | 'Urdu' | 'Roman Urdu'>('Roman Urdu');

  const welcomeMessages = {
    'English': "I am **BillBuddy AI**. Please share your electricity or gas bill (text or photo), and I will explain the charges and help you save money. 😊",
    'Urdu': "میں ہوں **BillBuddy AI**۔ براہ کرم اپنا بجلی یا گیس کا بل شیئر کریں (ٹیکسٹ یا تصویر)، اور میں آپ کو چارجز سمجھاؤں گا اور پیسے بچانے میں آپ کی مدد کروں گا۔ 😊",
    'Roman Urdu': "Main hoon **BillBuddy AI**. Aap apna bijli ya gas ka bill share karein (text ya photo), aur main aapko samjhaunga ke bill kitna aaya hai aur aap apne paise kaise bacha sakte hain. 😊"
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<{data: string, mimeType: string, preview: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isManualFormOpen, setIsManualFormOpen] = useState(false);
  const [isTrendsOpen, setIsTrendsOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isSolarOpen, setIsSolarOpen] = useState(false);
  const [isSlabGuideOpen, setIsSlabGuideOpen] = useState(false);

  const [billHistory, setBillHistory] = useState<BillRecord[]>(() => {
    const saved = localStorage.getItem('bill_buddy_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Peak Hour Logic
  const [isPeakHour, setIsPeakHour] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeUntilNext, setTimeUntilNext] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      const hours = now.getHours();
      const mins = now.getMinutes();
      const secs = now.getSeconds();
      const currentTotalSecs = hours * 3600 + mins * 60 + secs;

      // Pakistan Peak Hours: 6:00 PM (18:00) to 10:00 PM (22:00)
      const peakStartSecs = 18 * 3600;
      const peakEndSecs = 22 * 3600;

      let nextTransitionSecs = 0;
      let status = false;

      if (currentTotalSecs >= peakStartSecs && currentTotalSecs < peakEndSecs) {
        // Currently in Peak
        status = true;
        nextTransitionSecs = peakEndSecs - currentTotalSecs;
      } else if (currentTotalSecs < peakStartSecs) {
        // Before Peak
        status = false;
        nextTransitionSecs = peakStartSecs - currentTotalSecs;
      } else {
        // After Peak, next one is tomorrow
        status = false;
        nextTransitionSecs = (24 * 3600 - currentTotalSecs) + peakStartSecs;
      }

      const h = Math.floor(nextTransitionSecs / 3600);
      const m = Math.floor((nextTransitionSecs % 3600) / 60);
      const s = nextTransitionSecs % 60;
      
      setTimeUntilNext(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      setIsPeakHour(status);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [manualBillData, setManualBillData] = useState({
    units: '',
    amount: '',
    month: '',
    taxes: ''
  });

  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        text: welcomeMessages[language],
        timestamp: new Date(),
      },
    ]);
  }, []);

  useEffect(() => {
    localStorage.setItem('bill_buddy_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    setMessages(prev => {
      // If the conversation is just the automated welcome, replace it. 
      // If user has started chatting, we don't want to replace current messages, 
      // but we could update the first message if it's the welcome one.
      return prev.map(msg => 
        msg.id === 'welcome' ? { ...msg, text: welcomeMessages[language] } : msg
      );
    });
  }, [language]);

  useEffect(() => {
    localStorage.setItem('bill_buddy_history', JSON.stringify(billHistory));
  }, [billHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const textToUse = overrideText || inputValue;
    if (!textToUse.trim() && !selectedImage) return;

    const userMessageText = textToUse.trim();
    const userMessageImage = selectedImage?.preview;
    const currentId = Math.random().toString(36).substring(7);

    const newUserMessage: Message = {
      id: currentId,
      role: 'user',
      text: userMessageText,
      image: userMessageImage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInputValue('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      // Prepare history for Gemini
      const history: ChatMessage[] = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const languageInstruction = `Please respond in ${language}. `;
      const responseText = await sendMessage(
        languageInstruction + userMessageText,
        history,
        selectedImage ? { data: selectedImage.data, mimeType: selectedImage.mimeType } : undefined
      );

      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          role: 'model',
          text: responseText,
          timestamp: new Date(),
        },
      ]);

      // Simple regex extraction for auto-history
      const unitsMatch = responseText.match(/Total Units:\*\*? (\d+)/i);
      const amountMatch = responseText.match(/Total Amount:\*\*? Rs\. (\d+(?:,\d+)*)/i);
      const monthMatch = responseText.match(/Billing Month:\*\*? ([A-Za-z]+ \d{4})/i);

      if (unitsMatch && amountMatch && monthMatch) {
        const units = parseFloat(unitsMatch[1]);
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        const month = monthMatch[1];
        
        // Avoid duplicates (crude check)
        setBillHistory(prev => {
          const exists = prev.find(b => b.month === month && b.units === units);
          if (exists) return prev;
          
          const newRecord: BillRecord = {
            id: Math.random().toString(36).substring(7),
            units,
            amount,
            month,
            timestamp: new Date().toISOString()
          };
          return [...prev, newRecord].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        });
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: 'error',
          role: 'model',
          text: "Maaf kijiye, kuch masla ho gaya hai. Dobara koshish karein.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { units, amount, month, taxes } = manualBillData;
    
    // Save to history
    const newRecord: BillRecord = {
      id: Math.random().toString(36).substring(7),
      units: parseFloat(units),
      amount: parseFloat(amount),
      month: month,
      timestamp: new Date().toISOString()
    };
    setBillHistory(prev => [...prev, newRecord].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));

    const formattedMessage = `Mera manual bill data ye hai:
- **Units:** ${units}
- **Amount:** Rs. ${amount}
- **Month:** ${month}
${taxes ? `- **Extra Taxes/Charges:** ${taxes}` : ''}

Is bill ko analyze karein aur samjhaein.`;

    handleSendMessage(undefined, formattedMessage);
    setIsManualFormOpen(false);
    setManualBillData({ units: '', amount: '', month: '', taxes: '' });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const data = base64.split(',')[1];
        setSelectedImage({
          data,
          mimeType: file.type,
          preview: base64
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={cn(
      "flex flex-col h-screen font-sans transition-colors duration-300",
      isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#F8FAFC] text-slate-900"
    )}>
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 md:px-4 py-2 md:py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm transition-colors">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-600 p-1.5 md:p-2 rounded-xl">
            <Zap className="text-white w-4 h-4 md:w-5 md:h-5 shadow-inner" />
          </div>
          <div>
            <h1 className="font-bold text-base md:text-lg leading-tight text-emerald-900 dark:text-emerald-400">BillBuddy</h1>
            <p className="hidden xs:block text-[9px] md:text-[10px] uppercase tracking-wider font-semibold text-emerald-600 dark:text-emerald-500">Smart AI Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-lg transition-colors outline-none"
          >
            {isDarkMode ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
          </button>
          
          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 md:p-1 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
            {(['English', 'Urdu', 'Roman Urdu'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={cn(
                  "px-1.5 md:px-2 py-1 text-[9px] md:text-[10px] font-bold rounded-lg transition-all whitespace-nowrap",
                  language === lang 
                    ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                {lang === 'Roman Urdu' ? (
                  <>
                    <span className="hidden sm:inline">Roman Urdu</span>
                    <span className="sm:hidden">Rom</span>
                  </>
                ) : lang === 'English' ? (
                  <>
                    <span className="hidden sm:inline">English</span>
                    <span className="sm:hidden">Eng</span>
                  </>
                ) : lang}
              </button>
            ))}
          </div>

          <button 
            onClick={() => setIsTrendsOpen(true)}
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Analysis Trends"
          >
            <LineChartIcon className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </header>

      {/* Peak Hour Tracker */}
      <div className={cn(
        "px-4 py-2 flex items-center justify-between transition-colors duration-500",
        isPeakHour 
          ? "bg-rose-50 dark:bg-rose-950/30 border-b border-rose-100 dark:border-rose-900/50" 
          : "bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/50"
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full animate-pulse",
            isPeakHour ? "bg-rose-500" : "bg-emerald-500"
          )} />
          <span className={cn(
            "text-[11px] font-bold uppercase tracking-widest",
            isPeakHour ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
          )}>
            {language === 'Urdu' ? (
              isPeakHour 
                ? `پیک آورز جاری ہیں (${timeUntilNext} باقی)` 
                : `آف پیک ٹائم ہے (پیک ${timeUntilNext} میں شروع ہو گا)`
            ) : language === 'Roman Urdu' ? (
              isPeakHour 
                ? `PAEK HOURS ACTIVE (Ends in ${timeUntilNext})` 
                : `OFF-PEAK (Peak starts in ${timeUntilNext})`
            ) : (
              isPeakHour 
                ? `PEAK HOURS ACTIVE (Ends in ${timeUntilNext})` 
                : `OFF-PEAK (Peak starts in ${timeUntilNext})`
            )}
          </span>
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* Tool Navigation Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex gap-3 overflow-x-auto no-scrollbar transition-colors">
        <ToolButton 
          icon={<Zap className="w-4 h-4" />} 
          label="Appliance Cal" 
          onClick={() => setIsCalculatorOpen(true)}
          color="amber"
        />
        <ToolButton 
          icon={<Sparkles className="w-4 h-4" />} 
          label="Solar Estimator" 
          onClick={() => setIsSolarOpen(true)}
          color="blue"
        />
        <ToolButton 
          icon={<TrendingDown className="w-4 h-4" />} 
          label="Unit Slabs" 
          onClick={() => setIsSlabGuideOpen(true)}
          color="indigo"
        />
      </div>

      {/* Hero / Quick Tips (Optional, shown above chat or as part of welcome) */}
      
      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth"
      >
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex flex-col max-w-[85%] md:max-w-[70%]",
                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              {msg.role === 'model' && (
                <div className="flex items-center gap-1.5 mb-1 ml-1">
                  <div className="bg-emerald-100 dark:bg-emerald-900/50 p-1 rounded-full">
                    <Bot className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">BillBuddy</span>
                </div>
              )}

              <div 
                dir={language === 'Urdu' ? 'rtl' : 'ltr'}
                className={cn(
                  "rounded-2xl p-4 shadow-sm transition-colors",
                  msg.role === 'user' 
                    ? "bg-slate-800 text-white rounded-tr-none shadow-slate-900/10" 
                    : "bg-slate-600 dark:bg-slate-800/80 border border-slate-500 dark:border-slate-700 text-white dark:text-slate-200 rounded-tl-none font-medium",
                  language === 'Urdu' && "text-right"
                )}
              >
                {msg.image && (
                  <div className="mb-3 rounded-lg overflow-hidden border border-slate-200/20 dark:border-slate-700 shadow-inner">
                    <img src={msg.image} alt="Bill" className="w-full max-h-60 object-contain bg-slate-50 dark:bg-slate-900 transition-colors" />
                  </div>
                )}
                <div className={cn(
                  "prose prose-sm max-w-none leading-relaxed",
                  msg.role === 'user' ? "prose-invert" : "text-slate-700 dark:text-slate-300 prose-dark"
                )}>
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              </div>
              
              <span className="text-[9px] mt-1.5 text-slate-400 dark:text-slate-500 font-medium px-2">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400"
          >
            <div className="flex gap-1.5 px-3 py-4 bg-slate-100 dark:bg-slate-800/50 rounded-2xl">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider italic opacity-80">
              {language === 'Urdu' ? "بڈی سوچ رہا ہے..." : language === 'Roman Urdu' ? "Buddy soch raha hai..." : "Buddy is thinking..."}
            </span>
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <footer className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 safe-bottom transition-colors">
        {selectedImage && (
          <div className="relative inline-block mb-3 p-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 transition-colors">
            <img 
              src={selectedImage.preview} 
              alt="Preview" 
              className="h-20 w-20 object-cover rounded-lg shadow-sm" 
            />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-lg border-2 border-white dark:border-slate-900 hover:bg-rose-600 transition-all scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImageSelect}
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "p-3 rounded-full transition-all active:scale-95",
              selectedImage ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            )}
          >
            <ImageIcon className="w-6 h-6" />
          </button>
          
          <div className="flex-1 relative">
            <input 
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={language === 'Urdu' ? "سوال پوچھیں یا بل شیئر کریں..." : language === 'Roman Urdu' ? "Sawaal puchiye ya bill share karein..." : "Ask a question or share a bill..."}
              dir={language === 'Urdu' ? 'rtl' : 'ltr'}
              className={cn(
                "w-full bg-slate-100 dark:bg-slate-800 border-none rounded-2xl py-3 px-4 pr-12 focus:ring-2 focus:ring-emerald-500/20 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all",
                language === 'Urdu' && "text-right"
              )}
            />
          </div>

          <button 
            type="submit"
            disabled={(!inputValue.trim() && !selectedImage) || isLoading}
            className={cn(
              "p-3 rounded-full shadow-md transition-all active:scale-90 disabled:opacity-50",
              "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/20 outline-none"
            )}
          >
            <Send className="w-6 h-6" />
          </button>
        </form>
        
        <div className="mt-3 flex gap-4 overflow-x-auto pb-1 no-scrollbar" dir={language === 'Urdu' ? 'rtl' : 'ltr'}>
          <QuickAction 
            icon={<Sparkles className="w-3 h-3" />} 
            label={language === 'Urdu' ? "بل سمجھائیں" : language === 'Roman Urdu' ? "Bill Samjhaein" : "Explain Bill"} 
            onClick={() => setInputValue(language === 'Urdu' ? "میرا بل سمجھا دیں پلیز۔" : language === 'Roman Urdu' ? "Mera bill samjha dein please." : "Please explain my bill.")} 
          />
          <QuickAction 
            icon={<TrendingDown className="w-3 h-3" />} 
            label={language === 'Urdu' ? "پیسہ کیسے بچے گا؟" : language === 'Roman Urdu' ? "Paisa kaise bachega?" : "How to save money?"} 
            onClick={() => setInputValue(language === 'Urdu' ? "زیادہ پیسے کیسے بچائے جا سکتے ہیں؟" : language === 'Roman Urdu' ? "Ziyada paise kaisay bachaye ja saktay hain?" : "How can I save more money on my bills?")} 
          />
          <QuickAction 
            icon={<Receipt className="w-3 h-3" />} 
            label={language === 'Urdu' ? "پیک آورز کب ہیں؟" : language === 'Roman Urdu' ? "Peak Hours kab hain?" : "Peak Hours Timing?"} 
            onClick={() => setInputValue(language === 'Urdu' ? "پیک آورز اور آف پیک آورز کا ٹائمنگ بتائیں۔" : language === 'Roman Urdu' ? "Peak hours aur off-peak hours ka timing bataein." : "Tell me about peak and off-peak hour timings.")} 
          />
          <QuickAction 
            icon={<Info className="w-3 h-3" />} 
            label={language === 'Urdu' ? "خود فراہم کریں" : language === 'Roman Urdu' ? "Manual Entry" : "Manual Entry"} 
            onClick={() => setIsManualFormOpen(true)} 
          />
        </div>
      </footer>

      {/* Manual Bill Form Modal */}
      <AnimatePresence>
        {isManualFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800"
            >
              <div className="bg-emerald-600 p-6 text-white flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">Manual Bill Entry</h2>
                  <p className="text-emerald-100 text-xs">Apne bill ki details yahan likhein</p>
                </div>
                <button 
                  onClick={() => setIsManualFormOpen(false)}
                  className="p-2 hover:bg-emerald-700 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Units Consumed</label>
                    <input 
                      required
                      type="number"
                      placeholder="e.g. 350"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                      value={manualBillData.units}
                      onChange={(e) => setManualBillData({...manualBillData, units: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Total Amount (Rs.)</label>
                    <input 
                      required
                      type="number"
                      placeholder="e.g. 15000"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                      value={manualBillData.amount}
                      onChange={(e) => setManualBillData({...manualBillData, amount: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Billing Month</label>
                  <input 
                    required
                    type="text"
                    placeholder="e.g. June 2024"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                    value={manualBillData.month}
                    onChange={(e) => setManualBillData({...manualBillData, month: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Extra Taxes/Charges (Optional)</label>
                  <textarea 
                    placeholder="e.g. Fuel adjustment, PTV fee etc."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none h-24"
                    value={manualBillData.taxes}
                    onChange={(e) => setManualBillData({...manualBillData, taxes: e.target.value})}
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Zap className="w-5 h-5 fill-current" />
                  Analyze Bill
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Trends Visualization Modal */}
      <AnimatePresence>
        {isTrendsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col"
            >
              <div className="bg-slate-900 dark:bg-slate-950 p-6 text-white flex justify-between items-center transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30">
                    <TrendingDown className="text-emerald-400 w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold italic tracking-tight">Consumption Trends</h2>
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Waqt ke saath bijli ka istemal</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsTrendsOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50 dark:bg-slate-950/20 transition-colors">
                {billHistory.length > 0 ? (
                  <>
                    {/* Units Trend */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-colors">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Units Consumed
                      </h3>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={billHistory}>
                            <defs>
                              <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#334155" : "#E2E8F0"} />
                            <XAxis 
                              dataKey="month" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fontWeight: 600, fill: isDarkMode ? '#94A3B8' : '#64748B' }} 
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fontWeight: 600, fill: isDarkMode ? '#94A3B8' : '#64748B' }} 
                            />
                            <Tooltip 
                              contentStyle={{ 
                                borderRadius: '12px', 
                                border: 'none', 
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                                color: isDarkMode ? '#f1f5f9' : '#1e293b'
                              }} 
                              itemStyle={{ color: isDarkMode ? '#f1f5f9' : '#1e293b' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="units" 
                              stroke="#10b981" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorUnits)" 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Cost Trend */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-colors">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-blue-500" />
                        Billing Amount (PKR)
                      </h3>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={billHistory}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#334155" : "#E2E8F0"} />
                            <XAxis 
                              dataKey="month" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fontWeight: 600, fill: isDarkMode ? '#94A3B8' : '#64748B' }} 
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fontWeight: 600, fill: isDarkMode ? '#94A3B8' : '#64748B' }} 
                            />
                            <Tooltip 
                              cursor={{ fill: isDarkMode ? '#334155' : '#F1F5F9' }}
                              contentStyle={{ 
                                borderRadius: '12px', 
                                border: 'none', 
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                                color: isDarkMode ? '#f1f5f9' : '#1e293b'
                              }} 
                            />
                            <Bar 
                              dataKey="amount" 
                              fill="#3b82f6" 
                              radius={[6, 6, 0, 0]}
                              barSize={40}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* History Table */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
                      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center transition-colors">
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Bill History</h3>
                        <button 
                          onClick={() => {
                            if(confirm("Full history clear kar dein?")) setBillHistory([]);
                          }}
                          className="text-rose-500 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="divide-y divide-slate-50 dark:divide-slate-700">
                        {billHistory.map((bill) => (
                          <div key={bill.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-100">{bill.month}</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{new Date(bill.timestamp).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-emerald-600 dark:text-emerald-400">{bill.units} Units</p>
                              <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Rs. {bill.amount.toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-20 text-center space-y-4">
                    <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                      <LineChartIcon className="w-8 h-8 text-slate-300" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">No History Yet</h4>
                      <p className="text-sm text-slate-500">Apne bills add karein trends dekhne ke liye.</p>
                    </div>
                    <button 
                      onClick={() => { setIsTrendsOpen(false); setIsManualFormOpen(true); }}
                      className="text-emerald-600 font-bold text-sm hover:underline"
                    >
                      Add First Bill
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Slab Guide Modal */}
      <AnimatePresence>
        {isSlabGuideOpen && <SlabGuide onClose={() => setIsSlabGuideOpen(false)} />}
      </AnimatePresence>

      {/* Appliance Calculator Modal */}
      <AnimatePresence>
        {isCalculatorOpen && <ApplianceCalculator onClose={() => setIsCalculatorOpen(false)} />}
      </AnimatePresence>

      {/* Solar Estimator Modal */}
      <AnimatePresence>
        {isSolarOpen && (
          <SolarEstimator 
            onClose={() => setIsSolarOpen(false)} 
            latestUnits={billHistory.length > 0 ? billHistory[billHistory.length - 1].units : undefined} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolButton({ icon, label, onClick, color }: { icon: React.ReactNode, label: string, onClick: () => void, color: string }) {
  const colorMap: Record<string, string> = {
    amber: "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-900/30",
    blue: "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900/30",
    indigo: "bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/30",
  };

  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 whitespace-nowrap shadow-sm",
        colorMap[color]
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// Appliance Usage Calculator Component
function ApplianceCalculator({ onClose }: { onClose: () => void }) {
  const [selectedAppliances, setSelectedAppliances] = useState<any[]>([]);
  
  const appliancesList = [
    { name: "AC (1.5 Ton Non-Inverter)", watts: 1800 },
    { name: "AC (1.5 Ton Inverter)", watts: 800 },
    { name: "Fridge (Large)", watts: 300 },
    { name: "Iron", watts: 1000 },
    { name: "Water Pump (1 HP)", watts: 750 },
    { name: "Ceiling Fan", watts: 80 },
    { name: "LED Bulb", watts: 12 },
    { name: "Laptop/TV", watts: 100 },
  ];

  const addAppliance = (app: any) => {
    setSelectedAppliances([...selectedAppliances, { ...app, id: Math.random(), hours: 5 }]);
  };

  const updateHours = (id: number, hours: number) => {
    setSelectedAppliances(selectedAppliances.map(a => a.id === id ? { ...a, hours } : a));
  };

  const removeAppliance = (id: number) => {
    setSelectedAppliances(selectedAppliances.filter(a => a.id !== id));
  };

  const totalUnitsPerMonth = selectedAppliances.reduce((acc, curr) => {
    return acc + ((curr.watts * curr.hours * 30) / 1000);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col transition-colors">
        <div className="bg-amber-500 p-6 text-white flex justify-between items-center transition-colors">
          <div>
            <h2 className="text-xl font-bold">Appliance Calculator</h2>
            <p className="text-amber-100 text-xs text-balance">Kaunsa cheez aapka bill barha rahi hai?</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-amber-600 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-2">
            {appliancesList.map(app => (
              <button 
                key={app.name} 
                onClick={() => addAppliance(app)}
                className="text-[11px] font-bold p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-200 dark:hover:border-amber-800 transition-all text-left text-slate-800 dark:text-slate-100"
              >
                + {app.name}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {selectedAppliances.map(app => (
              <div key={app.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-sm transition-colors">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{app.name}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">{app.watts} Watts</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end border-r border-slate-100 dark:border-slate-700 pr-3">
                    <input 
                      type="number" 
                      value={app.hours} 
                      onChange={(e) => updateHours(app.id, parseFloat(e.target.value) || 0)}
                      className="w-16 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-center text-sm font-bold text-slate-900 dark:text-slate-100 transition-colors"
                    />
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">Hours/Day</span>
                  </div>
                  <button onClick={() => removeAppliance(app.id)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">Estimate Units (Monthly)</span>
            <span className="text-2xl font-black text-amber-600 dark:text-amber-500">{totalUnitsPerMonth.toFixed(0)} <span className="text-sm font-bold">Units</span></span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium italic">Ye estimate 30 din ke istemal par mabni hai.</p>
        </div>
      </motion.div>
    </div>
  );
}

// Solar Estimator Component
function SolarEstimator({ onClose, latestUnits }: { onClose: () => void, latestUnits?: number }) {
  const [units, setUnits] = useState(latestUnits || 400);
  
  // Basic Pakistani Solar logic: 1kW produces ~130 units/month in Pakistan
  const neededKW = Math.ceil(units / 130);
  const estimatedCost = neededKW * 180000; // ~1.8 Lakh per kW (Current market estimates for quality systems)
  const monthlySaving = units * 48; // Average effective unit rate Rs. 48
  
  const paybackYears = estimatedCost / (monthlySaving * 12);
  const progressPercentage = Math.min(100, (1 / paybackYears) * 100 * 2); // Visual representation of speed of ROI

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col transition-colors">
        <div className="bg-blue-600 p-6 text-white flex justify-between items-center transition-colors">
          <div>
            <h2 className="text-xl font-bold">Solar ROI Estimator</h2>
            <p className="text-blue-100 text-xs">Mera bill zero kaise hoga?</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-blue-700 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </div>
        
        <div className="p-6 space-y-8">
          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Average Monthly Units</label>
            <input 
              type="range" min="100" max="2000" step="50" 
              value={units} 
              onChange={(e) => setUnits(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600 transition-colors"
            />
            <div className="flex justify-between items-center text-3xl font-black text-slate-800 dark:text-slate-100 transition-colors">
              <span>{units}</span>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Units</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 transition-colors">
              <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Recommended System</p>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{neededKW} kW</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900/50 transition-colors">
              <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Monthly Saving</p>
              <p className="text-xl font-black text-blue-700 dark:text-blue-300">Rs. {(monthlySaving / 1000).toFixed(1)}k</p>
            </div>
          </div>

          <div className="p-4 bg-slate-900 dark:bg-slate-800/80 rounded-2xl text-white transition-colors">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-slate-400 dark:text-slate-400 font-bold italic">Payback Period</span>
              <span className="text-amber-400 font-black">~{paybackYears.toFixed(1)} Years</span>
            </div>
            <div className="w-full bg-slate-800 dark:bg-slate-700 rounded-full h-2 mt-3 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progressPercentage}%` }}
                className="bg-amber-400 h-full rounded-full" 
              />
            </div>
            <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-2 font-medium italic">Based on approx investment of Rs. {estimatedCost.toLocaleString()}</p>
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed italic text-center transition-colors transition-colors">
            Pakistan mein 1kW solar takreeban 130 units mahana banata hai. Ye estimate net metering aur average rates par mabni hai.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// Slab Guide Component
function SlabGuide({ onClose }: { onClose: () => void }) {
  const slabs = [
    { range: "1 - 100", rate: "Rs. 16.48", label: "Protected" },
    { range: "101 - 200", rate: "Rs. 22.95", label: "Protected" },
    { range: "201 - 300", rate: "Rs. 32.03", label: "Unprotected" },
    { range: "301 - 400", rate: "Rs. 37.35", label: "High" },
    { range: "401 - 500", rate: "Rs. 40.24", label: "Very High" },
    { range: "501 - 600", rate: "Rs. 42.09", label: "Max" },
    { range: "601 - 700", rate: "Rs. 43.87", label: "Max" },
    { range: "700+", rate: "Rs. 50.41", label: "Max" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 transition-colors">
        <div className="bg-indigo-600 p-6 text-white flex justify-between items-center transition-colors">
          <div>
            <h2 className="text-xl font-bold">Electricity Slab Guide</h2>
            <p className="text-indigo-100 text-xs italic">Slabs mahangay kyun hotay hain?</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-indigo-700 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </div>
        
        <div className="p-6">
          <div className="space-y-2 mb-6">
            {slabs.map((slab, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-100 dark:hover:border-indigo-800 transition-colors">
                <div className="w-16 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">{slab.range}</div>
                <div className="flex-1 font-bold text-slate-800 dark:text-slate-100 transition-colors">{slab.rate} <span className="text-[9px] text-slate-400">/ unit</span></div>
                <div className={cn(
                  "px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider",
                  slab.label === "Protected" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : 
                  slab.label === "High" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"
                )}>
                  {slab.label}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-4 transition-colors">
             <p className="text-xs font-bold text-indigo-900 dark:text-indigo-400 mb-1 flex items-center gap-2">
               <Info className="w-3 h-3" /> Note:
             </p>
             <p className="text-[10px] text-indigo-700 dark:text-indigo-500 leading-relaxed italic">
               Agar aap ne 6 mahine lagatar 200 units se kam istemal kiye, toh aap "Protected" slab mein rehte hain (ye sasta hai). Ek baar 200 cross hua, toh sary slabs tabdeel ho saktay hain.
             </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-[11px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-200 dark:hover:border-emerald-800 hover:text-emerald-700 dark:hover:text-emerald-400 transition-all active:scale-95 shadow-sm transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
