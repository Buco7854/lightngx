import { useRef } from "react";
import { api, ApiError } from "./api";
import { usePrompt } from "./confirm";
import { useI18n } from "./i18n";
import { useToast } from "./toast";

export function useReauthenticate() {
  const prompt = usePrompt();
  const { t } = useI18n();
  const toast = useToast();
  const pending = useRef(false);
  return async () => {
    if (pending.current) return false;
    pending.current = true;
    try {
      if (!(await api.reauthStatus()).required) return true;
      const password = await prompt({
        title: t.reauthenticate,
        label: t.currentPassword,
        type: "password",
        confirmLabel: t.confirm,
      });
      if (password === null) return false;
      await api.reauthenticate(password);
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t.actionFailed, "error");
      return false;
    } finally {
      pending.current = false;
    }
  };
}
