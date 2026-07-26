import { useI18n } from "../i18n";
import { MenuItem, SplitButton } from "../ui";

// SaveButton: the editor's split Save control. The primary button saves with
// the app default (LN_DEFAULT_RELOAD_ON_SAVE); the dropdown forces or skips
// the reload for one save and marks which is the default. Shared by the config
// and site/stream editors.
export default function SaveButton({
  save,
  saving,
  disabled,
  defaultReload,
}: {
  save: (reload?: boolean) => void;
  saving: boolean;
  disabled: boolean;
  defaultReload: boolean;
}) {
  const { t } = useI18n();
  const tag = <span className="ml-auto shrink-0 text-[11px] text-dim">{t.defaultChoice}</span>;
  return (
    <SplitButton
      onClick={() => save()}
      disabled={disabled}
      loading={saving}
      label={t.save}
      menuAriaLabel={t.saveOptions}
    >
      {(close) => (
        <>
          <MenuItem
            onClick={() => {
              close();
              save(true);
            }}
          >
            {t.saveReload}
            {defaultReload && tag}
          </MenuItem>
          <MenuItem
            onClick={() => {
              close();
              save(false);
            }}
          >
            {t.saveNoReload}
            {!defaultReload && tag}
          </MenuItem>
        </>
      )}
    </SplitButton>
  );
}
