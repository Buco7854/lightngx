import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, TerminalIcon, XIcon } from "../icons";
import { useI18n } from "../i18n";
import { Btn, IconBtn } from "../ui";

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
  const [copied, setCopied] = useState(false);

  const show = useCallback((title: string, text: string) => {
    setCopied(false);
    setOutput({ title, text });
  }, []);

  async function copy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output.text);
      setCopied(true);
    } catch {
      /* clipboard blocked — the pre is selectable as a fallback */
    }
  }

  return (
    <OutputContext.Provider value={show}>
      {children}
      {output && (
        <div className="anim-slide-up fixed inset-x-0 bottom-0 z-40 flex max-h-[45dvh] flex-col rounded-t-2xl border-t border-line bg-panel elev-3">
          <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5 min-[761px]:px-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ctrl text-dim">
              <TerminalIcon size={15} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{output.title}</span>
            <Btn size="sm" onClick={copy}>
              {copied ? (
                <>
                  <CheckIcon size={14} /> {t.copied}
                </>
              ) : (
                <>
                  <CopyIcon size={14} /> {t.copy}
                </>
              )}
            </Btn>
            <IconBtn size="sm" onClick={() => setOutput(null)} aria-label={t.close} title={t.close}>
              <XIcon size={16} />
            </IconBtn>
          </header>
          <pre className="m-0 overflow-auto bg-inset px-3 py-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap select-text min-[761px]:px-4">
            {output.text}
          </pre>
        </div>
      )}
    </OutputContext.Provider>
  );
}
