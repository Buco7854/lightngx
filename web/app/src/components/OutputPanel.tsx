import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { Btn } from "../ui";

interface Output {
  title: string;
  text: string;
}

const OutputContext = createContext<(title: string, text: string) => void>(() => {});

export function useOutput() {
  return useContext(OutputContext);
}

// Bottom sheet showing raw nginx -t / reload output when something fails
// (or when the user asks for a test).
export function OutputProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [output, setOutput] = useState<Output | null>(null);

  const show = useCallback((title: string, text: string) => {
    setOutput({ title, text });
  }, []);

  return (
    <OutputContext.Provider value={show}>
      {children}
      {output && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex max-h-[45dvh] flex-col border-t border-line bg-panel shadow-2xl">
          <header className="flex items-center justify-between border-b border-line px-3.5 py-2 text-[13.5px] font-semibold">
            <span>{output.title}</span>
            <Btn variant="ghost" className="min-h-[30px] px-2.5 text-xs" onClick={() => setOutput(null)}>
              {t.close}
            </Btn>
          </header>
          <pre className="overflow-auto whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-[12.5px]">
            {output.text}
          </pre>
        </div>
      )}
    </OutputContext.Provider>
  );
}
