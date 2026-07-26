import { useCallback } from "react";
import { useI18n } from "./i18n";
import { useToast } from "./toast";

// useReloadToast returns a function that reports whether a mutation reloaded
// nginx: a success toast when it did, a warning when the reload failed. Call it
// after every mutation that can reload (save, delete, rename), passing the API
// result, so the user always knows when the change went live.
export function useReloadToast() {
  const { t } = useI18n();
  const toast = useToast();
  return useCallback(
    (res: { reloaded?: boolean; reloadError?: string }) => {
      if (res.reloaded) toast(t.reloaded);
      else if (res.reloadError) toast(t.reloadFailed, "warn");
    },
    [t, toast],
  );
}
